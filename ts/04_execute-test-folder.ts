import {
  CANCELLED_EXECUTION,
  INITIALIZED_EXECUTION,
  SKIPPED_EXECUTION,
  TestCall,
  TestCallExecution,
  TestCallResult,
  TestCallSupervisor,
  TestExecutionStatistics,
  addTestExecutionStatistics,
  makeTestExecutionStatistics,
  newTestExecutionStatistics,
  printTestCall,
} from './01_test-call'
import { Optional, errorFromReason, pprint } from './00_utilities'
import {
  AbsoluteFile,
  AbsoluteFolder,
  AbsolutePathItem,
  asAbsoluteFolder,
  asPathname,
  asRelativePathname,
  isAbsoluteFile,
} from './02_path-items'
import { FolderWalker, walkFolder } from './03-walk-folder'
import { normalizeFolderPathname } from './01-pathname'
import { Stats } from 'fs'
import { resolve } from 'path'

//------------- UTILITIES -----------

function endOfNoun(total: number): string {
  return total === 1 ? '' : 's'
}

//------------- COLOR for TERMINAL see https://en.wikipedia.org/wiki/ANSI_escape_code#3-bit_and_4-bit -----------
function red(string: string): string {
  return `\u001B[31m${string}\u001B[39m`
}

function green(string: string): string {
  return `\u001B[32m${string}\u001B[39m`
}

function cyan(string: string): string {
  return `\u001B[36m${string}\u001B[39m`
}

function darkGrey(string: string): string {
  return `\u001B[38;5;237m${string}\u001B[39m`
}

function lightGrey(string: string): string {
  return `\u001B[38;5;250m${string}\u001B[39m`
}

function logAsError(string: string): void {
  console.info(red(string))
}

function logAsSuccess(string: string): void {
  console.info(green(string))
}

function horizontalRule(string: string): void {
  console.info(lightGrey('\u2500'.repeat(string.length)))
}

type TerminalTextAlignment = 'left' | 'right' | 'center'

function alignText(string: string, size: number, alignment: TerminalTextAlignment): string {
  var leftSize

  if (alignment === 'left') {
    return string + ' '.repeat(size - string.length)
  } else if (alignment === 'right') {
    return ' '.repeat(size - string.length) + string
  } else {
    leftSize = size - Math.floor(string.length / 2)
    return ' '.repeat(leftSize) + string + ' '.repeat(size - string.length + leftSize)
  }
}

function padNextNewlines(string: string, padding: number, newline: string): string {
  var outputString: string, lines: Array<string>, line: string

  outputString = ''
  lines = string.split('\n')

  for (let index = 0; index < lines.length; index++) {
    if (index > 0) {
      outputString += newline
      outputString += ' '.repeat(padding)
    }

    line = lines[index] as string
    outputString += line
  }

  return outputString
}

type StringPair = [string, string]

function table_2columns(rows: Array<StringPair>): string {
  var formattedRows: Array<string>, paddingLeft, newline: string, firstColumnMaxLength: number, string, index

  formattedRows = []
  paddingLeft = '\t'
  newline = `\n${paddingLeft}`

  if (rows.length > 0) {
    firstColumnMaxLength = -1

    for (let row of rows) {
      if (firstColumnMaxLength < row[0].length) {
        firstColumnMaxLength = row[0].length
      }
    }

    for (let row of rows) {
      string = ''
      index = 0

      for (let cell of row) {
        if (index === 0) {
          string += darkGrey(alignText(cell, firstColumnMaxLength, 'right'))
        } else {
          string += padNextNewlines(cell, firstColumnMaxLength + 2, newline)
        }
        string += '  ' // two spaces separate more clearly the two columns
        index++
      }

      formattedRows.push(string)
    }
  }

  return newline + formattedRows.join(newline)
}

//------------- REPORTING -----------

