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
// TSX is checked by reading the whole value — up to the next comma or closing
// brace — rather than just the character after the colon. The narrower check only
// saw a literal in first position, so a conditional hid one completely:
// `fontSize: big ? 15 : 13` reads as `fontSize: b…` and sat in a component two
// live modals render, for months, with the guard reporting clean.
//
// Reading the whole value means distinguishing a size from a coefficient, since
// `fontSize: size * 0.42` (an avatar's initials, scaled to the avatar) is a
// legitimately computed value with no place on a fixed ramp. The line is
// magnitude: every size on the ramp is ≥ 10 and every weight ≥ 400, while a
// multiplier is a fraction. Anything ≥ 4, or carrying a px unit, is a hardcoded
// type value; anything below is arithmetic.
const TSX_TYPE_PROPS = [
  ['fontSize', "numeric fontSize — use fontSize: 'var(--rt-fs-*)'"],
  ['fontWeight', "numeric fontWeight — use fontWeight: 'var(--rt-fw-*)'"],
];

/** Numeric literals in a style value that denote a type value rather than a
 *  coefficient. Returns [] for `size * 0.42`.
 *
 *  A value that names a token at all is exempt, which covers both `var(--rt-fs-*)`
 *  and the imperative `getPropertyValue('--rt-fs-sm').trim() || '12.5px'` the drag
 *  ghost needs — there the literal is the fallback for a token that failed to
 *  resolve, the same shape the colour lines beside it already use. The CSS rules
 *  below exempt `var()` for exactly this reason; TSX gets the same latitude. */
function hardcodedTypeNumbers(value) {
  if (value.includes('--rt-')) return [];
  return [...value.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)(px)?/g)]
    .filter((m) => m[2] || Number(m[1]) >= 4)
    .map((m) => m[0]);
}

const TSX_RULES = TSX_TYPE_PROPS.map(([prop, msg]) => [
  (line) => {
    const re = new RegExp(`\\b${prop}:\\s*([^,}\\n]*)`, 'g');
    for (const m of line.matchAll(re)) if (hardcodedTypeNumbers(m[1]).length) return true;
    return false;
  },
  msg,
]);

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
      if (typeof re === 'function' ? re(line) : re.test(line)) {
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
