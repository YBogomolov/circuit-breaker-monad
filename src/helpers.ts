import { IORef } from 'fp-ts/lib/IORef';

import {
  BreakerClosed,
  BreakerOpen,
  BreakerStatus,
} from './types';

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
 * Gets current time as UTC timestamp
 */
export const getCurrentTime = () => new IORef(Date.now());
