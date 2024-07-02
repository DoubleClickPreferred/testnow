# Advanced

This document details how to write tests that go beyond simple calls to `$`. That is, if writing a simple test case as `$(fn, ...arguments).equals(...)` is not checking enough things, or if it is tedious because you have a lot of cases to cover, this document presents some solutions.

## Programmatic use

To run the tests from within your own scripts, **testnow** exports 3 functions:
- `$` to declare a test case
- `executeTestCallsOfFolder` which has all the functional machinery to run the tests
- `executeTestCallsOfFolderByCommandLine` which calls the previous one after having parsed the command line and resolved the actual configuration to use

For reference, here is how is coded the 'testnow' binary script (for use in your package.json scripts field):

```typescript
const a = require('../dist/index')
a.executeTestCallsOfFolderByCommandLine(a.$)
```

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
      foo.ts -> test only the function 'foo'
      bar.ts -> test only the function 'bar'
    sourceNameB/
      baz.ts -> test only the function 'baz'
    ...
```

I have started to have other situations but I cannot advice you anything here, as I'm still thinking this through (like testing a serializer, one test file actually checks that the 'serialize' and 'deserialize' functions are the opposite of one another).

Crucially, as I very rarely use classes, I have not developed any particular organization for them.

## Process

**testnow** scans the directory you have specified and look for appropriate files, that is:
1. any JS-like file: *.js* / *.cjs* / *.mjs*
2. with a young enough modification time (if you specified the option `onlyLastModified`)

If a file matches the above criteria, then it is [dynamically imported](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import).

Simple tests will execute just fine. But a test file is actually a regular code file. You are free to put any code you want in it, not just calls to `$`. As such, it enables some approaches which I documented below. Before diving in, you need to have in mind this:

- the dynamic import only collects the test cases but it does not run any
- if any code throws while importing the file, the import fails and no test case will be registered, much less executed
- after the import, the test cases are executed one by one, in the exact order of registration
- the called function can safely throw, whether you uses `equals` or `throws`: it will never impact the subsequent test cases
- a test can fail to execute correctly for internal reason but this is safe too, as the rest of tests will run as usual

## Utility files

You can make utility files, that is files containing any data or functions to be used across several of your real test files.

*Just don't declare any test cases*.

**testnow** will still import the file but, upon discovering that no test cases exist, **testnow** will ignore it and move on to the next file.

## Utility functions registering test cases

### List of examples in parallel with a list of results

I was writing code about the [base32hex encoding](https://en.wikipedia.org/wiki/Base32#Base_32_Encoding_with_Extended_Hex_Alphabet_per_§7) and I had several decoding functions to test, as well as several data sets. In a [utility file](#utility-files), I declared both the inputs and the expected outputs, and I made a utility function which registers for me all the test cases:

```typescript
export function checkDecode(
  fn: (string: string) => string,
  inputs: Array<string>,
  expectedOutputs: Array<string>,
): void {
  for (let offset = 0; offset < inputs.length && offset < expectedOutputs.length; offset++) {
    $(fn, inputs[offset] as string).equals(expectedOutputs[offset] as string) // registering as many test cases as needed
  }
}

// register all tests for Ascii
checkDecode(base32hexDecode, BASE32HEX_ASCII_STRINGS, ASCII_STRINGS)

// register all tests for UTF8
checkDecode(base32hexDecode, BASE32HEX_UTF8_STRINGS, UTF8_STRINGS)
```

### Range of data

Another reason that pushed me to delegate the registration of test cases to the computer was that `base32hexDecode` must throw on a wide range of inputs. Hence this code:

```typescript
function shouldThrow(firstByte: number, lastByte: number): void {
  var string: string

  for (let number = firstByte; number <= lastByte; number++) {
    string = base32hexEncodeBytes([number])
    $(base32hexDecode, string).throws(InvalidUtf8Error)
  }
}

// should throw when decoding a 10xxxxxx number
shouldThrow(0b10000000, 0b10111111)

// should throw when decoding a 11111xxx number
shouldThrow(0b11111000, 0b11111111)
```

### Variation of test cases

The two previous examples were straightforward: a list and a range of data resulted in the use of a `for` loop to register lots of generic test cases. Here is an example where I have few and specific test cases that follow the same plan.

I was studying a stream library, for reactive programming (so not 'stream' like the [Stream class](https://nodejs.org/dist/latest-v20.x/docs/api/stream.html) of NodeJS, for reading from files / writing to files). In reactive programming, a stream is a holder of value which is aware of other holders. This enables a stream to notify these dependent streams of any change of its own value. From the point of view of the programmer, you just set the value on a given stream and all dependent streams are automatically updated.

This library also admits *undefined* and a special symbol to reach a stream. The effect is the same: the stream enters a 'skipped' state, and the current value is unchanged. Hence this code:

```typescript
// the stream doubles the given value ; first we pass 2 then we pass 3
$(testSingleValue, 2, 3).equals({
  result: 6,      // final value held
  values: [4, 6] // ordered sequence of all held values
})

type SkipValues = null | undefined | typeof SKIP

