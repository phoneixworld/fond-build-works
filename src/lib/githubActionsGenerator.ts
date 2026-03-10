/**
 * GitHub Actions Workflow Generator
 */

export interface WorkflowConfig {
  projectName: string;
  nodeVersion: string;
  packageManager: "npm" | "bun";
  enableLint: boolean;
  enableTypecheck: boolean;
  enableTests: boolean;
  enableQualityGates: boolean;
  enableDeploy: boolean;
  branches: string[];
}

const DEFAULT_CONFIG: WorkflowConfig = {
  projectName: "My App",
  nodeVersion: "20",
  packageManager: "bun",
  enableLint: true,
  enableTypecheck: true,
  enableTests: true,
  enableQualityGates: true,
  enableDeploy: false,
  branches: ["main"],
};

export function generateWorkflow(config: Partial<WorkflowConfig> = {}): string {
  const c = { ...DEFAULT_CONFIG, ...config };
  const pm = c.packageManager;
  const install = pm === "bun" ? "bun install --frozen-lockfile" : "npm ci";
  const run = pm === "bun" ? "bun run" : "npm run";

  const steps: string[] = [];

  steps.push(`name: CI/CD Pipeline
on:
  push:
    branches: [${c.branches.map(b => `"${b}"`).join(", ")}]
  pull_request:
    branches: [${c.branches.map(b => `"${b}"`).join(", ")}]

permissions:
  contents: read

jobs:
  ci:
    name: Build & Test
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4`);

  if (pm === "bun") {
    steps.push(`
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest`);
  } else {
    steps.push(`
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "${c.nodeVersion}"
          cache: "npm"`);
  }

  steps.push(`
      - name: Install dependencies
        run: ${install}`);

  if (c.enableLint) {
    steps.push(`
      - name: Lint
        run: ${run} lint || echo "No lint script configured"`);
  }

  if (c.enableTypecheck) {
    steps.push(`
      - name: Type Check
        run: npx tsc --noEmit`);
  }

  if (c.enableTests) {
    steps.push(`
      - name: Run Tests
        run: ${pm === "bun" ? "bunx vitest run" : "npx vitest run"}`);
  }

  steps.push(`
      - name: Build
        run: ${run} build`);

  if (c.enableQualityGates) {
    steps.push(`
      - name: Bundle Size Check
        run: |
          SIZE=$(du -sk dist/ 2>/dev/null | cut -f1 || echo "0")
          echo "Bundle size: \${SIZE}KB"
          if [ "$SIZE" -gt 5000 ]; then
            echo "::warning::Bundle size exceeds 5MB threshold"
          fi`);
  }

  if (c.enableDeploy) {
    steps.push(`
  deploy:
    name: Deploy
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy
        run: echo "Add your deployment script here"
        env:
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}`);
  }

  return steps.join("\n");
}

export function generateWorkflowPreview(config: Partial<WorkflowConfig> = {}): string {
  return generateWorkflow(config);
}
