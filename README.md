# testnow
Simple unit testing for Typescript

- [Installation](README.md#installation)
- [Configuration](README.md#configuration)
  - [package.json](README.md#packagejson)
  - [Command-line options](README.md#command-line-options)
- [Aliases](README.md#aliases)
- [Writing tests](README.md#writing-tests)
  - [Basic example](README.md#basic-example)
  - [API](README.md#api)
  - [Organizing your tests](README.md#organizing-your-tests)
- [Advanced](README.md#advanced)
  - [Programmatic use](README.md#programmatic-use)
  - [Process](README.md#process)

## Installation

```
npm install --save-dev @click-click/testnow
```

## Configuration

### Type declaration of global variables

Just before running your tests, **testnow** will add its *TestCallSupervisor* as a global variable **$**. You need to tell Typescript about this global variable in your declaration file like so:

```typescript
import testnow from "@click-click/testnow"

declare global {
    var $: typeof testnow.$
}
```

### package.json
If Typescript outputs the JS files of your tests in **js/tests/**, set the "test" script in your package.json:

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
- **testnow** recursively goes through **js/tests/** and run the tests of all the files, provided they are *.js* or *.cjs* or *.mjs* files.
- **testnow**  does not recompile your TS test files. You may have a watcher with your own build setup. In case you do not, you can use the [watcher of Typescript](https://www.typescriptlang.org/docs/handbook/configuring-watch.html) or you can prefix the "test" command to force TS compilation before running your tests, like so:
  ```
  "test": "tsc --project tsconfig.json & testnow js/tests/"
  ```
  Note however that this approach recompiles your whole project so it may be slow if you have a lot of files.

### Command-line options

- `onlyLastModified <strictly-positive-integer>`
  
  If specified, **testnow** ignores any test file whose latest time of modification is above the given number (in *milliseconds*). This allows you to focus on the tests you are currently writing by leaving out past test files. It also quickens the whole test execution.

  The integer is optional. Default value is **1_800_000ms = 30min**.

  Example:
  ```
  "test": "testnow js/tests/ onlyLastModified 800000"
  ```

- `skipTimeboxedTests`

  If specified, **testnow** skips test with a timeout. The rationale is:
  - if a test requires a timeout, then it must take quite some time compared to other tests
  - such tests should be rare
  
  Under these assumptions, `skipTimeboxedTests` quickens the whole test execution at the cost of leaving out only a handful of tests.
  
  For some perspective, at the time of this writing, I have about 6300 tests free of timeout. They take a bit less than 10 seconds to run, meaning a test takes on average 1.6 milliseconds. On the other hand, the lowest timeout I have is 50ms, others are around 200ms and some are even higher (1s and 10s). So, worst case scenario, the lowest timeboxed test takes *31 more time than a regular test*. 
  
  Also, if one timeboxed test has degraded performance or even hits the timeout, it probably won't be alone. Case n°1 is that the tested function has issues, so all its other timeboxed tests will take longer too. Case n°2 is that the problem is deeper in your environment, in which case maybe all timeboxed tests will have degraded performance.
  
  `skipTimeboxedTests` is nice when you know the timeboxed tests pass and when you now need to focus on writing other, non-timeboxed tests.

  Example:
  ```
  "test": "testnow js/tests/ skipTimeboxedTests"
  ```



# Aliases

Since you can pass the options to `npm test` directly, it is a good idea to have a minimal call to **testnow** in the "test" script:
```
"test": "testnow js/tests/"
```

You can then design some specific aliases. I recommend these two:

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

This approach may seem limited but it is actually an open door to powerful ways of expressing tests: please refer to [the HOWTO](HOWTO.md) for more ideas.

## API

There are two call specifications:
1. `$(fn, ...arguments)`: will perform the call `fn(...arguments)` and wait for its completion.
2. `$.stopPast(number, fn, ...arguments)`: will perform the call `fn(...arguments)` and wait for *&lt;number>* milliseconds before considering the test to have timed out. Uses [Promise.race](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race) and **so only works for asynchronous functions**.

:white_check_mark: Note that both uses of `$` are type-checked: you will get an error if the type of one of the arguments does not match the type specified on the function.

There are two checks:
| Check    | When to use it?                     | Expected value | Comparison         |
| -------- | ----------------------------------- | -------------- | ------------------ |
| `equals` | when the call is expected to return | any value      | [isDeepStrictEqual](https://nodejs.org/dist/latest-v20.x/docs/api/util.html#utilisdeepstrictequalval1-val2): you can pass any object, array, map, etc. |
| `throws` | when the call is expected to throw  | an error class | class must match ; no comparison done on the actual fields of the instance |

:warning: If you forget the check part, **testnow** silently skips the call specification and it won't even appear in the test statistics at the end.

:white_check_mark: The result is also type-checked, which is particularly useful when it is a complex object. There is one case where type-checking has some troubles though... Refer to the section [Typechecking issue with overload](HOWTO.md#typechecking-issue-with-overload).

## Organizing your tests

**testnow** does not care about how your tests are organized, nor how your folders and files are named. Test files are just regular code files so you can import any function you want from any file you like. Here is the layout I personally used.

```
ts/
  sources/
    sourceNameA.ts -> file holding the functions 'foo' and 'bar'
    sourceNameB.ts -> file holding the function 'baz'
    ...

  tests/
    sourceNameA/
      foo.ts       -> test only the function 'foo'
      bar.ts       -> test only the function 'bar'
    sourceNameB/
      baz.ts       -> test only the function 'baz'
    ...
```

I have started to have other situations but I cannot provide any clear advice, as I'm still thinking this through (like testing a serializer: one test file actually checks that the *serialize* and *deserialize* functions are the opposite of one another).

**Crucially, as I very rarely use classes, I have not developed any particular organization for them.**

# Advanced

## Programmatic use

To run the tests from your own scripts, **testnow** exports 3 functions:
- `$` to declare a test case
- `executeTestCallsOfFolder` which has all the functional machinery to run the tests
- `executeTestCallsOfFolderByCommandLine` which calls the previous one after having parsed the command line and resolved the configuration to use

For reference, here is how is coded the 'testnow' binary script (for use in your package.json *scripts*):

```typescript
import('../dist/index.js').then((a) => {
    global.$ = a.$
    a.executeTestCallsOfFolderByCommandLine(a.$)
})
```

## Process

**testnow** scans the directory you have specified and look for appropriate files, that is:
1. any JS-like file: *.js* / *.cjs* / *.mjs*
2. with a young enough modification time (if you specified the option `onlyLastModified`)

If a file matches the above criteria, then it is [dynamically imported](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import):
- importing never execute the tests: the calls to `$` are only collecting test cases.
- if any code throws during the import, the collect of test cases is stopped and no test will run.
- if the import succeeded, the test cases are executed one by one, in the exact order of registration.

As a test file is a regular code file, you can use any code, not just calls to `$`. As such, it enables [some approaches documented in the HOWTO](HOWTO.md).