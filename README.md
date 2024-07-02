# testnow
Simple unit testing for Typescript

## Installation

Use npm:

```
npm install --save-dev testnow
```

## Configuration

### package.json
Assuming your tests are located in the folder `js/tests/` in your project, add this "test" task to your scripts in `package.json`:

```json
{
  ...
  "scripts": {
    "test": "testnow js/tests/",
    ...
  },
  ...
}
```

In a nutshell:
- **testnow** recursively goes through the given folder and will run the tests of all encountered files, provided they are .js or .cjs or .mjs files. Any other extension is ignored.
- **testnow**  does not recompile your TS test files. You probably have a watcher with your own build setup anyway. In case you do not, you can use the [watcher of Typescript](https://www.typescriptlang.org/docs/handbook/configuring-watch.html) or you can prefix the "test" command itself like so, to force TS compilation before running your tests:
  ```
  "test": "tsc --project tsconfig.json & testnow js/tests/"
  ```
  Note however that this approach recompiles your whole project so it may be slow if you have a lot of files.

### Command-line options

- `onlyLastModified` <strictly-positive-integer>
  
  The latest time of modification of a test file must be below the given number, in *milliseconds*. This allows you to focus on the tests you are currently writing by leaving out irrelevant test files. In addition, it also quickens the whole test execution.

  Passing the integer is optional. Default value is **1800000ms = 30min**.

  Example:
  ```
  "test": "testnow js/tests/ onlyLastModified 800000"
  ```

- `skipTimeboxedTests`

  Every test with a specified timeout will be skipped. The rationale is that:
  - if a test requires a timeout, then it must take quite some time compared to other tests
  - such tests should be rare
  
  Under these assumptions, `skipTimeboxedTests` is a thus a way to quicken the whole test execution while leaving out few tests.
  
  To give some perspective, at the time of this writing, I have about 6300 tests free of timeout. They take a bit less than 10 seconds to run, meaning a test takes on average 1.6ms. On the other hand, the lowest timeout I have is 50ms, others are around 200ms and some are even higher (1s and 10s). So, worst case scenario, the lowest timeboxed test takes *31 more time than a regular test*. The thing is, if one timeboxed test for a given function has degraded performance or even hits the timeout, chances are all the other timeboxed tests for this function have degraded performance as well.
  
  `skipTimeboxedTests` is a nice option to use when you know the timeboxed tests pass and when you now need to focus on writing other, non-timeboxed tests.

  Example:
  ```
  "test": "testnow js/tests/ skipTimeboxedTests"
  ```



# Aliases

Note that you can pass the options to the call `npm test` too. Meaning that it is a good idea to declare the "test" script as:
```
"test": "testnow js/tests/"
```

And then to setup specific aliases to pass the options. I recommand at least these two:

```bash
alias nt='clear && npm test onlyLastModified skipTimeboxedTests' # quick and focused tests
alias nta='clear && npm test' # executes all the tests
```

# Writing tests

## Basic example

Assuming this code in file `ts/sources/pathname.ts`:

```typescript
export function normalizePathname(pathname: string): string {
  // => no backslash in pathname, only slashes
  return pathname.replace(/\\/gu, '/')
}
```

You can define your tests in `ts/tests/pathname/normalizePathname.ts` like this:

```typescript
import { $ } from "testnow"
import { normalizePathname } from "../../sources/pathname"

$(normalizePathname, '').equals('')
$(normalizePathname, 'foo\\').equals('foo/')
$(normalizePathname, 'foo\\bar').equals('foo/bar')
$(normalizePathname, 'foo\\bar\\').equals('foo/bar')
/*-------------------------------  ------ ---------
            ^                         ^       ^
        call specification          check     expected value
*/
```

## API

There are two call specifications:
1. `$(fn, ...arguments)`: will perform the call `fn(...arguments)` and wait for its completion.
2. `$.stopPast(number, fn, ...arguments)`: will perform the call `fn(...arguments)` and wait for *&lt;number>* milliseconds before considering the test to have timed out. Uses [Promise.race](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race) and **so only works for asynchronous functions**.

:white_check_mark: Note that both uses of `$` are type-checked: you will get an error if the type of one of the arguments does not match the type specified on the function.

There are two checks:
| Check    | When to use it?                   | Expected value | Comparison         |
| -------- | --------------------------------- | -------------- | ------------------ |
| `equals` | when the call is supposed to work | any value      | [isDeepStrictEqual](https://nodejs.org/dist/latest-v20.x/docs/api/util.html#utilisdeepstrictequalval1-val2): you can thus pass any object, array, map, etc. |
| `throws` | when the call is supposed to fail | an error class | class must match ; no comparison done on the actual fields of the instance |

:warning: If you forget the check part, **testnow** silently skips the call specification and it won't even appear in the test statistics at the end.

:white_check_mark: The result is also type-checked, which is particularly useful when it is a complex object. There is one case where type-checking has some troubles though... Refer to the section [Typechecking issue with overload](HOWTO.md#typechecking-issue-with-overload).