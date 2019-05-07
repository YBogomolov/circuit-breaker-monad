import { left } from 'fp-ts/lib/Either';
import { constFalse, constTrue, Lazy, pipeOp as pipe } from 'fp-ts/lib/function';
import * as IO from 'fp-ts/lib/IO';
import { IORef, newIORef } from 'fp-ts/lib/IORef';
import { State } from 'fp-ts/lib/State';
import * as TE from 'fp-ts/lib/TaskEither';

import { breakerClosed, breakerOpen, getCurrentTime } from './helpers';
import { BreakerEnvironment, BreakerOptions, BreakerState, CircuitBreaker } from './types';

/**
 * Default circuit breaker options
 */
export const defaultBreakerOptions: BreakerOptions = {
  maxBreakerFailures: 3,
  resetTimeoutSecs: 60,
  breakerDescription: 'Circuit breaker is open',
};

export const circuitBreaker = <T>(): CircuitBreaker<T> => (opts: BreakerOptions) => {
  const failingCall = (): TE.TaskEither<Error, T> => TE.fromEither(left(new Error(opts.breakerDescription)));

  const incErrors = (ref: IORef<BreakerState>) =>
    pipe(
      getCurrentTime().read,
      IO.chain((currentTime) => pipe(
        ref.read,
        IO.chain((state) => {
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
              return IO.of<void>(undefined);
            }
          }
        }),
      )),
    );

  const callIfClosed = (request: Lazy<Promise<T>>, ref: IORef<BreakerState>): TE.TaskEither<Error, T> =>
    TE.tryCatch(
      request,
      (reason) => pipe(
        incErrors(ref),
        IO.map<void, Error>(() => (reason instanceof Error) ? reason : new Error(String(reason))),
      )(),
    );

  const canaryCall = (request: Lazy<Promise<T>>, ref: IORef<BreakerState>): TE.TaskEither<Error, T> =>
    pipe(
      callIfClosed(request, ref),
      TE.chain((result: T) => pipe(
        ref.write(breakerClosed(0)),
        IO.chain(() => IO.of(result)),
        (a) => TE.taskEither.fromIO(a),
      )),
    );

  const callIfOpen = (request: Lazy<Promise<T>>, ref: IORef<BreakerState>): TE.TaskEither<Error, T> =>
    pipe(
      getCurrentTime().read,
      IO.chain((currentTime) => pipe(
        ref.read,
        IO.chain((state) => {
          switch (state.tag) {
            case 'Closed':
              return pipe(ref.write(state), IO.map(constFalse));
            case 'Open': {
              if (currentTime > state.openEndTime) {
                return pipe(ref.write(breakerOpen(currentTime + (opts.resetTimeoutSecs * 1000))), IO.map(constTrue));
              }
              return pipe(ref.write(state), IO.map(constFalse));
            }
          }
        })),
      ),
      (a) => TE.taskEither.fromIO<Error, boolean>(a),
      TE.chain((canaryRequest) => canaryRequest ? canaryCall(request, ref) : failingCall()),
    );

  const breakerService: State<BreakerEnvironment<T>, TE.TaskEither<Error, T>> =
    ({ breakerState, request }) => [
      pipe(
        breakerState.read,
        (a) => TE.taskEither.fromIO<Error, BreakerState>(a),
        TE.chain((state: BreakerState) => {
          switch (state.tag) {
            case 'Closed':
              return callIfClosed(request, breakerState);
            case 'Open':
              return callIfOpen(request, breakerState);
          }
        }),
      ),
      { breakerState, request },
    ];

  return breakerService;
};

/**
 * Gets a singleton circuit breaker with clojure-bound state.
 * @param opts Breaker options
 */
export const singletonBreaker = (opts: BreakerOptions) => {
  const breakerState = newIORef(breakerClosed(0))();
  return <T>(request: Lazy<Promise<T>>): TE.TaskEither<Error, T> =>
    circuitBreaker<T>()(opts)({ request, breakerState })[0];
};