function reportTestExecutionStatistics(
  testExecutionStatistics: TestExecutionStatistics,
  absoluteFile: AbsoluteFile,
  testFolder: AbsoluteFolder,
): void {
  var { ok, ko, skipped, total } = testExecutionStatistics
  var relativeFilePathname = asRelativePathname(absoluteFile, testFolder)

  if (ko > 0) {
    logAsError(`\n${relativeFilePathname}: ${ko} test${endOfNoun(ko)} failed on ${total} test${endOfNoun(total)}`)
  } else if (skipped > 0) {
    logAsSuccess(
      `\n${relativeFilePathname}: ok (${ok} test${endOfNoun(ok)}) skipped (${skipped} test${endOfNoun(skipped)})`,
    )
  } else {
    logAsSuccess(`\n${relativeFilePathname}: ok (${total} test${endOfNoun(total)})`)
  }
}

function codeLinesAsTableRows<Inputs extends Array<unknown>, O>(
  label: string,
  testCall: TestCall<Inputs, O>,
): Array<StringPair> {
  var rows: Array<StringPair>, codeLines, firstLine

  rows = []
  codeLines = testCall.fn.toString().split('\n')
  firstLine = codeLines.shift()

  if (typeof firstLine !== 'undefined') {
    rows.push([label, cyan(firstLine)])

    for (let lineOfCode of codeLines) {
      rows.push(['', cyan(lineOfCode)])
    }
  }

  return rows
}

function reportFailedComparison<Inputs extends Array<unknown>, O>(
  expectedTestCallResult: TestCallResult<O>,
  obtainedTestCallResult: TestCallResult<O>,
  testCall: TestCall<Inputs, O>,
): void {
  var expectedLabel, obtainedLabel, expectedValue, obtainedValue, rows: Array<StringPair>, printedArguments

  if (expectedTestCallResult.error === null) {
    expectedLabel = 'Expected value'
    expectedValue = pprint(expectedTestCallResult.value)
  } else {
    expectedLabel = 'Expected error'
    expectedValue = pprint(expectedTestCallResult.error)
  }

  if (obtainedTestCallResult.error === null) {
    obtainedLabel = 'but got value'
    obtainedValue = pprint(obtainedTestCallResult.value)
  } else {
    obtainedLabel = 'but got error'
    obtainedValue = pprint(obtainedTestCallResult.error)
  }

  rows = [
    [expectedLabel, cyan(expectedValue)],
    [obtainedLabel, cyan(obtainedValue)],
  ]
  printedArguments = (testCall.values as Array<unknown>).map(pprint).join(`, `)

  if (testCall.fn.name === '') {
    if (printedArguments === '') {
      // no name and no arguments => we can only print the source code
      rows = rows.concat(codeLinesAsTableRows('for', testCall))
    } else {
      // no name but some arguments => print the call then print the source code
      rows.push(['for', cyan(`anonymous(${printedArguments})`)])
      rows = rows.concat(codeLinesAsTableRows('defined as', testCall))
    }
  } else {
    // name and arguments => just print the call
    rows.push(['for', cyan(`${testCall.fn.name}(${printedArguments})`)])
  }

  console.info(table_2columns(rows))
}

function reportTestCallExecution(testCallExecution: TestCallExecution<Array<unknown>, unknown>): void {
  if (testCallExecution.testExecutionStatus === INITIALIZED_EXECUTION) {
    logAsError(
      `\tThis should not be possible: the TestCall ${printTestCall(
        testCallExecution.testCall,
      )} was not executed or its result was not taken into account`,
    )
  } else if (testCallExecution.testExecutionStatus === CANCELLED_EXECUTION) {
    logAsError(`\tCancelled execution for the TestCall ${printTestCall(testCallExecution.testCall)}`)
    logAsError(`\t${testCallExecution.error.toString()}`)
  } else if (testCallExecution.testExecutionStatus !== SKIPPED_EXECUTION && !testCallExecution.passed) {
    reportFailedComparison(testCallExecution.expected, testCallExecution.obtained, testCallExecution.testCall)
  }
}

