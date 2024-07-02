import { P, isMatching } from 'ts-pattern'
import { relative } from 'path'
import {
  PATH_ELEMENTS,
  assumeResolvedAbsoluteFilePathname,
  assumeResolvedAbsoluteFolderPathname,
  normalizeFolderPathname,
  normalizePathname,
  printPathnameTraits,
} from './01-pathname'

interface PathBase {
  folderPathname: string
  absolute: boolean
  folder: boolean
}

export interface AbsoluteFolder extends PathBase {
  absolute: true
  folder: true
}

export interface RelativeFolder extends PathBase {
  absolute: false
  folder: true
}

export type FolderItem = RelativeFolder | AbsoluteFolder

export interface ParsedFileName<Extension extends string = string> {
  fileName: string
  extension: Extension
}

export interface AbsoluteFile<Extension extends string = string> extends ParsedFileName<Extension>, PathBase {
  absolute: true
  folder: false
}

export interface RelativeFile<Extension extends string = string> extends ParsedFileName<Extension>, PathBase {
  absolute: false
  folder: false
}

export type FileItem<Extension extends string = string> = RelativeFile<Extension> | AbsoluteFile<Extension>

export type PathItem = FileItem | FolderItem

export function isFileItem(value: unknown): value is FileItem {
  return isMatching(
    {
      folderPathname: P.string,
      absolute: P.boolean,
      folder: false,
      fileName: P.string,
      extension: P.string,
    },
    value,
  )
}

export type AbsolutePathItem = AbsoluteFile | AbsoluteFolder

export function isAbsoluteFolder(value: unknown): value is AbsoluteFolder {
  return isMatching(
    {
      folderPathname: P.string,
      absolute: true,
      folder: true,
    },
    value,
  )
}

export function isAbsoluteFile(value: unknown): value is AbsoluteFile {
  return isMatching(
    {
      folderPathname: P.string,
      absolute: true,
      folder: false,
      fileName: P.string,
      extension: P.string,
    },
    value,
  )
}

export function asPathname(pathItem: PathItem): string {
  // => the pathname
  return isFileItem(pathItem)
    ? pathItem.extension === ''
      ? `${pathItem.folderPathname}${pathItem.fileName}`
      : `${pathItem.folderPathname}${pathItem.fileName}.${pathItem.extension}`
    : pathItem.folderPathname
}

export function parseFullFileName(fullFileName: string): ParsedFileName {
  var offset, fileName, extension

  offset = fullFileName.lastIndexOf('.')

  if (offset === -1) {
    fileName = fullFileName
    extension = ''
  } else {
    fileName = fullFileName.substring(0, offset)
    extension = fullFileName.substring(offset + 1)
  }

  return {
    fileName,
    extension,
  }
}

export function asRelativePathname(
  absolutePathItem: AbsolutePathItem,
  referenceAbsolutePathItem: AbsolutePathItem,
): string {
  // => relative pathname, can be unresolved
  var relativePathname = relative(referenceAbsolutePathItem.folderPathname, asPathname(absolutePathItem))
  return isFileItem(absolutePathItem) ? normalizePathname(relativePathname) : normalizeFolderPathname(relativePathname)
}

export function asAbsoluteFile(resolvedAbsoluteFilePathname: string): AbsoluteFile {
  var maybePathnameTraits, fullFilePathname, offset, folderPathname, fullFileName

  maybePathnameTraits = assumeResolvedAbsoluteFilePathname(resolvedAbsoluteFilePathname)

  if (maybePathnameTraits) {
    throw new Error(
      `asAbsoluteFile is designed to build an AbsoluteFile with a resolvedAbsoluteFilePathname: got ${resolvedAbsoluteFilePathname} which is ${printPathnameTraits(
        maybePathnameTraits,
      )}`,
    )
  }

  fullFilePathname = normalizePathname(resolvedAbsoluteFilePathname)
  offset = fullFilePathname.lastIndexOf(PATH_ELEMENTS.NORMAL_SEPARATOR)
  folderPathname = fullFilePathname.substring(0, offset + 1)
  fullFileName = fullFilePathname.slice(offset + 1)

  return {
    folderPathname,
    absolute: true,
    folder: false,
    ...parseFullFileName(fullFileName),
  }
}

export function asAbsoluteFolder(resolvedAbsoluteFolderPathname: string): AbsoluteFolder {
  var maybePathnameTraits = assumeResolvedAbsoluteFolderPathname(resolvedAbsoluteFolderPathname)

  if (maybePathnameTraits) {
    throw new Error(
      `asAbsoluteFolder is designed to build an AbsoluteFolder with a normalized resolvedAbsoluteFolderPathname: got ${resolvedAbsoluteFolderPathname} which is ${printPathnameTraits(
        maybePathnameTraits,
      )}`,
    )
  }

  return {
    folderPathname: normalizePathname(resolvedAbsoluteFolderPathname),
    absolute: true,
    folder: true,
  }
}
