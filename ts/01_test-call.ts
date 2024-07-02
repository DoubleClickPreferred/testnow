import { isDeepStrictEqual } from 'util'
import { Maybe, Nullable, errorFromReason, pprint } from './00_utilities'

export interface TestCall<Inputs extends Array<unknown>, O> {
  // we cannot assert anything about the function to test: it's up to the user to properly define the TestCall
  fn: (...inputs: [...Inputs]) => O
  values: [...Inputs]
  timeoutDuration: Nullable<number>
}

//----------- TestCallResult -----------

export type TestCallResult<O> =
  | {
      // eslint-disable-next-line @typescript-eslint/ban-types -- we cannot assert anything about the actual error that will be produced (as the appropriate type for a catch is 'unknown')
      error: Function | Error
      value: null
    }
  | {
      error: null
      value: O
    }

function makeNormalTestCallResult<O>(value: O): TestCallResult<O> {
  return {
    error: null,
    value,
  }
}

function makeErrorTestCallResult<O>(
  // eslint-disable-next-line @typescript-eslint/ban-types
  error: Function | Error,
): TestCallResult<O> {
  return {
    error,
    value: null,
  }
}

//----------- TestExecution -----------

export const INITIALIZED_EXECUTION = 'INITIALIZED_EXECUTION'

export const CANCELLED_EXECUTION = 'CANCELLED_EXECUTION'

export const SKIPPED_EXECUTION = 'SKIPPED_EXECUTION'

export const DONE_EXECUTION = 'DONE_EXECUTION'

//----------- TestCallExecution -----------

export type TestCallExecution<Inputs extends Array<unknown>, O> =
  | {
      testCall: TestCall<Inputs, O>
      testExecutionStatus: typeof INITIALIZED_EXECUTION
      passed: false
      obtained: null
      expected: TestCallResult<O>
      error: null
    }
  | {
      testCall: TestCall<Inputs, O>
      testExecutionStatus: typeof CANCELLED_EXECUTION
      passed: false
      obtained: null
      expected: TestCallResult<O>
      error: Error
    }
  | {
      testCall: TestCall<Inputs, O>
      testExecutionStatus: typeof SKIPPED_EXECUTION
      passed: false
      obtained: null
      expected: TestCallResult<O>
      error: null
    }
  | {
      testCall: TestCall<Inputs, O>
      testExecutionStatus: typeof DONE_EXECUTION
      passed: boolean
      obtained: TestCallResult<O>
      expected: TestCallResult<O>
      error: null
    }

function initializeTestCallExecution<Inputs extends Array<unknown>, O>(
  testCallResult: TestCallResult<O>,
  testCall: TestCall<Inputs, O>,
): TestCallExecution<Inputs, O> {
  return {
    testCall,
    testExecutionStatus: INITIALIZED_EXECUTION,
    passed: false,
    obtained: null,
    expected: testCallResult,
    error: null,
  }
}

export function printTestCall<Inputs extends Array<unknown>, O>(testCall: TestCall<Inputs, O>): string {
  var functionName = testCall.fn.name ? testCall.fn.name : 'anonymous'
  return `${functionName}(${(testCall.values as Array<unknown>).map(pprint).join(`, `)})`
}

//------------- TestExecutionStatistics -------------

export interface TestExecutionStatistics {
  ok: number
  ko: number
  skipped: number
  total: number
}

export function newTestExecutionStatistics(): TestExecutionStatistics {
  return {
    ok: 0,
    ko: 0,
    skipped: 0,
    total: 0,
  }
}

export function addTestExecutionStatistics(
  targetTestExecutionStatistics: TestExecutionStatistics,
  sourceTestExecutionStatistics: TestExecutionStatistics,
): TestExecutionStatistics {
  targetTestExecutionStatistics.ok += sourceTestExecutionStatistics.ok
  targetTestExecutionStatistics.ko += sourceTestExecutionStatistics.ko
  targetTestExecutionStatistics.skipped += sourceTestExecutionStatistics.skipped
  targetTestExecutionStatistics.total += sourceTestExecutionStatistics.total
  return targetTestExecutionStatistics
}