function reportGlobalTestExecutionStatistics(globalTestExecutionStatistics: TestExecutionStatistics): void {
  var string

  if (globalTestExecutionStatistics.ko > 0) {
    string = `A total of ${globalTestExecutionStatistics.ko} test${endOfNoun(
      globalTestExecutionStatistics.ko,
    )} failed on ${globalTestExecutionStatistics.total} test${endOfNoun(globalTestExecutionStatistics.total)}.`

    console.info('\n')
    horizontalRule(string)
    logAsError(`\n${string}`)
  } else if (globalTestExecutionStatistics.skipped > 0) {
    string = `${globalTestExecutionStatistics.ok} test${endOfNoun(globalTestExecutionStatistics.ok)} passed, ${
      globalTestExecutionStatistics.skipped
    } test${endOfNoun(globalTestExecutionStatistics.skipped)} skipped.`

    console.info('\n')
    horizontalRule(string)
    logAsSuccess(`\n${string}`)
  } else {
    string = `All ${globalTestExecutionStatistics.total} test${endOfNoun(globalTestExecutionStatistics.total)} passed.`

    console.info('\n')
    horizontalRule(string)
    logAsSuccess(`\n${string}`)
  }
}

//------------- EXECUTION -----------

function makeImportAndRunTestCalls(
  $: TestCallSupervisor,
  absoluteFile: AbsoluteFile,
  testFolder: AbsoluteFolder,
  options: TestFolderExecutionOptions,
  globalTestExecutionStatistics: TestExecutionStatistics,
): () => Promise<TestExecutionStatistics> {
  return async (): Promise<TestExecutionStatistics> => {
    var testCallExecutions: Array<TestCallExecution<Array<unknown>, unknown>>,
      testExecutionStatistics: TestExecutionStatistics

    // reset all the data from any previous test file, as well as the coverage
    $.reset()

    try {
      // register tests
      await import(`file:///${asPathname(absoluteFile)}`)

      try {
        // run the registered tests
        testCallExecutions = await $.run(options)

        // report and collect statistics
        testExecutionStatistics = makeTestExecutionStatistics(testCallExecutions)

        if (testExecutionStatistics.total > 0) {
          addTestExecutionStatistics(globalTestExecutionStatistics, testExecutionStatistics)
          reportTestExecutionStatistics(testExecutionStatistics, absoluteFile, testFolder)
          testCallExecutions.forEach(reportTestCallExecution)
        }

        return globalTestExecutionStatistics
      } catch (reason) {
        throw new AggregateError([new Error(`Failed to run the TestCalls from ${asPathname(absoluteFile)}`), reason])
      }
    } catch (reason) {
      throw new AggregateError([new Error(`Failed to import ${asPathname(absoluteFile)}`), reason])
    }
  }
}

export interface TestFolderExecutionOptions {
  skipTimeboxedTests: boolean
  onlyLastModified: boolean
  maxExecutionAge: number
}

const DEFAULT_TEST_FOLDER_EXECUTION_OPTIONS: TestFolderExecutionOptions = {
  skipTimeboxedTests: false,
  onlyLastModified: false,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  maxExecutionAge: 1800000 // 1800000 = 30 * 60 * 1000 milliseconds = 30 minutes
}

function makeTestFileChecker(time: number, maxExecutionAge:number): (pathname: string, fsStats: Stats) => boolean {
  return (_pathname: string, fsStats: Stats): boolean =>
    fsStats.isFile() && time - fsStats.mtime.valueOf() >= maxExecutionAge
}

function hasJsLikeExtension(absoluteFile:AbsoluteFile):boolean {
  return absoluteFile.extension === 'js' || absoluteFile.extension === 'cjs' || absoluteFile.extension === 'mjs'
}

