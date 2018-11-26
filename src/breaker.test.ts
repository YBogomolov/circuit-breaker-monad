import 'mocha';

import { expect } from 'chai';
import fetchMock from 'fetch-mock';

import { delay } from 'fp-ts/lib/Task';
import { circuitBreaker, defaultBreakerOptions } from './index';

const ADDRESS = 'http://example.com';

describe('Circuit Breaker', () => {
  after(() => {
    fetchMock.reset();
  });

  it('should handle promise resolution', (done) => {
    const fetcher = circuitBreaker<string>().run(defaultBreakerOptions);
    const [, result] = fetcher(() => Promise.resolve('ok'));
    result.run().then(
      (res) => res.fold(
        done,
        (_) => done(),
      ),
    );
  });

  it('should handle promise rejection', (done) => {
    const fetcher = circuitBreaker<string>().run(defaultBreakerOptions);
    const [, result] = fetcher(() => Promise.reject('not ok'));
    result.run().then(
      (res) => res.fold(
        (_) => done(),
        (s) => done(`should not resolve: ${s}`),
      ),
    );
  });

  it('should handle promise rejection with Error', (done) => {
    const error = new Error('not ok');
    const fetcher = circuitBreaker<string>().run(defaultBreakerOptions);
    const [, result] = fetcher(() => Promise.reject(error));
    result.run().then(
      (res) => res.fold(
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
    const fetcher = circuitBreaker<Response>().run(options);

    const [ref, result1] = fetcher(() => fetch(ADDRESS));
    await result1.run();
    expect(ref.read.run().tag).to.equal('Closed');
    const [, result2] = fetcher(() => fetch(ADDRESS), ref);
    await result2.run();
    expect(ref.read.run().tag).to.equal('Open');
    await delay(1000, '').run();
    const [, result] = fetcher(() => fetch(ADDRESS), ref);
    const r3 = await result.run();
    expect(r3.fold(() => 'nope', () => 'yep')).to.equal('yep');
    expect(ref.read.run().tag).to.equal('Closed');
  });
});
