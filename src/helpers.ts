import { IORef } from 'fp-ts/lib/IORef';

import { BreakerClosed, BreakerOpen } from './types';

/**
 * Creates a new instance of BreakerClosed class
 * @param errorCount Number of errors encountered up to this time
 */
export const breakerClosed = (errorCount: number) => new BreakerClosed(errorCount);

/**
 * Creates a new instance of BreakerOpen class
 * @param openEndTime Time when breaker opening ends
 */
export const breakerOpen = (openEndTime: number) => new BreakerOpen(openEndTime);

/**
 * Gets current time as UTC timestamp
 */
export const getCurrentTime = () => new IORef(Date.now());