export async function executeTestCallsOfFolder(
  $: TestCallSupervisor,
  testFolder: AbsoluteFolder,
  options: Partial<TestFolderExecutionOptions>,
): Promise<TestExecutionStatistics> {
  var promise: Promise<TestExecutionStatistics>,
    globalTestExecutionStatistics: TestExecutionStatistics,
    resolvedOptions: TestFolderExecutionOptions,
    startTime: number

  globalTestExecutionStatistics = newTestExecutionStatistics()
  promise = Promise.resolve(globalTestExecutionStatistics)
  resolvedOptions = { ...DEFAULT_TEST_FOLDER_EXECUTION_OPTIONS, ...options }
  startTime = Date.now()

  return new Promise((resolve, reject) => {
    var folderWalker: FolderWalker

    function stopOnBrokenExecution(reason: unknown): TestExecutionStatistics {
      folderWalker.destroy(errorFromReason(reason))
      return globalTestExecutionStatistics
    }

    // make the folderWalker with the proper 'error' and 'end' handlers
    folderWalker = walkFolder(testFolder, {
      itemFilter: resolvedOptions.onlyLastModified ? makeTestFileChecker(startTime, resolvedOptions.maxExecutionAge) : null,
    })
      .on('error', (error) => {
        reject(error)
      })
      .on('end', () => {
        promise
          .then(() => {
            resolve(globalTestExecutionStatistics)
          })
          .catch(reject)
      })

    // Start consuming the data by attaching a 'data' handler ; destroy folderWalker if any test execution broke, regardless of the reason
    // This way, the whole test execution stops on this very error.
    folderWalker.on('data', (absolutePathItem: AbsolutePathItem) => {
      if (isAbsoluteFile(absolutePathItem) && hasJsLikeExtension(absolutePathItem)) {
        promise = promise
          .then(
            makeImportAndRunTestCalls($, absolutePathItem, testFolder, resolvedOptions, globalTestExecutionStatistics),
          )
          .catch(stopOnBrokenExecution)
      }
    })
  })
}

const TEST_FOLDER_EXECUTION_ARGUMENT_START = 2

function parseMaxExecutionAge(string:Optional<string>):number {
  var maxExecutionAge:number

  if(typeof string === 'undefined') {
    return DEFAULT_TEST_FOLDER_EXECUTION_OPTIONS.maxExecutionAge
  } else {
    try {
      maxExecutionAge = parseInt(string)

      if(maxExecutionAge > 0) {
        return maxExecutionAge
      } else {
        throw new Error(`onlyLastModified only accepts strictly positive numbers, got ${maxExecutionAge}`)
      }
    } catch(_reason) {
      return DEFAULT_TEST_FOLDER_EXECUTION_OPTIONS.maxExecutionAge
    }
  }

}

export async function executeTestCallsOfFolderByCommandLine($: TestCallSupervisor): Promise<string> {
  var options: TestFolderExecutionOptions,
    requestedFolderPathname: Optional<string>,
    folderPathname: string,
    strings: Array<string>,
    onlyLastModifiedOffset: number

  options = { ...DEFAULT_TEST_FOLDER_EXECUTION_OPTIONS }

  if (process.argv.length > TEST_FOLDER_EXECUTION_ARGUMENT_START) {
    strings = process.argv.slice(TEST_FOLDER_EXECUTION_ARGUMENT_START)
    requestedFolderPathname = strings[0]

    if (typeof requestedFolderPathname === 'undefined') {
      throw new Error(`Please pass a relative path to a folder as first argument, got ${pprint(strings)}`)
    } else {
      folderPathname = normalizeFolderPathname(
        resolve(`${normalizeFolderPathname(process.cwd())}${requestedFolderPathname}`),
      )
      options.skipTimeboxedTests = strings.includes('skipTimeboxedTests')

      onlyLastModifiedOffset = strings.indexOf('onlyLastModified')
      if (onlyLastModifiedOffset === -1) {
        options.onlyLastModified = false
      } else {
        options.onlyLastModified = true
        options.maxExecutionAge = parseMaxExecutionAge(strings[onlyLastModifiedOffset + 1])
      }
    }
  } else {
    throw new Error(`Please pass a relative path to a folder as first argument, got ${pprint(process.argv)}`)
  }

  console.info(`Execute tests in ${folderPathname}, options ${pprint(options)}\n`)

  return executeTestCallsOfFolder($, asAbsoluteFolder(folderPathname), options)
    .then((globalTestExecutionStatistics) => {
      reportGlobalTestExecutionStatistics(globalTestExecutionStatistics)
      return folderPathname
    })
    .catch((reason) => {
      logAsError(pprint(reason))
      return folderPathname
    })
}
