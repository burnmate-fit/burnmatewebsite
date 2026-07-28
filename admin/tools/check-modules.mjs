#!/usr/bin/env node
/**
 * Static check for the admin SPA's ES modules.
 *
 * A single bad import (e.g. `import { button } from '../ui.js'` when ui.js has
 * no such export) takes the WHOLE panel down at load time with only a console
 * error — that already happened once. This catches it before the browser does.
 *
 * Checks every js/**\/*.js file for:
 *   1. syntax errors
 *   2. relative imports that point at a missing file
 *   3. named imports that the target module does not export
 *
 * Run:  node tools/check-modules.mjs      (exit 1 on any problem)
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = resolve(ROOT, 'js');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

/** Exported names of a module: `export function x`, `export const x`, `export {a, b}`. */
function exportsOf(src) {
  const out = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (name) out.add(name);
    }
  }
  if (/export\s+default/.test(src)) out.add('default');
  return out;
}

/** Named bindings of `import { a, b as c } from '...'` plus the specifier. */
function importsOf(src) {
  const out = [];
  for (const m of src.matchAll(/import\s+([^'"]+?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[1].trim();
    const spec = m[2];
    const named = clause.match(/\{([^}]*)\}/);
    const names = named
      ? named[1].split(',').map((s) => s.split(/\s+as\s+/)[0].trim()).filter(Boolean)
      : [];
    out.push({ spec, names });
  }
  return out;
}

const files = walk(JS_DIR);
const problems = [];
const exportCache = new Map();
const TMP = mkdtempSync(join(tmpdir(), 'bm-admin-check-'));

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);

  // 1. syntax — real parse via node, using a .mjs copy so ESM syntax is allowed
  try {
    const tmp = join(TMP, 'chk.mjs');
    writeFileSync(tmp, src);
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } catch (e) {
    const msg = (e.stderr?.toString() || e.message).split('\n').filter(Boolean).slice(0, 3).join(' | ');
    problems.push(`${rel}: syntax error — ${msg}`);
  }

  // 2 + 3. imports resolve, named exports exist
  for (const { spec, names } of importsOf(src)) {
    if (!spec.startsWith('.')) continue;               // bare/CDN specifier — skip
    const target = resolve(dirname(file), spec);
    if (!existsSync(target)) {
      problems.push(`${rel}: imports '${spec}' → file not found (${relative(ROOT, target)})`);
      continue;
    }
    if (!exportCache.has(target)) exportCache.set(target, exportsOf(readFileSync(target, 'utf8')));
    const available = exportCache.get(target);
    for (const name of names) {
      if (!available.has(name)) {
        problems.push(`${rel}: imports { ${name} } from '${spec}' → NOT EXPORTED (this breaks the whole SPA)`);
      }
    }
  }
}

rmSync(TMP, { recursive: true, force: true });

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n` + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`✓ ${files.length} admin modules OK — imports resolve and named exports exist`);
