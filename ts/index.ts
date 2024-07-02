import { makeTestCallSupervisor } from './01_test-call'

export const $ = makeTestCallSupervisor()
export { executeTestCallsOfFolder, executeTestCallsOfFolderByCommandLine } from './04_execute-test-folder'