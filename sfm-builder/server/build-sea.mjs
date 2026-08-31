// build-sea.mjs
// Bundles all SFMBuilder static assets into a single JS file, then packages
// the Node server as a standalone Windows .exe using Node's Single Executable
// Application (SEA) feature. No external npm dependencies required.
//
// Usage:
//   node build-sea.mjs
//
// Requires Node >= 20.12 (Node 24 recommended). The original `node.exe` is
// copied from `process.execPath` and injected with the SEA blob.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, 'sea-build');
const ASSET_DIR = __dirname;

// Files to bundle (relative paths inside SFMBuilder/). items-data.js is 7MB
// but needed for the resource picker. Everything is served from memory.
const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'import-parser.js',
  'pinyin-pro.js',
  'items-data.js'
];

// 1) Generate the bundled entry file with embedded assets
function buildBundle() {
  const outDir = path.join(BUILD_DIR, 'src');
  fs.mkdirSync(outDir, { recursive: true });

  let map = 'globalThis.__SFM_ASSETS__ = {\n';
  for (const name of ASSETS) {
    const full = path.join(ASSET_DIR, name);
    const data = fs.readFileSync(full, 'base64');
    map += `  ${JSON.stringify(name)}: Buffer.from(${JSON.stringify(data)}, 'base64'),\n`;
  }
  map += '};\n';

  const serverSrc = fs.readFileSync(path.join(ASSET_DIR, 'server.cjs'), 'utf-8');
  const bundle = map + '\n' + serverSrc;
  const entry = path.join(outDir, 'entry.cjs');
  fs.writeFileSync(entry, bundle, 'utf-8');
  return entry;
}

// 2) Build the SEA config
function writeSeaConfig(entry) {
  const configPath = path.join(BUILD_DIR, 'sea-config.json');
  const config = {
    main: entry,
    output: path.join(BUILD_DIR, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return configPath;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status || 1);
  }
}

// Locate the postject CLI across several candidate paths.
function resolvePostject() {
  const candidates = [
    process.env.POSTJECT_PATH,
    path.join(__dirname, 'node_modules', 'postject', 'dist', 'cli.js')
  ];
  // npm global root
  try {
    const globalRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf-8' });
    if (globalRoot.status === 0) {
      candidates.push(path.join(globalRoot.stdout.trim(), 'postject', 'dist', 'cli.js'));
    }
  } catch (_) { /* ignore */ }
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

// 3) Main build pipeline
function main() {
  console.log('[1/4] Bundling assets...');
  const entry = buildBundle();

  console.log('[2/4] Generating SEA blob...');
  const configPath = writeSeaConfig(entry);
  run(process.execPath, ['--experimental-sea-config', configPath]);

  console.log('[3/4] Copying node.exe and injecting blob...');
  const nodeExe = process.execPath;
  const outExe = path.join(BUILD_DIR, 'SFM-Builder.exe');
  fs.copyFileSync(nodeExe, outExe);

  const blob = path.join(BUILD_DIR, 'sea-prep.blob');

  console.log('[4/4] Injecting SEA blob with postject...');
  // postject is required. Search: env POSTJECT_PATH, local node_modules, or
  // npm global install location. Install with:
  //   npm install -g postject        (or)   npm install postject
  const postject = resolvePostject();
  if (!postject) {
    console.error('postject not found. Run:  npm install -g postject');
    process.exit(1);
  }
  run(process.execPath, [
    postject, outExe,
    'NODE_SEA_BLOB', blob,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
  ]);

  // Output the exe to the sfm-builder/dist/ folder (one level above server/)
  const finalExe = path.join(__dirname, '..', 'dist', 'SFM-Builder.exe');
  fs.mkdirSync(path.dirname(finalExe), { recursive: true });
  fs.copyFileSync(outExe, finalExe);
  console.log(`\nDone! exe written to:\n  ${finalExe}`);
}

main();
