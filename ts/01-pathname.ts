import { Maybe } from './00_utilities'
import { isAbsolute } from 'path'

export const PATH_ELEMENTS = {
  NORMAL_SEPARATOR: '/',
  SEPARATOR_REGEXP: /[/\\]/u,
  CURRENT_FOLDER: '.',
  CURRENT_FOLDER_REGEXP: /^\.[/\\]?$/u,
  STARTING_CURRENT_NAVIGATION_REGEXP: /^\.[/\\].*/u,
  INTERNAL_CURRENT_NAVIGATION_REGEXP: /[^.]\.[/\\]/u,
  NAVIGATION_REGEXP: /\.[/\\]/u,
  PARENT_FOLDER: '..',
  PARENT_FOLDER_REGEXP: /^\.\.[/\\]*$/u,
  PARENT_NAVIGATION_REGEXP: /\.\.[/\\]/u,
}

export function isRootPath(pathname: string): boolean {
  // => true if it is an absolute path with exactly one separator
  var count, offset

  if (isAbsolute(pathname)) {
    count = 0
    offset = 0

    while (offset < pathname.length && count < 2) {
      if (PATH_ELEMENTS.SEPARATOR_REGEXP.test(pathname.charAt(offset))) {
        count++
      }
      offset++
    }

    return count === 1
  } else {
    return false
  }
}

export function normalizePathname(pathname: string): string {
  // => no backslash in pathname, only slashes
  return pathname.replace(/\\/gu, PATH_ELEMENTS.NORMAL_SEPARATOR)
}

export function normalizeFolderPathname(pathname: string): string {
  // => as normalizePathname + with an ending slash if pathname is not empty
  var normalizedPathname = normalizePathname(pathname)
  return normalizedPathname === '' || normalizedPathname.endsWith(PATH_ELEMENTS.NORMAL_SEPARATOR)
    ? normalizedPathname
    : normalizedPathname + PATH_ELEMENTS.NORMAL_SEPARATOR
}

export function isFullFileName(string: string): boolean {
  // => true if the string is not empty, if it has no path separator and if it is not any of the pure navigation elements
  // note: it does not mean that the given string is appropriate for a file name as this function does not check if the characters can be accepted by the file system
  return (
    string !== '' &&
    string !== PATH_ELEMENTS.CURRENT_FOLDER &&
    string !== PATH_ELEMENTS.PARENT_FOLDER &&
    string.search(PATH_ELEMENTS.SEPARATOR_REGEXP) === -1
  )
}

export function isFolderName(string: string): boolean {
  // => true if the string is not empty, if there's only one path separator and it is the last character of the string but the string should not then be a root path or any of the navigation elements
  // note: it does not mean that the given string is appropriate for a folder name as this function does not check if the characters can be accepted by the file system
  return (
    string !== '' &&
    string.search(PATH_ELEMENTS.SEPARATOR_REGEXP) === string.length - 1 &&
    !isRootPath(string) &&
    !PATH_ELEMENTS.CURRENT_FOLDER_REGEXP.test(string) &&
    !PATH_ELEMENTS.PARENT_FOLDER_REGEXP.test(string)
  )
}

export function isFolderPathname(pathname: string): boolean {
  // => true if the pathname is empty, or ends with a path separator, or if it is any of the pure navigation elements
  // an empty string is not acceptable for an absoluteFolderPathname, but is acceptable for a relativeFolderPathname
  // inverse of isFilePathname on non-empty-strings
  var lastCharacter

  if (pathname === PATH_ELEMENTS.CURRENT_FOLDER || pathname === PATH_ELEMENTS.PARENT_FOLDER || pathname === '') {
    return true
  } else {
    lastCharacter = pathname ? pathname.charAt(pathname.length - 1) : ''
    return lastCharacter === '\\' || lastCharacter === '/'
  }
}

export function isAbsolutePathname(pathname: string): boolean {
  // => true as per NodeJs
  // inverse of isRelativePathname
  return isAbsolute(pathname)
}

export function isResolvedPathname(pathname: string): boolean {
  // => true if the pathname holds no navigation element
  // inverse of isUnresolvedPathname
  return (
    pathname !== PATH_ELEMENTS.CURRENT_FOLDER &&
    pathname !== PATH_ELEMENTS.PARENT_FOLDER &&
    !PATH_ELEMENTS.NAVIGATION_REGEXP.test(pathname)
  )
}

export const FILE_PATHNAME = 'FILE_PATHNAME'

export const FOLDER_PATHNAME = 'FOLDER_PATHNAME'

export type PathnameType = typeof FILE_PATHNAME | typeof FOLDER_PATHNAME

export interface PathnameTraits {
  absolute: boolean
  resolved: boolean
  pathnameType: PathnameType
  nameOnly: boolean
}

export function printPathnameTraits(pathnameTraits: PathnameTraits): string {
  var string = pathnameTraits.absolute ? 'an absolute, ' : 'a relative, '
  string += pathnameTraits.resolved ? 'resolved ' : 'unresolved '
  string += pathnameTraits.pathnameType === FOLDER_PATHNAME ? 'folder ' : 'file '
  string += pathnameTraits.nameOnly ? 'name' : 'pathname'
  return string
}

export function assumeResolvedAbsoluteFolderPathname(pathname: string): Maybe<PathnameTraits> {
  var absolute, resolved, pathnameType: PathnameType

  absolute = isAbsolutePathname(pathname)
  resolved = isResolvedPathname(pathname)
  pathnameType = isFolderPathname(pathname) ? FOLDER_PATHNAME : FILE_PATHNAME

  if (absolute && resolved && pathnameType === FOLDER_PATHNAME && pathname !== '') {
    return null
  } else {
    return {
      absolute,
      resolved,
      pathnameType,
      nameOnly: pathnameType === FILE_PATHNAME ? isFullFileName(pathname) : isFolderName(pathname),
    }
  }
}

export function assumeResolvedAbsoluteFilePathname(pathname: string): Maybe<PathnameTraits> {
  var absolute, resolved, pathnameType: PathnameType

  absolute = isAbsolutePathname(pathname)
  resolved = isResolvedPathname(pathname)
  pathnameType = isFolderPathname(pathname) ? FOLDER_PATHNAME : FILE_PATHNAME

  if (absolute && resolved && pathnameType === FILE_PATHNAME) {
    return null
  } else {
    return {
      absolute,
      resolved,
      pathnameType,
      nameOnly: pathnameType === FILE_PATHNAME ? isFullFileName(pathname) : isFolderName(pathname),
    }
  }
}
