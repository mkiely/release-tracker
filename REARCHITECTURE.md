# Rearchitecture: CSS Modules + namespace rename

Handoff for de-prototyping the styling layer. The app was ported from an
in-browser-Babel prototype; that lineage is still baked into the source as
`wf-`/`pt-` class prefixes, `--wf-*` token names, a parallel `WF` inline-token
object driving ~291 inline `style={{}}` blocks, dead kit CSS, and 27 "ported from
proto-*.jsx" comments. This plan removes all of it.

## Goal state

- **One styling system: CSS Modules.** No global `wf-`/`pt-` class prefixes —
  Modules scope class names, so the prefix problem disappears rather than being
  renamed.
- **No `WF` inline-token object.** Static styling lives in `.module.css`; only
  genuinely data-driven values (meter widths, drag transforms, runtime status
  colors) stay inline, fed as CSS custom properties.
- **Token variables renamed `--wf-*` → `--rt-*`** (release-tracker), preserving the
  paint-time, single-`[data-theme]`-swap re-theme behavior.

## Hard constraints

- **Do not touch** the store, derivations, `applySync`, sync client, types, or the
  Sync Contract / OpenAPI. This is a styling/structure refactor only.
- **Visual parity is the bar.** Light, dark, AND coastal themes must look
  identical before/after. The single-attribute re-theme (every token resolves at
  paint time) must keep working.
- **`prose.css` stays a global stylesheet** — it styles `dangerouslySetInnerHTML`
  output, which Module-scoped class names cannot reach. Leave it global; add a
  comment explaining the exemption.
- Tests (`npm test`) must stay green; they guard logic, not styling.
- Follow the repo's git convention (see memory `git-workflow`): prefer focused
  commits per phase.

## Current state (verified facts to re-confirm before starting)

- Styles: `src/styles/{tokens,wireframe,proto,prose}.css`, imported in
  `src/main.tsx`.
- Dead CSS (0 references in tsx): `.wf-btn`, `.wf-bar`, `.wf-input`, `.wf-area` in
  `wireframe.css`.
- `WF` inline-token object: `src/components/tokens.ts` — values are `'var(--wf-*)'`
  strings; ~200 `WF.*` references across components; 291 `style={{}}` blocks total
  (heaviest: `modals.tsx` 53, `Sprint.tsx` 49, `Release.tsx` 41).
- `pt-*` classes (12 unique) ↔ `src/components/primitives.tsx` + the modal shell.
- `wf-*` live classes: `wf-card` (16), `wf-mono` (13), `wf-tag` (10), `wf-dash`
  (6), `wf-screen` (6), `wf-dot`/`wf-avatar` (3), `wf-pts`/`wf-chip`/`wf-divider`
  (2), `wf-sprintrow`/`wf-now`/`wf-active`/`wf-flabel`/`wf-event`/`wf-calc`/
  `wf-field` (1–2).

> Re-run the greps to confirm counts haven't drifted before editing.

## Phases (each independently shippable)

### Phase 1 — Token rename (mechanical foundation)
- Find/replace `--wf-` → `--rt-` across `src/styles/*.css` and the value strings in
  `src/components/tokens.ts`.
- Drop the "extracted from the prototype's wireframe-kit" header in `tokens.css`.
- Verify: `grep -r '--wf-' src` is empty; `npm run build`; toggle all three themes.
- Commit: `refactor(css): rename --wf-* design tokens to --rt-*`.
- (Optional, deferred: semantic token names like `--color-ink`. Not in scope now.)

### Phase 2 — Primitives → CSS Modules (removes `pt-` prefix)
- Create `src/components/ui/`. Split `primitives.tsx` + modal shell into co-located
  `Button`, `Input`, `Modal` (backdrop/head/body/foot), `Toast`, `Segmented`,
  `IconButton`, each with a `*.module.css`.
- Move `pt-*` rules from `proto.css` into the matching Module (`.pt-btn`→`.btn`,
  `styles.btn`). Variants (`ghost`/`subtle`/`sm`/`danger`) become composed classes.
- Delete `proto.css` and its `main.tsx` import.
- Commit: `refactor(ui): move interactive primitives to CSS Modules`.

### Phase 3 — `wf-*` component classes → Modules; delete dead kit
- Delete dead: `.wf-btn`, `.wf-bar`, `.wf-input`, `.wf-area`.
- Component-specific (`wf-sprintrow`, `wf-card`, `wf-event`, `wf-pts`, `wf-dash`,
  `wf-now`) → into the using components' Modules.
- Genuinely-global utilities (`wf-mono`, `wf-tag`, `wf-screen`, theme transitions,
  box-sizing reset) → a small `base.css` with unprefixed names (`.mono`, `.tag`).
  Rename `wireframe.css` → `base.css`.
- Keep `prose.css` global (add the "why" comment); confirm it's on `--rt-*`.
- Commit: `refactor(css): scope wf component classes to Modules, drop dead kit`.

### Phase 4 — Eliminate `WF` + inline styles (the bulk)
- Per component, smallest first: `badges` → `CapBarInline` → `WorkItemCard` →
  `chrome` → `dnd` → routes → **`modals.tsx` last**.
- Per `style={{}}`: static → Module class; data-driven → inline **CSS custom
  property** (`style={{ '--seg-w': pct + '%' }}`, class reads `var(--seg-w)`).
  Runtime status colors → a tiny typed `Status → var(--rt-st-*)` helper (the only
  thing that may survive from `tokens.ts`).
- Drop each `WF` import as it empties; delete `tokens.ts` when fully unused.
- Commits: `refactor(<component>): replace inline styles with CSS Modules` (one per
  group).

### Phase 5 — Structure + de-provenance
- Split `modals.tsx` (644 lines) into one file per modal under `modals/`.
- Rename provenance barrels: fold `primitives.tsx` into `components/ui/`;
  `chrome.tsx` → `AppChrome.tsx`.
- Strip the 27 "ported from proto-*.jsx / wireframe-kit.jsx" comments; keep intent
  comments only where the *why* is non-obvious (EventStrip overflow algorithm,
  prose.css global exemption).
- Commit: `refactor: split modals, reorganize components/ui, drop provenance comments`.

### Phase 6 — Verify
- `npm run build` + `npm test`.
- Dev server: walk every screen against the prototype in light/dark/coastal;
  confirm DnD affordances, capacity meter fills, modal focus/Esc, event-strip
  overflow unchanged. Screenshot proof per the preview workflow.

## Start here
Begin with **Phase 1**. It's a safe global sweep that lands the `--rt-*` foundation
end-to-end and lets you confirm theming parity before the larger Phase 4 effort.
</content>
