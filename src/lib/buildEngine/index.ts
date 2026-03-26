/**
 * AI-Native Build Engine — Pillar 2
 * 
 * Public API for the build engine that replaces "prompt → paste"
 * with a compiler-centric model:
 * 
 * 1. AST Bridge — Parse & index every file on arrival
 * 2. Provenance Registry — Map code → IR nodes
 * 3. Surgical Pipeline — Patch AST nodes instead of rewriting files
 * 4. Error Bridge — Real errors → targeted repairs
 * 5. Build Manifest — Full audit trail
 */

// Component 1: AST Bridge
export {
  getASTWorkspace,
  resetASTWorkspace,
  indexFilesIntoAST,
  getWorkspaceSummary,
  getImpactedFiles,
  type IndexResult,
} from "./astBridge";

// Component 2: Provenance Registry
export {
  buildProvenanceMap,
  findByIRNode,
  findByFile,
  getAllProvenance,
  clearProvenance,
  getProvenanceSummary,
} from "./provenanceRegistry";

// Component 3: Surgical Pipeline
export {
  applySurgicalEdit,
  applySurgicalEdits,
  classifyEditIntent,
  getASTSource,
  regenerateSource,
  type SurgicalEditRequest,
  type SurgicalEditResult,
} from "./surgicalPipeline";

// Component 4: Error Bridge
export {
  classifyBuildError,
  classifyBuildErrors,
  applyErrorRepairs,
  type ClassifiedBuildError,
  type BuildErrorCategory,
} from "./errorBridge";

// Component 5: Build Manifest
export {
  startBuildManifest,
  recordFileInManifest,
  recordBuildError,
  completeBuildManifest,
  getCurrentManifest,
  getBuildHistory,
  getLastBuild,
  clearBuildHistory,
  type BuildManifest,
  type ManifestEntry,
} from "./buildManifest";
