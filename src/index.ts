// Adapted implementation of https://hackage.haskell.org/package/glue-core-0.4.2/docs/src/Glue-CircuitBreaker.html

import { constFalse, constTrue, Lazy } from 'fp-ts/lib/function';
import { io, IO } from 'fp-ts/lib/IO';
import { IORef } from 'fp-ts/lib/IORef';
import { Reader } from 'fp-ts/lib/Reader';
import { fromIO, fromLeft, TaskEither, tryCatch } from 'fp-ts/lib/TaskEither';

import { breakerClosed, breakerOpen, getCurrentTime } from './helpers';
import { BreakerOptions, BreakerState, EnhancedFetch } from './types';

/**
 * Default circuit breaker options
 */
export const defaultBreakerOptions: BreakerOptions = {
  maxBreakerFailures: 3,
  resetTimeoutSecs: 60,
  breakerDescription: 'Circuit breaker is open',
};

export const circuitBreaker = <T>() => new Reader<BreakerOptions, EnhancedFetch<T>>(
  (opts: BreakerOptions) => {
    const failingCall = (): TaskEither<Error, T> => fromLeft(new Error(opts.breakerDescription));

    const incErrors = (ref: IORef<BreakerState>): IO<void> => getCurrentTime().read.chain(
      (currentTime) => ref.read.chain(
        (state) => {
          switch (state.tag) {
            case 'Closed': {
              const errorCount = state.errorCount;
              if (errorCount >= opts.maxBreakerFailures) {
                return ref.write(breakerOpen(currentTime + (opts.resetTimeoutSecs * 1000)));
              } else {
                return ref.write(breakerClosed(errorCount + 1));
              }
            }
            case 'Open': {
              return io.of<void>(undefined);
            }
          }
        },
      ),
    );

    const callIfClosed = (request: Lazy<Promise<T>>, ref: IORef<BreakerState>): TaskEither<Error, T> =>
      tryCatch(request, (reason) =>
        incErrors(ref).map(() => (reason instanceof Error) ? reason : new Error(String(reason))).run());

    const canaryCall = (request: Lazy<Promise<T>>, ref: IORef<BreakerState>): TaskEither<Error, T> =>
      callIfClosed(request, ref).chain((result: T) => fromIO(ref.write(breakerClosed(0)).chain(() => io.of(result))));

    const callIfOpen = (request: Lazy<Promise<T>>, ref: IORef<BreakerState>): TaskEither<Error, T> =>
      fromIO<Error, boolean>(getCurrentTime().read.chain(
        (currentTime) => ref.read.chain(
          (state) => {
            switch (state.tag) {
              case 'Closed':
                return ref.write(state).map(constFalse);
              case 'Open': {
                if (currentTime > state.openEndTime) {
                  return ref.write(breakerOpen(currentTime + (opts.resetTimeoutSecs * 1000))).map(constTrue);
                }
                return ref.write(state).map(constFalse);
              }
            }
          },
        ),
      )).chain(
        (canaryRequest) => canaryRequest ? canaryCall(request, ref) : failingCall(),
      );

    const breakerService = (
      request: Lazy<Promise<T>>,
      ref: IORef<BreakerState> = new IORef(breakerClosed(0)),
    ): [IORef<BreakerState>, TaskEither<Error, T>] =>
      [ref, fromIO<Error, BreakerState>(ref.read).chain(
        (state: BreakerState) => {
          switch (state.tag) {
            case 'Closed':
              return callIfClosed(request, ref);
            case 'Open':
              return callIfOpen(request, ref);
          }
        },
      )];

    return breakerService;
  },
);
