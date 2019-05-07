import { expect } from 'chai';
import fetchMock from 'fetch-mock';
import { either, fold } from 'fp-ts/lib/Either';
import { constant } from 'fp-ts/lib/function';
import { IORef } from 'fp-ts/lib/IORef';
import { delay, task } from 'fp-ts/lib/Task';
import 'mocha';

import { breakerClosed } from './helpers';
import { circuitBreaker, defaultBreakerOptions, singletonBreaker } from './index';
import { BreakerClosed } from './types';

const ADDRESS = 'http://example.com';
const yep = constant('yep');
const nope = constant('nope');

describe('Circuit Breaker', () => {
  after(() => {
    fetchMock.reset();
  });

  it('should handle promise resolution', (done) => {
    const fetcher = circuitBreaker<string>()(defaultBreakerOptions);
    const [result] = fetcher({
      request: () => Promise.resolve('ok'),
      breakerState: new IORef(new BreakerClosed(0)),
    });
    result().then(
      (res) => either.bimap(
        res,
        (err) => done(err),
        (_) => done(),
      ),
    );
  });

  it('should handle promise rejection', (done) => {
    const fetcher = circuitBreaker<string>()(defaultBreakerOptions);
    const [result] = fetcher({
      request: () => Promise.reject('not ok'),
      breakerState: new IORef(new BreakerClosed(0)),
    });
    result().then(
      (res) => either.bimap(
        res,
        (_) => done(),
        (s) => done(`should not resolve: ${s}`),
      ),
    );
  });

  it('should handle promise rejection with Error', (done) => {
    const error = new Error('not ok');
    const fetcher = circuitBreaker<string>()(defaultBreakerOptions);
    const [result] = fetcher({
      request: () => Promise.reject(error),
      breakerState: new IORef(new BreakerClosed(0)),
    });
    result().then(
      (res) => either.bimap(
        res,
        (l: Error) => {
          expect(l).to.equal(error);
          done();
        },
        (s) => done(`should not resolve: ${s}`),
      ),
    );
  });

  it('should resolve after a series of failing calls', async () => {
    const fetch = fetchMock
      .sandbox()
      .mock(ADDRESS, Promise.reject('oops'), { repeat: 2 })
      .mock(ADDRESS, Promise.resolve('ok'), { overwriteRoutes: false });
    const options = { maxBreakerFailures: 1, resetTimeoutSecs: 1, breakerDescription: '' };
    const fetcher = circuitBreaker<Response>()(options);

    const [result1, { breakerState }] = fetcher({
      request: () => fetch(ADDRESS),
      breakerState: new IORef(breakerClosed(0)),
    });
    await result1();
    expect(breakerState.read().tag).to.equal('Closed');
    const [result2] = fetcher({ request: () => fetch(ADDRESS), breakerState });
    await result2();
    expect(breakerState.read().tag).to.equal('Open');
    await delay(1000, task.of(''))();
    const [result] = fetcher({ request: () => fetch(ADDRESS), breakerState });
    const r3 = await result();

    expect(fold(nope, yep)(r3)).to.equal('yep');
    expect(breakerState.read().tag).to.equal('Closed');
  });

  it('should mutate internal singleton breaker state', async () => {
    const fetch = fetchMock
      .sandbox()
      .mock(ADDRESS, Promise.reject('oops'), { repeat: 2 })
      .mock(ADDRESS, Promise.resolve('ok'), { overwriteRoutes: false });
    const options = { maxBreakerFailures: 1, resetTimeoutSecs: 2, breakerDescription: 'open' };
    const promise = () => fetch(ADDRESS);

    // This is a fetcher with MUTABLE internal state using a clojure:
    const fetcher = singletonBreaker(options);

    const resultTE1 = fetcher(promise);
    const resultE1 = await resultTE1();
    expect(fold(nope, yep)(resultE1)).to.equal('nope');

    const resultTE2 = fetcher(promise);
    const resultE2 = await resultTE2();
    expect(fold(nope, yep)(resultE2)).to.equal('nope');

    await delay(1000, task.of(''))();
    const resultTE3 = fetcher(promise);
    const resultE3 = await resultTE3();
    expect(fold<Error, Response, string>((e) => e.message, yep)(resultE3)).to.equal('open');

    await delay(1000, task.of(''))();
    const resultTE4 = fetcher(promise);
    const resultE4 = await resultTE4();
    expect(fold<Error, Response, string>((e) => e.message, yep)(resultE4)).to.equal('yep');
  });
});
