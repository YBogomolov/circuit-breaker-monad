// Adapted implementation of https://hackage.haskell.org/package/glue-core-0.4.2/docs/src/Glue-CircuitBreaker.html

import { io, IO } from 'fp-ts/lib/IO';
import { IORef } from 'fp-ts/lib/IORef';
import { Reader } from 'fp-ts/lib/Reader';
import { fromIO, TaskEither, tryCatch } from 'fp-ts/lib/TaskEither';

import {
  breakerClosed,
  breakerOpen,
  getCurrentTime,
} from './helpers';
import {
  BreakerError,
  BreakerOptions,
  BreakerStatus,
  Enhanced,
  Request,
} from './types';

export const circuitBreaker = <T>() => new Reader<BreakerOptions, Enhanced<T>>(
  (opts: BreakerOptions) => {
    const failingCall = (): TaskEither<BreakerError, T> => {
      throw new BreakerError(opts.breakerDescription);
    };

    const incErrors = (ref: IORef<BreakerStatus>): IO<void> => getCurrentTime().read.chain(
      (currentTime) => ref.read.chain(
        (status) => {
          switch (status.tag) {
            case 'Closed': {
              const errorCount = status.errorCount;
              if (errorCount >= opts.maxBreakerFailures) {
                return ref.write(breakerOpen(currentTime + (opts.resetTimeoutSecs)));
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

    const callIfClosed = (request: Request<T>, ref: IORef<BreakerStatus>): TaskEither<BreakerError, T> =>
      tryCatch(request, (reason) => {
        incErrors(ref);
        throw new BreakerError(String(reason));
      });

    const canaryCall = (request: Request<T>, ref: IORef<BreakerStatus>): TaskEither<BreakerError, T> =>
      callIfClosed(request, ref).chain(
        (result: T) => {
          ref.write(breakerClosed(0));
          return fromIO(io.of(result));
        },
      );

    const callIfOpen = (request: Request<T>, ref: IORef<BreakerStatus>): TaskEither<BreakerError, T> =>
      fromIO<BreakerError, boolean>(getCurrentTime().read.chain(
        (currentTime) => ref.read.chain(
          (status) => {
            switch (status.tag) {
              case 'Closed':
                ref.write(status);
                return io.of(false);
              case 'Open': {
                if (currentTime > status.timeOpened) {
                  ref.write(breakerOpen(currentTime + opts.resetTimeoutSecs));
                  return io.of(true);
                }
                ref.write(status);
                return io.of(false);
              }
            }
          },
        ),
      )).chain(
        (canaryRequest) => canaryRequest ? canaryCall(request, ref) : failingCall(),
      );

    const breakerService = (ref: IORef<BreakerStatus>) => (request: Request<T>): TaskEither<BreakerError, T> =>
      fromIO<BreakerError, BreakerStatus>(ref.read).chain(
        (status: BreakerStatus) => {
          switch (status.tag) {
            case 'Closed':
              return callIfClosed(request, ref);
            case 'Open':
              return callIfOpen(request, ref);
          }
        },
      );

    return breakerService(new IORef(breakerClosed(0)));
  },
);
