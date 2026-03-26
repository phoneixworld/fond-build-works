/**
 * WebContainer module — Public API
 */
export { 
  getWebContainer, 
  teardownWebContainer, 
  mountAndRun, 
  updateFile, 
  updateFiles,
  workspaceToFileTree,
  type WebContainerStatus,
  type WebContainerCallbacks,
} from "./engine";
