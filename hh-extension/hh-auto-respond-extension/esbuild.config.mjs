import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--production');
const DIST = 'dist';

// Read version from manifest.json — single source of truth
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const VERSION = manifest.version;

const contentOptions = {
  entryPoints: ['src/content/main.js'],
  bundle: true,
  outfile: `${DIST}/content.js`,
  format: 'iife',
  minify: isProd,
  sourcemap: false,
  target: 'chrome110',
  logLevel: 'info',
  treeShaking: false,
  drop: isProd ? ['console', 'debugger'] : [],
  define: { 'process.env.VERSION': JSON.stringify(VERSION) },
};

// Page-world script: runs in MAIN world (not isolated) to expose console helpers.
// No bundling needed — it's a standalone script with no imports.
const pageWorldOptions = {
  entryPoints: ['src/page-world.js'],
  bundle: false,
  outfile: `${DIST}/page-world.js`,
  format: 'iife',
  minify: isProd,
  sourcemap: false,
  target: 'chrome110',
  logLevel: 'info',
};

function copyStatic() {
  mkdirSync(DIST, { recursive: true });

  // manifest
  cpSync('manifest.json', `${DIST}/manifest.json`);

  // background
  if (existsSync('background')) {
    cpSync('background', `${DIST}/background`, { recursive: true });
  }

  // popup — inject version into HTML
  if (existsSync('popup')) {
    cpSync('popup', `${DIST}/popup`, { recursive: true });
    const popupPath = `${DIST}/popup/index.html`;
    const popup = readFileSync(popupPath, 'utf8');
    writeFileSync(popupPath, popup.replace(/\bv\d+\.\d+\.\d+\b/g, 'v' + VERSION));
  }

  // icons
  if (existsSync('icons')) {
    cpSync('icons', `${DIST}/icons`, { recursive: true });
  }

  // Sync package.json version with manifest.json
  const pkgPath = 'package.json';
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (pkg.version !== VERSION) {
    pkg.version = VERSION;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  console.log(`[dist] v${VERSION} — static files copied to ${DIST}/`);
}

if (isWatch) {
  copyStatic();
  const ctx1 = await esbuild.context(contentOptions);
  const ctx2 = await esbuild.context(pageWorldOptions);
  await Promise.all([ctx1.watch(), ctx2.watch()]);
  console.log('[esbuild] Watching for changes...');
} else {
  rmSync(DIST, { recursive: true, force: true });
  copyStatic();
  await esbuild.build(contentOptions);
  await esbuild.build(pageWorldOptions);
  console.log(`[esbuild] v${VERSION} build complete -- dist/content.js + page-world.js (${isProd ? 'production' : 'development'})`);
  console.log(`[dist] Load ${DIST}/ as unpacked extension in Chrome`);
}