function series_testSingleValue(i: SkipValues): void {
  $(testSingleValue, i, i).equals({ result: SKIP, values: [] }) // = stream always in 'skipped' state
  $(testSingleValue, i, 2).equals({ result: 4, values: [4] })   // = stream starts in 'skipped' state then resumes
  $(testSingleValue, 2, i).equals({ result: 4, values: [4] })   // = stream starts with 2 then ignores the update
}

series_testSingleValue(null)
series_testSingleValue(undefined)
series_testSingleValue(SKIP)
```

The function `series_testSingleValue` lay out all the test cases involving a 'SkipValues': two 'SkipValues', first one only and second only. The result are always the same, regardless of the actual 'SkipValue'. You then just have to call `series_testSingleValue` on each possible 'SkipValue'.

The test cases work on `testSingleValue`, which is weird as one would have thought that we were testing streams here. We do. `testSingleValue` is a proxy function: it uses a stream in a specific way and explicitly collects all the values in addition to the usual result. This allows our test cases to not only verify the final result but all the intermediate values as well.

Such proxy functions are detailed in the next section.

## Utility functions serving as proxies

In a test file, you can test any function you want. Actually, you can test any number of functions you want. Even functions defined in the test file itself. I call such functions *proxy functions* as they are the intermediary through which the actual tested function is verified.

There are several overlapping reasons to define these proxy functions:
- collect some intermediate values and then include them in the final result so that they too can be checked
- define a scenario, i.e. a parametrized sequence of instructions that uses the tested function in a specific way: you can then check this scenario with all the inputs you want. Of course, you can also collect intermediate values at any point of the sequence and include them in the final result.
- a one-time scenario can be defined with an anonymous function
- check an additional characteristic with regards to the inputs, if they get to be modified after calling the tested function
- test a property (like serialize and deseralize being the opposite of one another)

### Result + intermediate values

I was studying a stream library (see previous section) and I wanted to verify that passing *undefined* and a special symbol were neutral values, like 0 is to addition and 1 is to multiplication. Doing the operation on a neutral value or not doing it should have identical results. Hence I also added *null* as a 'SkipValue', such that my proxy function detects it and decides not to use the stream. Of course, what's important either way is to collect the intermediate values to verify the evolution of the stream.

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

### Result + intermediate values n°2

I want to provide a second example here, to show that the result can be as sophisticated as you need.

I made my own `copyFolder` function, which can be configured with various options (depth limit, filter out folders, rename during copying + the copying behavior: merge / override / replace). I defined a proxy function to finely track all kind of information. This way, I can check a copy *in one test case since the result is a synthesis of all the data I'm interested in*:

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

### Define a scenario

In a way, the `testSingleValue` proxy function above was defining a scenario, albeit a very small one. Here is a bigger one, which is too collecting all the intermediate values. Just as in the previous example, one test case is enough and you can read the result very clearly.

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

### One-time scenario: use of an anonymous function

When a test fails, **testnow** will report it in the console by printing the call being made. For instance, if the test case `$(my_addition, 1, 2).equals(3)` fails, you will see the call `my_addition(1, 2)` in the console.

This cannot work with anonymous functions, obviously. In such case, **testnow** will just print the whole function. While this seems a bit drastic, it actually works if the function is short and *if you put a comment describing the test*. Then, when a test fails, you know exactly which one and what is was trying to do.

This approach is certainly peculiar but occasionally very useful and easy. For instance:

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

### Define an interactive object

Packing all the data in one resulting object is nice: the synthesis is clear and one test case is enough since everything can be done in one call. It does imply though that the particular sequence of steps is always the same, if you want to make a proxy function.

When you need more flexibility, you can build an interactive object (either by defining a class or a record of closures). You are then free to use it in a variety of ways. Here is an example regarding a `debounce` function, which ensures that multiple calls to a given function results in only one actual true call during a given time window.

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
$(A1.debouncedFunction, 'A1_1').equals(null) // inner function not called
$(A1.getNamedCallCount).equals('A1 0')       // callCount is zero = confirm thta inner function was not called
$(A1.timer.add, 10).equals(10)               // = 10 milliseconds later
$(A1.getNamedCallCount).equals('A1 0')       // still not called
$(A1.timer.add, 10).equals(20)               // = 10 milliseconds later
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

...
```

### Result + an additional characteristic

In Javascript, there is the method [Object.assign(target, ...sources)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign) which copies into the target object all fields from each source. But it does not recurse into the source objects:

```typescript
target = {
  aField: {
    a: 1,
    b: 2
  }
}

Object.assign(target, {
  aField: {
    b: 20,
    c: 3
  }
})
// => 'target.aField' becomes { b: 20, c: 3 } because 'Object.assign' takes the 'aField' of the source as a whole and do not even look if it is an object or not. The inner field 'a' is lost.
```

I worked on a function `mergeInto` to actually have this recursion and also have the 'target' object be actually preserved:

```typescript
mergeInto(target, {
  aField: {
    b: 20,
    c: 3
  }
})
// => returns { aField: { a: 1, b: 20, c: 3 }} AND target is unchanged
```