function addTestExecution(
  testExecution: TestCallExecution<Array<unknown>, unknown>,
  testExecutionStatistics: TestExecutionStatistics,
): void {
  if (testExecution.testExecutionStatus === DONE_EXECUTION && testExecution.passed) {
    testExecutionStatistics.ok++
  } else if (testExecution.testExecutionStatus === SKIPPED_EXECUTION) {
    testExecutionStatistics.skipped++
  } else {
    testExecutionStatistics.ko++
  }
  testExecutionStatistics.total++
}

export function makeTestExecutionStatistics(
  testCallExecutions: Array<TestCallExecution<Array<unknown>, unknown>>,
): TestExecutionStatistics {
  var testExecutionStatistics = newTestExecutionStatistics()

  for (let testCallExecution of testCallExecutions) {
    addTestExecution(testCallExecution, testExecutionStatistics)
  }

  return testExecutionStatistics
}

//------------- TestCallSupervisor -------------

export interface TestCallSpecifier<O> {
  equals: (value: Awaited<O>) => void
  // eslint-disable-next-line @typescript-eslint/ban-types
  throws: (error: Function | Error) => void
}

export interface TestExecutionOptions {
  skipTimeboxedTests: boolean
}

export interface TestCallSupervisor {
  <Inputs extends Array<unknown>, O>(
    fn: (...inputs: [...Inputs]) => O,
    ...values: Parameters<typeof fn>
  ): TestCallSpecifier<O>
  stopPast: <Inputs extends Array<unknown>, O>(
    timeout: number,
    fn: (...inputs: [...Inputs]) => O,
    ...values: Parameters<typeof fn>
  ) => TestCallSpecifier<O>
  reset: () => void
  run: (testExecutionOptions: TestExecutionOptions) => Promise<Array<TestCallExecution<Array<unknown>, unknown>>>
}

const DEFAULT_TIMEOUT_DURATION = 200

// eslint-disable-next-line @typescript-eslint/ban-types
function getConstructor(reason: unknown): Nullable<Function> {
  switch (typeof reason) {
    case 'boolean':
    case 'number':
    case 'bigint':
    case 'string':
    case 'symbol':
    case 'function':
      return reason.constructor

    case 'undefined':
      return null

    case 'object':
      if (reason === null) {
        return null
      } else {
        return reason.constructor
      }

    default:
      throw new Error(`[getConstructor] Apparently, typeof can return ${typeof reason}: this case should be handled`)
  }
}

// eslint-disable-next-line @typescript-eslint/ban-types
function asErrorOrConstructor(reason: unknown): Function | Error {
  // eslint-disable-next-line @typescript-eslint/ban-types
  var constructor: Maybe<Function>, errorOrConstructor: Function | Error

  if (reason instanceof Error) {
    errorOrConstructor = reason
  } else {
    constructor = getConstructor(reason)

    if (constructor) {
      errorOrConstructor = constructor
    } else {
      throw new Error(`[asErrorOrConstructor] Cannot retrieve the constructor of the obtained error ${pprint(reason)}`)
    }
  }

  return errorOrConstructor
}

