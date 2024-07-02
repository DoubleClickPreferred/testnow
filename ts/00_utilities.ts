import { inspect } from 'util'

export type Nullable<T> = T | null

export type Optional<T> = T | undefined

export type Maybe<T> = T | null | undefined

export function pprint(value: unknown): string {
  if(value instanceof Error) {
    return inspect(value)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    return JSON.stringify(value, null, 3)
  }
}

export function instanceOfNodeError<T extends new (...args: never) => Error>(
  value: unknown,
  errorType: T,
): value is InstanceType<T> & NodeJS.ErrnoException {
  // A typeguarded version of `instanceof Error` for NodeJS.
  // From Joseph JDBar Barron, at https://dev.to/jdbar
  return value instanceof errorType
}

export function errorFromReason(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason
  } else if (reason !== null && typeof reason === 'object' && 'name' in reason && 'message' in reason) {
    if ('stack' in reason) {
      return new Error(`[fromReason] ${String(reason.name)}: ${String(reason.message)}\n${String(reason.stack)}`)
    } else {
      return new Error(`[fromReason] ${String(reason.name)}: ${String(reason.message)}`)
    }
  } else {
    return new Error(pprint(reason))
  }
}

export function compareStringsAscending(a: string, b: string): number {
  if (a && b) {
    return a < b ? -1 : a === b ? 0 : 1
  } else if (a) {
    return -1 // stringB being empty, it comes after
  } else if (b) {
    return 1
  } else {
    return 0
  }
}