When writing tests, I thus wanted to check both the result and the fact that the 'target' was preserved. It was a bit tedious to write as I needed to do a copy of the target (to capture the value *before* the call), then call `mergeInto`, then I could check the result as usual and also write the check `copy === target` (i.e. `before === after`). So I made one proxy function and one utility function to simplify writing results:

```typescript
function testMergeIntoObject<S>(source: S, ...patches: Array<...>) {
  var referenceSource:S = structuredClone(source)
  var result:S = mergeInto(source, ...patches) // need to do mergeInto here, before calling util.isDeepStrictEqual

  return { result, preserved: util.isDeepStrictEqual(source, referenceSource) }
}

function preserved<S>(result: S) {
  return { result, preserved: true }
}

$(testMergeIntoObject, { foo: 1 }, { foo: 2 }).equals(preserved({ foo: 2 }))
$(testMergeIntoObject, { foo: 1, bar: 10 }, { foo: 2 }).equals(preserved({ foo: 2, bar: 10 }))
```

### Testing a property

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

I could have even done an automatic registration, since the result is almost always true:

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

# Typechecking issue with overload

## The problem

There is an unfortunate typechecking issue, which is thankfully unusual as it only applies for functions with [overloads](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-overloads), i.e. functions with different facets.

For instance, I have coded some specific types to better manage paths to files and folders. Among these types: *AbsoluteFile* & *RelativeFile* (i.e. the fact a path is relative or not is tracked at the type level). I have a function to replace the file name and, of course, if you pass an *AbsoluteFile*, you get back an *AbsoluteFile* and if you pass a *RelativeFile*, you get back a *RelativeFile* since only the name of the file is changed.

Overloads are made for this kind of situations and are written like this:

```typescript
function replaceFileName(fileName: string, fileItem: AbsoluteFile): AbsoluteFile
function replaceFileName(fileName: string, fileItem: RelativeFile): RelativeFile
function replaceFileName(fileName: string, fileItem: AbsoluteFile | RelativeFile): AbsoluteFile | RelativeFile {
  // implementation code
}
```

The `$` function of **testnow** is typed in such a way that it gathers the types of inputs and the types of the parameters of the function. This allows Typescript to do all the proper inferences afterwards. But it does not work with the overloads *when the general case is not proposed*.

Indeed, the last signature is not an overload, it is the signature used to type-check the implementation code. All the other signatures are used to type-check the calls to the function (for classic functions with no overload, there is only one signature and it is used both for type-checking the implementation code and calls to it). So overloads have to be read as if they introduce a split:

```typescript
// ---- start of external signatures = cases of how to call the function
function replaceFileName(fileName: string, fileItem: AbsoluteFile): AbsoluteFile
function replaceFileName(fileName: string, fileItem: RelativeFile): RelativeFile
// ---- end of external signatures
function replaceFileName(fileName: string, fileItem: AbsoluteFile | RelativeFile): AbsoluteFile | RelativeFile {// signature to type the implementation code
  ...
}
```

Here, `replaceFileName` is presented as being able to deal with a fileItem that is either *exactly* an AbsoluteFile or *exactly* a RelativeFile. But these overloads exclude the option of calling it with a value *best described as the union of both*, which is the general case. In other words, the duty of knowing exactly in which case we are is on the calling code, not on `replaceFileName`, even though the implementation of `replaceFileName` is able to tell things apart.

**This is the situation in which the `$` function cannot properly type-check your test cases**.

## Solution n°1, aka the easiest: add an overload for the general case

```typescript
function replaceFileName(fileName: string, fileItem: AbsoluteFile): AbsoluteFile
function replaceFileName(fileName: string, fileItem: RelativeFile): RelativeFile
function replaceFileName(fileName: string, fileItem: AbsoluteFile | RelativeFile): AbsoluteFile | RelativeFile
function replaceFileName(fileName: string, fileItem: AbsoluteFile | RelativeFile): AbsoluteFile | RelativeFile {
  // the code
}
```

It looks a bit weird that the last two signatures are the same. But remember: the first one is for allowing the function to be used in the most general manner while the second signature is only used to type the implementation code.

Including the general case means that the calling code can be free of concerns and leave it all to  `replaceFileName`. And why not? The price is that the calling code will have no particular precision on the result, which may be totally fine. Yet, as a general rule, I'm always leaving out the general case from the overloads by default, until I find an actual use case where I do need it. Normally, I want to always tell things apart as soon as possible in my code, rather than later on.

And needing to test things is not an relevant use case for me, so I do not choose this solution. I rather fallback on one of the other solutions.

## Solution n°2, aka the tedious: one utility function per overload

A bit tedious but it works fine and I have precise type-checks:

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

It is up to the utility function to check the actual types: the code is quite ugly though because of the repetitions. And there are as many repetitions as they are cases. Plus, type-checking precision is lost. I have had some situations though were none of this mattered.

```typescript
function proxy_replaceFullFileName(fileName: string, fileItem: FileItem): FileItem {
  if(fileItem.absolute) {
    return replaceFileName(fileName, fileItem) // fileItem is for sure an AbsoluteFile
  } else {
    return replaceFileName(fileName, fileItem) // fileItem is for sure an RelativeFile
  }
}
```