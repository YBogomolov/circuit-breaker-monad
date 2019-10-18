# Circuit Breaker pattern as a monad

[![npm](https://img.shields.io/npm/v/circuit-breaker-monad.svg)](https://www.npmjs.com/package/circuit-breaker-monad)
[![Build Status](https://travis-ci.org/YBogomolov/circuit-breaker-monad.svg?branch=master)](https://travis-ci.org/YBogomolov/circuit-breaker-monad)

Part of [fp-ts](https://github.com/gcanti/fp-ts) ecosystem.

TypeScript implementation of Circuit Breaker pattern. Adaptation of [Glue.CircuitBreaker](https://hackage.haskell.org/package/glue-core-0.4.2/docs/Glue-CircuitBreaker.html) module from Haskell.

You can read a bit more abou the pattern and this implementation [in my article](https://medium.com/@yuriybogomolov/circuit-breaker-in-a-functional-world-9c555c8e9527).

## Usage example

First of all, you need to install the package:

```sh
npm install circuit-breaker-monad
```

Then import the main `circuitBreaker` function:

```ts
import { circuitBreaker } from 'circuit-breaker-monad/lib';
```

This function returns a `Reader`, which, given the corresponding `BreakerOptions`, creates an enhanced fetcher – a function which takes any `Lazy<Promise<T>>` instance and returns a tuple of `IORef<BreakerStatus>` and `TaskEither<Error, T>`. The first element of this tuple is current circuit breaker status, implemented via `IORef` (mutable reference in the IO monad), and the second element of the tuple is ready-to-be-called `TaskEither`.

Let's look at the usage example:

```ts
import { fold } from 'fp-ts/lib/Either';
import { IORef } from 'fp-ts/lib/IORef';

import { circuitBreaker, defaultBreakerOptions } from '../src/index';
import { BreakerClosed } from '../src/types';

const fetcher = circuitBreaker<Response>()(defaultBreakerOptions);

const main = async () => {
  const request = () => fetch('http://my-domain.com/my-data.json').then((res) => res.json());
  const breakerState = new IORef(new BreakerClosed(0)); // initial breaker state
  const [result, ref] = fetcher({ request, breakerState });
  const response = await result();

  fold(
    (e: Error) => { },
    (myData) => { },
  )(response);

  // ref :: BreakerClosed { errorCount: 0 }
  // result :: TaskEither<Error, Response>
  // response :: Either<Error, Response>
  // myData :: TMyJsonData
};
```

The `ref` variable is resulting circuit breaker status, which can be passed to the next call, so you take the full control over what's going on inside the circuit breaker:

```ts
const [ref, result] = fetcher(promise);
const myData1 = await result();
const [, result2] = fetcher(promise, ref);
const myData2 = await result2();
// here `ref` may be 'Open' if the second call to the service has failed
```

### Configuration

Circuit breaker may be configured by passing these parameters to the Reader:

- `maxBreakerFailures` - how many times the underlying service must fail in the given window before the circuit opens;
- `resetTimeoutSecs` - the window of time in which the underlying service must fail for the circuit to open, seconds;
- `breakerDescription` - description that is attached to the failure so as to identify the particular circuit.

Default options are:

```ts
export const defaultBreakerOptions: BreakerOptions = {
  maxBreakerFailures: 3,
  resetTimeoutSecs: 60,
  breakerDescription: 'Circuit breaker is closed',
};
```
