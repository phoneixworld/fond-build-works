# 7 Architectural Pillars — Execution Roadmap

## Pillar 1: WebContainers + Bun ← CURRENT
Real runtime, zero infra cost, fastest installs.
- Install @webcontainer/api
- Create WebContainerEngine (boot, mount, install, dev server)
- Create WebContainerPreview React component
- Wire into PreviewPanel as primary renderer
- Configure COOP/COEP headers in vite.config.ts
- Replace Sandpack as default preview mode

## Pillar 2: AI-Native Build Engine
Custom build system, not Vite/Webpack.
- Harden compile() pipeline
- Improve AI output quality via better prompts
- Fix repair loop to actually fix errors
- Ensure deterministic task graphs

## Pillar 3: AST-level Surgical Editing
No more full-file regeneration.
- Harden src/lib/ast/ core (store, query, patch, graph)
- Wire surgical editor as default for edit intents
- Increase confidence threshold matching
- Add provenance tracking

## Pillar 4: Build-Error Repair Loop
AI fixes real errors, not guessed ones.
- Parse actual error output from WebContainer
- Feed real error messages to repair prompts
- Increase repair accuracy with cross-file context
- Track repair success rate

## Pillar 5: 1000+ Deterministic Templates
Instant scaffolds that feel magical.
- Audit existing ~20 templates
- Build template generator tooling
- Create templates for all major domains
- Ensure AST compatibility

## Pillar 6: Hybrid Generation
Templates for structure, AI for refinement.
- Fix hybridGenerator.ts 70/30 split
- Improve AI gap analysis
- Ensure templates provide real structure
- AI only fills business logic gaps

## Pillar 7: Unified Orchestration Layer
Multi-agent system becomes the brain.
- Already built (orchestrator.ts)
- Improve agent coordination
- Add observability and metrics
- Performance optimization
