// tslint:disable:max-classes-per-file

import { Lazy } from 'fp-ts/lib/function';
import { IORef } from 'fp-ts/lib/IORef';
import { TaskEither } from 'fp-ts/lib/TaskEither';

/**
 * Options for determining behaviour of circuit breaking services.
 *
 * @export
 * @interface CircuitBreakerOptions
 */
export interface BreakerOptions {
  /**
   * How many times the underlying service must fail in the given window before the circuit opens.
   *
   * @type {number}
   * @memberof CircuitBreakerOptions
   */
  maxBreakerFailures: number;

  /**
   * The window of time in which the underlying service must fail for the circuit to open.
   *
   * @type {number}
   * @memberof CircuitBreakerOptions
   */
  resetTimeoutSecs: number;

  /**
   * Description that is attached to the failure so as to identify the particular circuit.
   *
   * @type {string}
   * @memberof CircuitBreakerOptions
   */
  breakerDescription: string;
}

/**
 * Closed circuit breaker status (normal operation mode)
 *
 * @export
 * @class BreakerClosed
 */
export class BreakerClosed {
  public readonly tag = 'Closed';
  constructor(public readonly errorCount: number) {}
}

/**
 * Open circuit break status (failure)
 *
 * @export
 * @class BreakerOpen
 */
export class BreakerOpen {
  public readonly tag = 'Open';
  constructor(public readonly timeOpened: number) {}
}

/**
 * Sum type corresponding to possible circuit breaker statuses: open or closed
 *
 * @export
 * @type BreakerStatus
 */
export type BreakerStatus = BreakerClosed | BreakerOpen;

/**
 * Enhanced request handler
 */
export type EnhancedFetch<T> =
  (request: Lazy<Promise<T>>, ref?: IORef<BreakerStatus>) => [IORef<BreakerStatus>, TaskEither<Error, T>];
