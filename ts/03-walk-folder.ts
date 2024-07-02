import { Maybe, Nullable, compareStringsAscending, errorFromReason, instanceOfNodeError } from './00_utilities'
import { PATH_ELEMENTS } from './01-pathname'
import { AbsoluteFolder, asAbsoluteFile, asAbsoluteFolder } from './02_path-items'
import { Dirent, Stats, readdir, readdirSync, stat } from 'fs'
import { join, sep } from 'path'
import { Readable } from 'stream'

function doesFolderExistSync(absoluteFolder: AbsoluteFolder): Nullable<AbsoluteFolder> {
  try {
    readdirSync(absoluteFolder.folderPathname)
    return absoluteFolder
  } catch (reason) {
    if (instanceOfNodeError(reason, Error) && reason.code === 'ENOENT') {
      return null
    } else {
      throw errorFromReason(reason)
    }
  }
}

export interface FolderWalkerOptions {
  // how to sort the content of a folder after reading it
  arraySortFunction: Nullable<(a: Dirent, b: Dirent) => number>
  // how to filter the content of a folder after reading it
  arrayFilterFunction: Nullable<(value: Dirent, index: number, array: Array<Dirent>) => boolean>
  // how deep should the walker go
  depthLimit: Nullable<number>
  // how to filter an item based on its stats
  itemFilter: Nullable<(pathname: string, fsStats: Stats) => boolean>
}

function sortFilesFirstThenAlphabetically(a: Dirent, b: Dirent): number {
  var isDirectoryA, isDirectoryB

  isDirectoryA = a.isDirectory()
  isDirectoryB = b.isDirectory()

  if (isDirectoryA && isDirectoryB) {
    return -1 * compareStringsAscending(a.name, b.name)
  } else if (isDirectoryA) {
    return -1
  } else if (isDirectoryB) {
    return 1
  } else {
    return -1 * compareStringsAscending(a.name, b.name)
  }
}

const DEFAULT_FOLDER_WALKER_OPTIONS: FolderWalkerOptions = {
  arraySortFunction: sortFilesFirstThenAlphabetically,
  arrayFilterFunction: null,
  depthLimit: null,
  itemFilter: null,
}

interface FolderWalkerItem {
  pathname: string
  fsStats: Stats
}

async function fsStat(absoluteResolvedPathname: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    stat(absoluteResolvedPathname, (error, fsStats) => {
      if (error) {
        reject(error)
      } else {
        resolve(fsStats)
      }
    })
  })
}

async function folderWalker_NextItem(
  absoluteResolvedPathnames: Array<string>,
  itemFilter: Nullable<(pathname: string, fsStats: Stats) => boolean>,
): Promise<Nullable<FolderWalkerItem>> {
  var done, pathname: string | undefined, fsStats: Stats | undefined

  done = false

  while (!done) {
    pathname = absoluteResolvedPathnames.pop()

    if (typeof pathname === 'undefined') {
      done = true
    } else {
      // eslint-disable-next-line no-await-in-loop -- it would make no sense to launch several promises in parallel: the whole point of the 'while' loop is to return the fsStats & pathname as soon as the file/folder is of interest
      fsStats = await fsStat(pathname)
      // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
      done = itemFilter === null || !itemFilter(pathname, fsStats)
    }
  }

  return typeof pathname === 'undefined' || typeof fsStats === 'undefined'
    ? null
    : {
        pathname,
        fsStats,
      }
}

export class FolderWalker extends Readable {
  private readonly absoluteResolvedPathnames: Array<string>
  private readonly options: FolderWalkerOptions
  private readonly absoluteLengthLimit: Maybe<number>

  public constructor(absoluteFolder: AbsoluteFolder, options: Partial<FolderWalkerOptions>) {
    var rootDirectoryPathname

    super({
      objectMode: true,
      autoDestroy: true,
      emitClose: true,
    })

    this.options = { ...DEFAULT_FOLDER_WALKER_OPTIONS, ...options }

    if (doesFolderExistSync(absoluteFolder)) {
      rootDirectoryPathname = absoluteFolder.folderPathname
      this.absoluteResolvedPathnames = [rootDirectoryPathname]

      if (typeof this.options.depthLimit === 'number' && this.options.depthLimit > -1) {
        this.absoluteLengthLimit =
          rootDirectoryPathname.split(PATH_ELEMENTS.NORMAL_SEPARATOR).length + this.options.depthLimit
      } else {
        this.absoluteLengthLimit = null
      }
    } else {
      this.absoluteResolvedPathnames = []
    }
  }

  public override _read(): void {
    folderWalker_NextItem(this.absoluteResolvedPathnames, this.options.itemFilter)
      .then((folderWalkerItem) => {
        if (folderWalkerItem) {
          const { pathname, fsStats } = folderWalkerItem

          if (fsStats.isFile()) {
            this.push(asAbsoluteFile(pathname))
          } else if (fsStats.isDirectory()) {
            // always collect the AbsoluteFolder
            // only list its content if we are below the limit
            if (typeof this.absoluteLengthLimit === 'number' && pathname.split(sep).length > this.absoluteLengthLimit) {
              this.push(asAbsoluteFolder(pathname))
            } else {
              readdir(pathname, { encoding: 'utf8', withFileTypes: true }, (maybeError, fsDirents) => {
                var processedFsDirents

                if (maybeError) {
                  this.push(asAbsoluteFolder(pathname))
                  this.destroy(maybeError)
                } else {
                  processedFsDirents = this.options.arrayFilterFunction
                    ? fsDirents.filter(this.options.arrayFilterFunction)
                    : fsDirents

                  if (this.options.arraySortFunction) {
                    processedFsDirents.sort(this.options.arraySortFunction)
                  }

                  processedFsDirents.forEach((fsDirent) => {
                    var absoluteResolvedPathname = join(pathname, fsDirent.name)

                    if (fsDirent.isFile()) {
                      this.absoluteResolvedPathnames.push(absoluteResolvedPathname)
                    } else if (fsDirent.isDirectory()) {
                      // ensure the folderPathname ends with the separator used by NodeJS
                      if (!absoluteResolvedPathname.endsWith(sep)) {
                        absoluteResolvedPathname += sep
                      }
                      this.absoluteResolvedPathnames.push(absoluteResolvedPathname)
                    }
                  })

                  this.push(asAbsoluteFolder(pathname))
                }
              })
            }
          }
        } else {
          this.push(null)
        }
      })
      .catch((reason: unknown) => {
        this.destroy(errorFromReason(reason))
      })
  }
}

export function walkFolder(
  absoluteFolder: AbsoluteFolder,
  options: Nullable<Partial<FolderWalkerOptions>>,
): FolderWalker {
  return new FolderWalker(absoluteFolder, { ...DEFAULT_FOLDER_WALKER_OPTIONS, ...options })
}
