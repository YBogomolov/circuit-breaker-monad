import { IORef } from 'fp-ts/lib/IORef';

import {
  BreakerClosed,
  BreakerOpen,
  BreakerOptions,
  BreakerState,
  BreakerStatus,
} from './types';

/**
 * Default circuit breaker options
 */
export const defaultBreakerOptions: BreakerOptions = {
  maxBreakerFailures: 3,
  resetTimeoutSecs: 60,
  breakerDescription: 'Circuit breaker is closed',
};

/**
 * Creates a new instance of BreakerClosed class
 * @param errorCount Number of errors encountered up to this time
 */
export const breakerClosed = (errorCount: number) => new BreakerClosed(errorCount);

/**
 * Creates a new instance of BreakerOpen class
 * @param timeOpened Number of breaker openings
 */
export const breakerOpen = (timeOpened: number) => new BreakerOpen(timeOpened);

/**
 * Checks whether circuit breaker status is open
 * @param status Circuit breaker status
 */
export const isStatusOpen = (status: BreakerStatus): status is BreakerOpen => status.tag === 'Open';

/**
 * Checks whether circuit breaker status is closed
 * @param status Circuit breaker status
 */
export const isStatusClosed = (status: BreakerStatus): status is BreakerClosed => status.tag === 'Closed';

/**
 * Checks whether circuit breaker state is open
 * @param state Circuit breaker state
 */
export const isBreakerOpen = (state: BreakerState): IORef<boolean> => {
  return state.reduce((acc, s) => {
    acc.write(acc.read.run() || s.read.map(isStatusOpen).run());
    return acc;
  }, new IORef(true));
};

/**
 * Checks whether circuit breaker state is closed
 * @param state Circuit breaker state
 */
export const isBreakerClosed = (state: BreakerState): IORef<boolean> => {
  return state.reduce((acc, s) => {
    acc.write(acc.read.run() && s.read.map(isStatusClosed).run());
    return acc;
  }, new IORef(true));
};

/**
 * Gets current time as UTC timestamp
 */
export const getCurrentTime = () => new IORef(Date.now());
