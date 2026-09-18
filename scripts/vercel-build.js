const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

// 1. Determine build target:
// - Explicit APP_TARGET environment variable (e.g. 'admin' or 'client')
// - VERCEL_PROJECT_NAME (if set by user or vercel and includes 'admin')
// - Default: 'client' (ensures zero regression for existing odar-water-allocation project)
const rawTarget =
  process.env.APP_TARGET ||
  process.env.PROJECT ||
  process.env.VERCEL_PROJECT_NAME ||
  'client';

const isTargetAdmin = rawTarget.toLowerCase().includes('admin');
const target = isTargetAdmin ? 'admin' : 'client';

console.log(`[Vercel Build] Target application: ${target} (from input: "${rawTarget}")`);

// 2. Execute Angular build for target
const buildCommand = `npm run build:${target}`;
console.log(`[Vercel Build] Running: ${buildCommand}`);
execSync(buildCommand, {
  cwd: repoRoot,
  stdio: 'inherit',
});

// 3. Prepare deployment output directory (dist/deploy)
const sourceDir = path.join(repoRoot, 'dist', target, 'browser');
const deployDir = path.join(repoRoot, 'dist', 'deploy');

if (!fs.existsSync(sourceDir)) {
  console.error(`[Vercel Build] ERROR: Expected build output directory not found: ${sourceDir}`);
  process.exit(1);
}

if (fs.existsSync(deployDir)) {
  fs.rmSync(deployDir, { recursive: true, force: true });
}

fs.cpSync(sourceDir, deployDir, { recursive: true });
console.log(`[Vercel Build] Successfully prepared deployment bundle in: ${deployDir}`);