export function makeTestCallSupervisor(): TestCallSupervisor {
  // This code is all thanks to Pierre-Yves Gérardy and Leo Horie who made the 'ospec' testing tool.
  // I studied it, refactored it and trimmed it down to this.
  // I don't think I would have gotten anywhere close to the executeTestCall and executeTestCalls code without their work.
  // Many thanks, guys!
  var running: boolean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as the functions may have nothing in common (and do not need to), we use a generic function signature
    testCallExecutions: Array<TestCallExecution<Array<any>, any>>

  running = false
  testCallExecutions = []

  // ---- example tests

  function makeTestCallSpecifier<Inputs extends Array<unknown>, O>(
    timeoutDuration: Nullable<number>,
    fn: (...inputs: [...Inputs]) => O,
    values: [...Inputs],
  ): TestCallSpecifier<O> {
    var testCall: TestCall<Inputs, O> = {
      fn,
      values,
      timeoutDuration,
    }

    return {
      equals(value: O): void {
        testCallExecutions.push(initializeTestCallExecution(makeNormalTestCallResult(value), testCall))
      },
      // eslint-disable-next-line @typescript-eslint/ban-types
      throws(error: Function | Error): void {
        testCallExecutions.push(initializeTestCallExecution(makeErrorTestCallResult(error), testCall))
      },
    }
  }

  function call<Inputs extends Array<unknown>, O>(
    fn: (...inputs: [...Inputs]) => O,
    ...values: Parameters<typeof fn>
  ): TestCallSpecifier<O> {
    return makeTestCallSpecifier(null, fn, values)
  }

  function compareWithObtainedValue<Inputs extends Array<unknown>, O>(
    value: O,
    testCallExecution: TestCallExecution<Inputs, O>,
  ): void {
    testCallExecution.testExecutionStatus = DONE_EXECUTION
    testCallExecution.passed =
      testCallExecution.expected.error === null && isDeepStrictEqual(value, testCallExecution.expected.value)
    testCallExecution.obtained = makeNormalTestCallResult(value)
  }

  function compareWithObtainedError<Inputs extends Array<unknown>, O>(
    reason: unknown,
    testCallExecution: TestCallExecution<Inputs, O>,
  ): void {
    var passed: boolean

    if (testCallExecution.expected.error === null) {
      // we did not expected an error
      passed = false
    } else if (testCallExecution.expected.error instanceof Error) {
      // the expected error being an instantiated Error, we expect an equal error
      if (reason instanceof Error) {
        passed = isDeepStrictEqual(testCallExecution.expected.error, reason)
      } else {
        passed = false
      }
    } else {
      // the expected error being a constructor, we expect an error of that type
      passed = reason instanceof testCallExecution.expected.error
    }

    testCallExecution.testExecutionStatus = DONE_EXECUTION
    testCallExecution.passed = passed
    testCallExecution.obtained = makeErrorTestCallResult(asErrorOrConstructor(reason))
  }

  function cancelTestCallExecution<Inputs extends Array<unknown>, O>(
    reason: unknown,
    testCallExecution: TestCallExecution<Inputs, O>,
  ): void {
    testCallExecution.testExecutionStatus = CANCELLED_EXECUTION
    testCallExecution.error = reason instanceof Error ? reason : new Error(String(reason))
  }

  function executeTestCall<Inputs extends Array<unknown>, O>(
    testCallExecution: TestCallExecution<Inputs, O>,
    defaultDelay: number,
    executeNextTestCall: () => void,
    cancelExecution: () => void,
  ): void {
    var testCall: TestCall<Inputs, O>,
      wrapUpDone: boolean,
      timeoutDuration: number,
      hasTimedOut: boolean,
      promisedTestResult: Promise<O>,
      timingPromise: Promise<void>,
      timeoutID: NodeJS.Timeout

    testCall = testCallExecution.testCall
    wrapUpDone = false // simple protection, to ensure 'executeNextTestCall' can be called at most one time
    timeoutDuration = testCall.timeoutDuration ?? defaultDelay
    hasTimedOut = false

    function onFulfilled(value: O): void {
      if (!wrapUpDone) {
        wrapUpDone = true

        try {
          compareWithObtainedValue(value, testCallExecution)
          process.nextTick(executeNextTestCall)
        } catch (reason) {
          cancelTestCallExecution(reason, testCallExecution)
          cancelExecution()
        }
      }
    }

    function onRejected(reason: unknown): void {
      if (!wrapUpDone) {
        wrapUpDone = true

        if (hasTimedOut) {
          // I think it's better to stop the execution of all testCalls if one of them timed out
          cancelTestCallExecution(reason, testCallExecution)
          cancelExecution()
        } else {
          try {
            compareWithObtainedError(reason, testCallExecution)
            process.nextTick(executeNextTestCall)
          } catch (reason) {
            cancelTestCallExecution(reason, testCallExecution)
            cancelExecution()
          }
        }
      }
    }

    try {
      // by using Promise.resolve, we can deal with testCall.fn whether it is a synchronous or an asynchronous function
      // in case of a synchronous method, we still need to catch a potential exception with try/catch
      promisedTestResult = new Promise((resolve, reject) => {
        try {
          resolve(testCall.fn(...testCall.values))
        } catch (reason) {
          reject(errorFromReason(reason))
        }
      })

      // we pair the execution of testCall.fn with another Promise that will return after a given duration, to be sure to proceed with test execution
      // it only works with asynchronous functions since synchronous functions blocks Javascript's execution thread and so must complete by definition
      timingPromise = new Promise((_resolve, reject) => {
        timeoutID = setTimeout(() => {
          hasTimedOut = true
          reject(new Error(`Execution timed out (duration: ${timeoutDuration})`))
        }, timeoutDuration)
      })

      Promise.race([promisedTestResult, timingPromise])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- this is okay: the timingPromise never resolve to anything so if onFulfilled is called, it's necessarily with a O
        .then(onFulfilled as any, onRejected)
        .finally(() => {
          clearTimeout(timeoutID)
        })
    } catch (reason) {
      // whatever happened, we note down the reason and do not call executeNextTestCall so that everything stops at this point
      wrapUpDone = true
      cancelTestCallExecution(reason, testCallExecution)
      cancelExecution()
    }
  }

  function executeTestCalls(
    testCallExecutions: Array<TestCallExecution<Array<unknown>, unknown>>,
    defaultDelay: number,
    skipTimeboxedTests: boolean,
    cancelExecution: (offset: number) => void,
  ): void {
    var offset = 0

    function finalCancelExecution(): void {
      cancelExecution(offset)
    }

    function executeNextTestCall(): void {
      var testCallExecution

      if (offset < testCallExecutions.length) {
        testCallExecution = testCallExecutions[offset]
        offset++

        if (typeof testCallExecution === 'undefined') {
          process.nextTick(executeNextTestCall)
        } else if (testCallExecution.testCall.timeoutDuration === null || !skipTimeboxedTests) {
          executeTestCall(testCallExecution, defaultDelay, executeNextTestCall, finalCancelExecution)
        } else {
          testCallExecution.testExecutionStatus = SKIPPED_EXECUTION
          process.nextTick(executeNextTestCall)
        }
      } else {
        finalCancelExecution()
      }
    }

    process.nextTick(executeNextTestCall)
  }

  call.stopPast = function stopPast<Inputs extends Array<unknown>, O>(
    timeout: number,
    fn: (...inputs: [...Inputs]) => O,
    ...values: Parameters<typeof fn>
  ): TestCallSpecifier<O> {
    return makeTestCallSpecifier(timeout, fn, values)
  }

  // ---- general methods

  call.reset = function reset(): void {
    if (running) {
      throw new Error('Cannot call `reset()` while running')
    }

    testCallExecutions = []
  }

  call.run = async function run(
    testExecutionOptions: TestExecutionOptions,
  ): Promise<Array<TestCallExecution<Array<unknown>, unknown>>> {
    return new Promise((resolve, reject) => {
      function cancelExecution(_offset: number): void {
        running = false
        resolve(testCallExecutions)
      }

      if (running) {
        reject(new Error('`run()` has already been called'))
      } else {
        running = true

        executeTestCalls(
          testCallExecutions,
          DEFAULT_TIMEOUT_DURATION,
          testExecutionOptions.skipTimeboxedTests,
          cancelExecution,
        )
      }
    })
  }

  return call
}
