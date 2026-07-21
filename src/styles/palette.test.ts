// Palette distinctness guard. Chips and pills carry meaning by color, so two
// slots in the same theme must never be perceptually confusable — dusk-berry
// once shipped In Progress (#DC1E5A) and Blocked (#E03152) at ΔE 4.7, which read
// as the same chip. Parsed from tokens.css so adding a theme is covered for free.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8');

/** Below this, two colors read as "the same color" at chip size. */
const MIN_DELTA_E = 15;

const SLOTS = { ns: 'Not Started', ac: 'In Progress', ur: 'Under Review', bl: 'Blocked', co: 'Complete' };

// ── CIEDE2000 ─────────────────────────────────────────────────────────────
function hexToRgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}
function lab(hex: string): [number, number, number] {
  let [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  });
  const [x, y, z] = [
    (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100,
    (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100,
    (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100,
  ];
  const [fx, fy, fz] = [x / 95.047, y / 100, z / 108.883].map((t) =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116,
  );
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function ciede2000(l1: number[], l2: number[]): number {
  const [L1, a1, b1] = l1;
  const [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360;
  const h2p = ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = h2p - h1p;
  if (Math.abs(dhp) > 180) dhp -= Math.sign(dhp) * 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = (h1p + h2p) / 2;
  if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 180 : -180;
  const T =
    1 - 0.17 * Math.cos(((hbp - 30) * Math.PI) / 180) + 0.24 * Math.cos((2 * hbp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hbp + 6) * Math.PI) / 180) - 0.2 * Math.cos(((4 * hbp - 63) * Math.PI) / 180);
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin((2 * 30 * Math.exp(-(((hbp - 275) / 25) ** 2)) * Math.PI) / 180) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

// ── Parsing ───────────────────────────────────────────────────────────────
function themeBlocks(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const re = /:root(?:\[data-theme="([^"]+)"\])?\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS)) !== null) {
    const name = m[1] ?? 'light';
    const hues: Record<string, string> = {};
    for (const k of Object.keys(SLOTS)) {
      const dm = new RegExp(`--rt-st-${k}-dot:\\s*(#[0-9A-Fa-f]{6})`).exec(m[2]);
      if (dm) hues[k] = dm[1];
    }
    if (Object.keys(hues).length === Object.keys(SLOTS).length) out[name] = hues;
  }
  return out;
}

function closestPair(hexes: [string, string][]): { a: string; b: string; d: number } {
  let best = { a: '', b: '', d: Infinity };
  for (let i = 0; i < hexes.length; i++) {
    for (let j = i + 1; j < hexes.length; j++) {
      const d = ciede2000(lab(hexes[i][1]), lab(hexes[j][1]));
      if (d < best.d) best = { a: hexes[i][0], b: hexes[j][0], d };
    }
  }
  return best;
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe('status hue distinctness', () => {
  const themes = themeBlocks();

  it('parses every theme defined in tokens.css', () => {
    expect(Object.keys(themes).sort()).toEqual(
      ['coastal', 'dark', 'dusk-berry', 'light', 'midnight-navy', 'neon-reef'].sort(),
    );
  });

  for (const [theme, hues] of Object.entries(themeBlocks())) {
    it(`${theme}: no two status hues are confusable`, () => {
      const { a, b, d } = closestPair(Object.entries(hues));
      expect(
        d,
        `${theme}: ${SLOTS[a as keyof typeof SLOTS]} (${hues[a]}) vs ${SLOTS[b as keyof typeof SLOTS]} (${hues[b]}) is ΔE ${d.toFixed(1)}`,
      ).toBeGreaterThanOrEqual(MIN_DELTA_E);
    });
  }
});

describe('categorical ramp distinctness', () => {
  const ramp: [string, string][] = [];
  for (let i = 1; i <= 8; i++) {
    const m = new RegExp(`--rt-cat-${i}:\\s*(#[0-9A-Fa-f]{6})`).exec(CSS);
    if (m) ramp.push([`cat-${i}`, m[1]]);
  }

  it('defines all 8 categorical hues', () => {
    expect(ramp).toHaveLength(8);
  });

  it('keeps every pair of type colors distinguishable', () => {
    const { a, b, d } = closestPair(ramp);
    expect(d, `${a} vs ${b} is only ΔE ${d.toFixed(1)}`).toBeGreaterThanOrEqual(MIN_DELTA_E);
  });
});
