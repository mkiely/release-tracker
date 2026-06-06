#!/usr/bin/env node
// Typography regression guard.
//
// The app's type is driven entirely by the --rt-fs-* / --rt-fw-* token ramp
// (see README "Typography"). This check fails the build if a raw font size or
// numeric font weight sneaks back in, so the scale stays the single source of
// truth and the global --rt-type-scale lever keeps reaching every piece of text.
//
// Allowed (not flagged): `var(--rt-fs-*)`, the `calc(<px> * var(--rt-type-scale))`
// token definitions in tokens.css (those are `--rt-fs-*:`, not `font-size:`), and
// relative `em`/`rem`/`%` font sizes (prose.css keeps an em-based heading scale).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const srcDir = join(root, 'src');

// [regex, human-readable message]. Each matches a *violation* on a single line.
const CSS_RULES = [
  [/font-size:\s*[\d.]+\s*px/i, 'raw px font-size — use var(--rt-fs-*)'],
  [/font-weight:\s*\d/i, 'numeric font-weight — use var(--rt-fw-*)'],
];
const TSX_RULES = [
  [/\bfontSize:\s*\d/, "numeric fontSize — use fontSize: 'var(--rt-fs-*)'"],
  [/\bfontWeight:\s*\d/, "numeric fontWeight — use fontWeight: 'var(--rt-fw-*)'"],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const violations = [];
for (const file of walk(srcDir)) {
  const ext = extname(file);
  const rules = ext === '.css' ? CSS_RULES : ext === '.tsx' ? TSX_RULES : null;
  if (!rules) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [re, msg] of rules) {
      if (re.test(line)) {
        violations.push({ file: relative(root, file), line: i + 1, text: line.trim(), msg });
      }
    }
  });
}

if (violations.length === 0) {
  console.log('✓ typography: no raw font-size / numeric font-weight literals');
  process.exit(0);
}

console.error(`\n✗ typography: ${violations.length} hardcoded type value(s) found.\n`);
console.error('  Use the type tokens instead (see README "Typography").\n');
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.msg}`);
  console.error(`    ${v.text}`);
}
console.error('');
process.exit(1);
