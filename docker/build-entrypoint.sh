#!/bin/bash
set -euo pipefail

# ─── Phoenix Container Builder ───────────────────────────────────────────
# Runs inside Azure Container Apps Job.
# Env vars: BUILD_ID, PROJECT_ID, CALLBACK_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1"
  curl -sf "$CALLBACK_URL" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"build_id\":\"$BUILD_ID\",\"event\":\"log\",\"log_line\":\"$1\"}" || true
}

task_start() {
  curl -sf "$CALLBACK_URL" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"build_id\":\"$BUILD_ID\",\"event\":\"task_start\",\"task_type\":\"$1\"}" || true
}

task_complete() {
  curl -sf "$CALLBACK_URL" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"build_id\":\"$BUILD_ID\",\"event\":\"task_complete\",\"task_type\":\"$1\",\"duration_ms\":$2}" || true
}

task_fail() {
  curl -sf "$CALLBACK_URL" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"build_id\":\"$BUILD_ID\",\"event\":\"task_fail\",\"task_type\":\"$1\",\"error\":\"$2\",\"exit_code\":$3}" || true
}

build_complete() {
  curl -sf "$CALLBACK_URL" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"build_id\":\"$BUILD_ID\",\"event\":\"build_complete\",\"build_duration_ms\":$1,\"preview_url\":\"$2\",\"artifact_path\":\"$3\"}" || true
}

build_fail() {
  curl -sf "$CALLBACK_URL" -X POST \
    -H "Content-Type: application/json" \
    -d "{\"build_id\":\"$BUILD_ID\",\"event\":\"build_fail\",\"error\":\"$1\",\"build_duration_ms\":$2}" || true
}

BUILD_START=$(date +%s%N)
ARTIFACT_BASE="${PROJECT_ID}/${BUILD_ID}"

log "Container started for build $BUILD_ID"

# ─── Download source files from Supabase Storage ─────────────────────────
log "Downloading source files..."
SOURCE_URL="${SUPABASE_URL}/storage/v1/object/public/build-artifacts/${ARTIFACT_BASE}/source.json"
curl -sf "$SOURCE_URL" -o /tmp/source.json

# Parse and write files to workspace
node -e "
const fs = require('fs');
const path = require('path');
const { files, dependencies } = JSON.parse(fs.readFileSync('/tmp/source.json', 'utf8'));

// Write package.json
const pkg = {
  name: 'phoenix-build',
  private: true,
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'tsc -b && vite build',
    lint: 'eslint .',
    preview: 'vite preview'
  },
  dependencies: {
    react: '^18.3.1',
    'react-dom': '^18.3.1',
    'react-router-dom': '^6.30.0',
    ...dependencies
  },
  devDependencies: {
    '@vitejs/plugin-react-swc': '^3.11.0',
    typescript: '^5.8.0',
    vite: '^5.4.0',
    '@types/react': '^18.3.0',
    '@types/react-dom': '^18.3.0'
  }
};
fs.writeFileSync('/workspace/package.json', JSON.stringify(pkg, null, 2));

// Write source files
for (const [filePath, content] of Object.entries(files)) {
  const fullPath = path.join('/workspace', filePath.startsWith('/') ? filePath.slice(1) : filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

console.log('Wrote ' + Object.keys(files).length + ' files');
"

# ─── INSTALL ──────────────────────────────────────────────────────────────
task_start "install"
STEP_START=$(date +%s%N)
if npm ci --prefer-offline 2>&1 | tail -5; then
  STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
  task_complete "install" "$STEP_MS"
else
  STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
  task_fail "install" "npm ci failed" "$?"
  BUILD_MS=$(( ($(date +%s%N) - BUILD_START) / 1000000 ))
  build_fail "npm install failed" "$BUILD_MS"
  exit 1
fi

# ─── LINT ─────────────────────────────────────────────────────────────────
task_start "lint"
STEP_START=$(date +%s%N)
if npx eslint src/ --max-warnings=50 2>&1 | tail -10; then
  STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
  task_complete "lint" "$STEP_MS"
else
  STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
  task_fail "lint" "ESLint found errors" "$?"
  # Don't fail the build on lint — continue
fi

# ─── TYPECHECK ────────────────────────────────────────────────────────────
task_start "typecheck"
STEP_START=$(date +%s%N)
if npx tsc --noEmit 2>&1 | tail -20; then
  STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
  task_complete "typecheck" "$STEP_MS"
else
  STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
  task_fail "typecheck" "TypeScript errors found" "$?"
  # Continue — build may still succeed
fi

# ─── TEST ─────────────────────────────────────────────────────────────────
task_start "test"
STEP_START=$(date +%s%N)
if [ -f "vitest.config.ts" ] || grep -q "vitest" package.json; then
  if npx vitest run --reporter=verbose 2>&1 | tail -20; then
    STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
    task_complete "test" "$STEP_MS"
  else
    STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
    task_fail "test" "Tests failed" "$?"
  fi
else
  STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
  task_complete "test" "$STEP_MS"
  log "No test runner configured — skipping"
fi

# ─── BUILD ────────────────────────────────────────────────────────────────
task_start "build"
STEP_START=$(date +%s%N)
if npx vite build 2>&1 | tail -20; then
  STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
  task_complete "build" "$STEP_MS"
else
  STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
  task_fail "build" "Vite build failed" "$?"
  BUILD_MS=$(( ($(date +%s%N) - BUILD_START) / 1000000 ))
  build_fail "Vite build failed" "$BUILD_MS"
  exit 1
fi

# ─── PUBLISH ──────────────────────────────────────────────────────────────
task_start "publish"
STEP_START=$(date +%s%N)
log "Uploading build artifacts..."

# Upload dist/ to Supabase Storage
DIST_DIR="/workspace/dist"
if [ -d "$DIST_DIR" ]; then
  cd "$DIST_DIR"
  find . -type f | while read -r file; do
    CLEAN_PATH="${file#./}"
    UPLOAD_PATH="${ARTIFACT_BASE}/dist/${CLEAN_PATH}"
    CONTENT_TYPE="application/octet-stream"
    case "$CLEAN_PATH" in
      *.html) CONTENT_TYPE="text/html" ;;
      *.js)   CONTENT_TYPE="application/javascript" ;;
      *.css)  CONTENT_TYPE="text/css" ;;
      *.json) CONTENT_TYPE="application/json" ;;
      *.svg)  CONTENT_TYPE="image/svg+xml" ;;
      *.png)  CONTENT_TYPE="image/png" ;;
      *.jpg|*.jpeg) CONTENT_TYPE="image/jpeg" ;;
    esac
    
    curl -sf "${SUPABASE_URL}/storage/v1/object/build-artifacts/${UPLOAD_PATH}" \
      -X POST \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: ${CONTENT_TYPE}" \
      --data-binary "@${file}" || log "Failed to upload: ${CLEAN_PATH}"
  done
  cd /workspace
fi

STEP_MS=$(( ($(date +%s%N) - STEP_START) / 1000000 ))
task_complete "publish" "$STEP_MS"

# ─── DONE ─────────────────────────────────────────────────────────────────
BUILD_MS=$(( ($(date +%s%N) - BUILD_START) / 1000000 ))
PREVIEW_URL="${SUPABASE_URL}/storage/v1/object/public/build-artifacts/${ARTIFACT_BASE}/dist/index.html"
build_complete "$BUILD_MS" "$PREVIEW_URL" "$ARTIFACT_BASE"

log "Build finished in ${BUILD_MS}ms"
