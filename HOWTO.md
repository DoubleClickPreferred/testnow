# How-to

- [Utility files](HOWTO.md#utility-files)
- [Registering test cases](HOWTO.md#registering-test-cases)
  - [Parallel inputs & outputs](HOWTO.md#parallel-inputs--outputs)
  - [Range of inputs](HOWTO.md#range-of-inputs)
  - [Parametrized test cases](HOWTO.md#parametrized-test-cases)
- [Proxies](HOWTO.md#proxy-functions)
  - [Output + intermediate values n°1](HOWTO.md#output--intermediate-values-n1)
  - [Output + intermediate values n°2](HOWTO.md#output--intermediate-values-n2)
  - [Scenario](HOWTO.md#scenario)
  - [One-time scenario](HOWTO.md#one-time-scenario)
  - [Output + additional characteristic](HOWTO.md#output--additional-characteristic)
  - [Property](HOWTO.md#property)
- [Interactive object with proxy methods](HOWTO.md#interactive-object-with-proxy-methods)
- [Typechecking issue with overload](HOWTO.md#typechecking-issue-with-overload)
  - [The problem](HOWTO.md#the-problem)
  - [Solution n°1, aka the easiest: add an overload for the general case](HOWTO.md#solution-n1-aka-the-easiest-add-an-overload-for-the-general-case)
  - [Solution n°2, aka the tedious: one utility function per overload](HOWTO.md#solution-n2-aka-the-tedious-one-utility-function-per-overload)
  - [Solution n°3, aka the efficient but ugly: one utility function accepting the most general case](HOWTO.md#solution-n3-aka-the-efficient-but-ugly-one-utility-function-accepting-the-most-general-case)

## Utility files

*Just don't declare any test cases*.

Utility files contains only data & functions to be used across several of your real test files. **testnow** will still import the file but, upon discovering that no test cases exist, **testnow** will ignore it.

## Registering test cases

The common principle behind the following cases is this: *write a function doing the calls to `$` for you*.

### Parallel inputs & outputs

Here is an example of testing a decode function for [base32hex](https://en.wikipedia.org/wiki/Base32#Base_32_Encoding_with_Extended_Hex_Alphabet_per_§7). Inputs and outputs are in a [utility file](#utility-files) since I also use them to test encoding functions:

```typescript
export function checkDecode(
  fn: (string: string) => string,
  inputs: Array<string>,
  expectedOutputs: Array<string>,
): void {
  for (let offset = 0; offset < inputs.length && offset < expectedOutputs.length; offset++) {
    // registering as many test cases as needed
    $(fn, inputs[offset] as string).equals(expectedOutputs[offset] as string)
  }
}

// register all tests for Ascii
checkDecode(base32hexDecode, BASE32HEX_ASCII_STRINGS, ASCII_STRINGS)

// register all tests for UTF8
checkDecode(base32hexDecode, BASE32HEX_UTF8_STRINGS, UTF8_STRINGS)
```

### Range of inputs

The `base32hexDecode` from above must throw on a wide range of inputs. Hence this code:

```typescript
function shouldThrow(firstByte: number, lastByte: number): void {
  for (let number = firstByte; number <= lastByte; number++) {
    let string = base32hexEncodeBytes([number])
    $(base32hexDecode, string).throws(InvalidUtf8Error)
  }
}

// should throw when decoding a 10xxxxxx number
shouldThrow(0b10000000, 0b10111111)

// should throw when decoding a 11111xxx number
shouldThrow(0b11111000, 0b11111111)
```

### Parametrized test cases

The utility function can define specific test cases: their actual execution differs by the parameters of the utility function.

Context: I was studying a "stream" library, for reactive programming. A stream holds of value, plus other streams needing this value. When you update a stream with a new value, it automatically refreshes all the dependent streams. They, in turn, do the same. But when the new value is *undefined* or a special *SKIP* symbol, no update happens. I want to test that so I made a [proxy function](HOWTO.md#proxy-functions) called *testSingleValue* which accepts these two values in addition to regular data. It also accepts *null*, which makes it skip calling the stream. **This way, I can verify that calling the stream with *undefined* or *SKIP* does the same as not calling the stream at all.**

```typescript
// the stream doubles the value we provide
$(testSingleValue, 2, 3).equals({
  result: 6,      // final value
  values: [4, 6] // ordered sequence of all values
})

type SkipValues = null | undefined | typeof SKIP

function series_testSingleValue(i: SkipValues): void {
  $(testSingleValue, i, i).equals({ result: SKIP, values: [] }) // = stream always in 'skipped' state
  $(testSingleValue, i, 2).equals({ result: 4, values: [4] })   // = stream starts in 'skipped' state then resumes
  $(testSingleValue, 2, i).equals({ result: 4, values: [4] })   // = stream starts with 2 then skips the update
}

series_testSingleValue(null)
series_testSingleValue(undefined)
series_testSingleValue(SKIP)
```

## Proxy functions

A proxy is the opposite of a function registering test cases:
- it never calls `$`
- the tested function is hard-coded in it
- it becomes a tested function too, as it is meant as an intermediary -a proxy- to the real tested function

Proxy functions are very useful and of course extremely versatile as you program them without any limitation. The needs that prompt the definition of a proxy function are diverse:
- collecting some intermediate values
- defining a scenario, *i.e.* a parametrized sequence of calls to the tested function
- checking against the original inputs, if the tested function modifies them
- checking a property

### Output + intermediate values n°1

Here is how the `testSingleValue` from above is defined:

```typescript
function testSingleValue(initialNumber: SkippedValue<number>, nextNumber: SkippedValue<number>) {
  var rootStream = initialNumber === null ? makeStream<number>() : makeStream(initialNumber)
  var values: Array<number> = []

  // 'doubled' is the dependent stream that we are checking, which doubles the number from rootStream
  var doubled = lift((n: number) => enlist(values, n * 2), rootStream)

  if (nextNumber !== null) {
    rootStream(nextNumber)
  }

  return { result: doubled(), values }
}

...

series_testSingleValue(null)      // verify results obtained by NOT calling the stream
series_testSingleValue(undefined) // verify results obtained by calling the stream with undefined (first neutral value)
series_testSingleValue(SKIP)      // verify results obtained by calling the stream with undefined (second neutral value)
```

### Output + intermediate values n°2

Here is a second example showing a comprehensive output. I have my own configurable `copyFolder` function (depth limit, filter out folders, etc.). With a proxy function, I can check everything **in one test** as the output collects all the data:

```typescript
$(check, SOURCE_1_TEST_DATA_FOLDER, TARGET_TEST_DATA_FOLDER, {}).equals({
  absoluteFolder: TARGET_TEST_DATA_FOLDER,
  doesExistByFolderPathname: {
    '': true,
    'folder-A/': true,
  },
  fileContentByFilePathname: {
    'file-A.txt': 'file-A-1',
    'file-B.txt': 'file-B-1',
    'file-C.txt': 'file-C-1',
    'folder-A/fileA-A.txt': 'fileA-A-1',
    'folder-A/fileA-B.txt': 'fileA-B-1',
  },
})
```

### Scenario

In a way, the `testSingleValue` proxy function above was defining a scenario, albeit a very small one. Here is a bigger one:

```typescript
function setThenGet<T>(value1: T, value2: T, value3: T): MyStream_SetThenGet_Result<T> {
  var stream: MyStream<T>, values: Array<T>, expectedSetterResults: Array<boolean>

  // initialize
  stream = s(value1)
  values = [stream.get()]
  expectedSetterResults = []

  // set value2 then get
  expectedSetterResults.push(stream.set(value2) === stream)
  values.push(stream.get())

  // set value3 then get
  expectedSetterResults.push(stream.set(value3) === stream)
  values.push(stream.get())

  return {
    values,
    expectedSetterResults,
  }
}

$(setThenGet, 1, 2, 3).equals({
  values: [1, 2, 3],
  expectedSetterResults: [true, true],
})
```

### One-time scenario

For a one-time scenario, *if it is small*, you may use an anonymous function.

When reporting results, **testnow** prints out the call to the tested function. For instance, the test `$(my_addition, 1, 2).equals(3)` reports as `my_addition(1, 2)` in the console. If the function is anonymous, **testnow** cannot print the call so it prints the whole function. *Just put a comment on top of the function to describe the test*.

```typescript
$((): number => {
  // once a stream is closed, it ceases to forward updates but it forwards the initial value
  var stream = s(2)
  var doubled = makeDoublingStream(stream)

  stream.close()
  stream.set(3)

  return doubled.get()
}).equals(4)
```

### Output + additional characteristic

In Javascript, there is the method [Object.assign(target, ...sources)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign) which copies all fields from each source into the target object. *But it does not recurse into the source objects*:

```typescript
target = {
  foo: {
    a: 1,
    b: 2
  }
}

Object.assign(target, {
  foo: {
    b: 20,
    c: 3
  }
})
// => 'a' is lost as 'target.foo' was overriden with { b: 20, c: 3 }
```

I worked on a function `mergeInto` to have this recursion and also have the 'target' object be preserved rather than modified in-place:

```typescript
mergeInto(target, {
  foo: {
    b: 20,
    c: 3
  }
})
// => returns { foo: { a: 1, b: 20, c: 3 }} AND target is unchanged
```

The proxy function makes a clone of the target beforehand, and return a 'preserved' flag:

```typescript
function testMergeIntoObject<S>(target: S, ...patches: Array<...>) {
  var referenceTarget:S = structuredClone(target)
  var result:S = mergeInto(target, ...patches) // first mergeInto
  var preserved = util.isDeepStrictEqual(target, referenceTarget) // then check target is not modified

  return { result, preserved }
}

function preserved<S>(result: S) {
  return { result, preserved: true }
}

$(testMergeIntoObject, { foo: 1 }, { foo: 2 }).equals(preserved({ foo: 2 }))
$(testMergeIntoObject, { foo: 1, bar: 10 }, { foo: 2 }).equals(preserved({ foo: 2, bar: 10 }))
```

### Property

I was writing a `serialize` function. Naturally, it comes with a `deserialize` function, which must be its exact opposite. So I wrote a proxy function to validate this property:

```typescript
function proxy_serialize(value: unknown): boolean {
  return util.isDeepStrictEqual(value, deserialize(serialize(value)))
}

$(proxy_serialize, null).equals(true)
$(proxy_serialize, undefined).equals(true)

// boolean
$(proxy_serialize, true).equals(true)
$(proxy_serialize, false).equals(true)
...
```

I could have done an automatic registration, since the result is almost always true:

```typescript
function proxy_serialize(value: unknown): boolean {
  return util.isDeepStrictEqual(value, deserialize(serialize(value)))
}

function checkSymmetry(...values: Array<unknown>):void {
  for(let value of values) {
    $(proxy_serialize, value).equals(true)
  }
}

checkSymmetry(null, undefined, true, false, ...)
```

## Interactive object with proxy methods

Proxy functions are nice when a clear sequence of instructions need to be tested. If you need more control, build an interactive object whose methods serve as proxy functions. 

Here is an example regarding a `debounce` function, which ensures that multiple calls to a given function results in only one actual true call during a given time window.

```typescript
function makeTrackedDebouncedFunction(name: string, waitTime: number, options: DebounceOptions) {
  var callCount: number, timer: Timer, debouncedFunction: DebouncingFunction<(string: string) => string>

  callCount = 0
  timer = makeManualTimer()
  debouncedFunction = debounce(
    (string: string) => {
      callCount++
      return string
    },
    waitTime,
    { ...options, timer },
  )

  return {
    getNamedCallCount(): string {
      return `${name} ${callCount}`
    },
    cancel(): { cancelled: boolean; state: string } {
      var state = `${name} ${callCount}` // computed before calling cancel()
      return {
        cancelled: debouncedFunction.cancel(),
        state,
      }
    },
    timer,
    debouncedFunction,
  }
}

// situation 1: function only called once
// A. last call only
const A1 = makeTrackedDebouncedFunction('A1', 20, { lastCall: true })
$(A1.debouncedFunction, 'A1_1').equals(null) // null => inner function was not called
$(A1.getNamedCallCount).equals('A1 0')       // callCount zero => yes, inner function was not called
$(A1.timer.add, 10).equals(10)               // = 10 milliseconds later
$(A1.getNamedCallCount).equals('A1 0')       // inner function still not called
$(A1.timer.add, 10).equals(20)               // = 10 milliseconds later, so 20 in total
$(A1.getNamedCallCount).equals('A1 1')       // configured time reached => inner function called
$(A1.debouncedFunction.flush).equals('A1_1') // retrieve the result of the inner function

...

// C. first call only
const C1 = makeTrackedDebouncedFunction('C1', 20, { firstCall: true, lastCall: false })
$(C1.debouncedFunction, 'C1_1').equals('C1_1') // inner function called right away
$(C1.getNamedCallCount).equals('C1 1')         // confirmed
$(C1.timer.add, 10).equals(10)
$(C1.getNamedCallCount).equals('C1 1')
$(C1.timer.add, 10).equals(20)
$(C1.getNamedCallCount).equals('C1 1')
$(C1.debouncedFunction.flush).equals(null)    // result was already consumed before
```

# Typechecking issue with overload

## The problem

An unfortunate typechecking issue may arise, though it is unusual as only for functions with [overloads](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-overloads), i.e. functions with different facets.

For instance, I have specific types for paths to files and folders. Among these types: *AbsoluteFile* & *RelativeFile*. I have a function to replace the file name and, of course, if you pass an *AbsoluteFile*, you get back an *AbsoluteFile* and if you pass a *RelativeFile*, you get back a *RelativeFile* since only the name of the file is changed.

Overloads are made for this kind of situations and are written like this:

```typescript
function replaceFileName(fileName: string, fileItem: AbsoluteFile): AbsoluteFile
/*                                         ----------------------   ------------
                                           ^                        v
                                           put in an AbsoluteFile   get back an AbsoluteFile
*/
function replaceFileName(fileName: string, fileItem: RelativeFile): RelativeFile
/*                                         ----------------------   ------------
                                           ^                        v
                                           put in a RelativeFile    get back a RelativeFile
*/
function replaceFileName(fileName: string, fileItem: AbsoluteFile | RelativeFile): AbsoluteFile | RelativeFile {
  // implementation code
}
```

The `$` function of **testnow** is typed in such a way that it gathers the types of inputs and the types of the parameters of the function. This allows Typescript to do the proper inferences. But it fails with overloads *when the general case is not proposed*.

Indeed, the last signature is **not** an overload: it **only** describes the implementation code. And the other signatures **only** describe the calls to the function. So you read overloads as two sections:

```typescript
// ---- how to call the function
function replaceFileName(fileName: string, fileItem: AbsoluteFile): AbsoluteFile
function replaceFileName(fileName: string, fileItem: RelativeFile): RelativeFile
// ---- how the implementation works
function replaceFileName(fileName: string, fileItem: AbsoluteFile | RelativeFile): AbsoluteFile | RelativeFile {// signature to type the implementation code
  ...
}
```

Here, the implementation says *"I can work with either an AbsoluteFile or a RelativeFile, and I'll return either one too"*. But if you call `replaceFileName`, you won't be allowed to pass a union of AbsoluteFile and RelativeFile: you have to know *exactly* in which case you are. **This is the situation that `$` cannot properly type-check**.

## Solution n°1, aka the easiest: add an overload for the general case

```typescript
function replaceFileName(fileName: string, fileItem: AbsoluteFile): AbsoluteFile
function replaceFileName(fileName: string, fileItem: RelativeFile): RelativeFile
function replaceFileName(fileName: string, fileItem: AbsoluteFile | RelativeFile): AbsoluteFile | RelativeFile
function replaceFileName(fileName: string, fileItem: AbsoluteFile | RelativeFile): AbsoluteFile | RelativeFile {
  // the code
}
```

The last two signatures look weird. But remember that the first one allows the function to be used in the most general way while the second one is for the implementation code only.

As a general rule, I'm always leaving out the most general case from the overloads by default, until an real use case justifies its inclusion. And testing things is not "real" in my opinion, so I rarely pick this solution.

## Solution n°2, aka the tedious: one utility function per overload

Type-checking is at maximum precision.

```typescript
// case AbsoluteFile
function proxy1_replaceFullFileName(fileName: string, fileItem: AbsoluteFile): AbsoluteFile {
  return replaceFileName(fileName, fileItem)
}

$(proxy1_replaceFullFileName, ...).equals(...)
$(proxy1_replaceFullFileName, ...).equals(...)
...

// case RelativeFile
function proxy2_replaceFullFileName(fileName: string, fileItem: RelativeFile): RelativeFile {
  return replaceFileName(fileName, fileItem)
}

$(proxy2_replaceFullFileName, ...).equals(...)
$(proxy2_replaceFullFileName, ...).equals(...)
...
```

## Solution n°3, aka the efficient but ugly: one utility function accepting the most general case

The code is ugly because of the repetitions and precision of type-checking is lost. Sometimes though, none of this mattered so this approach is fine.

```typescript
function proxy_replaceFullFileName(fileName: string, fileItem: FileItem): FileItem {
  if(fileItem.absolute) {
    return replaceFileName(fileName, fileItem) // fileItem is for sure an AbsoluteFile
  } else {
    return replaceFileName(fileName, fileItem) // fileItem is for sure an RelativeFile
  }
}
```