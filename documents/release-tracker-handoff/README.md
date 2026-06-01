# Handoff: Sprint Row — Horizontal Meta (Release Plan View)

## Overview

This handoff covers a redesign of the **sprint row** in the Release Tracker's
**Release Overview** screen (the "release plan view"). Each release shows a
vertical list of sprint rows; every row pairs a sprint's metadata with a lane
of work-stream cards.

**The change:** the sprint meta (name, date range, capacity, calendar events)
used to sit in a fixed-width column on the **left** of each row, with the
work-stream lane to its right. Because the meta column stacked its contents
vertically and let calendar-event badges wrap onto multiple lines, rows grew to
different heights depending on how long the sprint name was and how many events
fell inside the sprint. That made the list ragged and hard to scan.

The redesign moves the meta into a **single horizontal strip across the top** of
each row, with the work-stream lane below it. The strip is a fixed-height single
line, so **every sprint row is now the same height** regardless of content.
Long labels truncate with an ellipsis, and calendar events collapse to a `+N`
overflow chip when they don't fit.

This was the chosen direction (**"Variant B · Capacity meter inline"**) out of
four explored options — see `exploration/`.

## About the Design Files

The files in `prototype/` and `exploration/` are **design references built in
HTML/React (via in-browser Babel)** — runnable prototypes that demonstrate the
intended look and behavior. **They are not production code to copy verbatim.**

The task is to **recreate this sprint-row layout in the target codebase using
its established framework, component library, design tokens, and conventions.**
If the project has no front-end environment yet, choose the most appropriate
framework and implement it there. The prototype uses CSS custom properties and
inline styles for speed; map these to whatever styling system the real codebase
uses (CSS modules, Tailwind, styled-components, design-token variables, etc.).

## Fidelity

**High-fidelity.** Colors, typography, spacing, the capacity-bar behavior, and
the event-overflow logic are all final and intended to be reproduced precisely.
Note the visual language is an intentionally restrained, low-chroma "refined
wireframe" aesthetic (muted status hues, hairline borders) — that is the design,
not a placeholder. Match it.

---

## The Screen: Release Overview

**Route:** `release` (release overview). In the prototype, open it by setting
`localStorage['release-tracker:route'] = '{"screen":"release","releaseId":"rel_atlas"}'`
and reloading `prototype/Release Tracker Prototype.html`.

**Layout:** a top bar, then a two-column body via CSS grid
`gridTemplateColumns: '1fr 256px'`:
- **Left (1fr):** scrollable sprint board — a header line (`Sprints · N`, a
  caption, and a status legend) followed by the vertical stack of sprint rows
  (`display:flex; flexDirection:column; gap:8px`).
- **Right (256px):** a "Work streams" rail (unchanged by this work).

The component edited in this handoff is the **sprint row** inside the left
column. All code lives in `prototype/proto-app.jsx` inside `ReleaseScreen`, plus
two helper components added just above it: `CapBarInline` and `EventStrip`.

---

## Component Spec: Sprint Row

### Container (the row card)
- Base class `wf-card`: background `--wf-paper`, `1.5px solid --wf-line`,
  `border-radius: 12px`.
- Layout: `display:flex; flexDirection:column; overflow:hidden; cursor:pointer`.
- Hover (`.wf-sprintrow:hover`): border color → `--wf-line-strong`,
  `box-shadow: 0 2px 0 --wf-line`. Transition `border-color .12s, box-shadow .12s`.
- **Active sprint** (the sprint containing today's date) adds `.wf-active`:
  background → `--wf-st-ac-soft`, border → `--wf-st-ac-dot`; on hover border →
  `--wf-st-ac-text`. **There is no "Active" pill/badge** — active state is
  conveyed only by this tint + accent border (and the accent strip divider
  below). This was an explicit design decision.
- Clicking the row navigates to that sprint's detail screen.

The row has exactly two children, stacked: the **meta strip** and the **lane**.

### 1. Meta strip (top, fixed height)
A single horizontal flex line:
- `display:flex; alignItems:center; gap:12px; padding:9px 14px`.
- `borderBottom: 1.5px solid X` where X = `--wf-st-ac-dot` if the sprint is
  active, else `--wf-line`.

Children, in order:

1. **Sprint name**
   - `fontWeight:750; fontSize:13.5px; color:--wf-ink`.
   - `whiteSpace:nowrap; overflow:hidden; textOverflow:ellipsis; minWidth:0`.
   - `flex: 0 1 auto` — **shrink-only, never grow.** This is critical: a short
     name ("Sprint 2") sits at its natural width; a long custom name shrinks and
     ellipsizes **only when** the rest of the strip needs the space. Do not give
     it `flex-grow` — a grown short name steals room from the event strip.
   - Set `title={fullName}` so the full text is available on hover.

2. **Date range**
   - `fontSize:11.5px; color:--wf-t3; whiteSpace:nowrap; flex:0 0 auto`.
   - Format: `"{Mon} {D} – {Mon} {D}"`, e.g. `"Apr 13 – Apr 26"` (en-dash,
     spaces around it). See `fmtShort` in `proto-store.jsx`.

3. **Capacity meter** (`CapBarInline`) — see spec below. `flex:0 0 auto`, fixed
   `width:134px`.

4. **Event strip** (`EventStrip`) — see spec below. `flex:1 1 0; minWidth:0`,
   right-aligned (`justifyContent:flex-end`). Takes all remaining space.

### 2. Lane (below the strip)
- Wrapper `padding:10px 13px`.
- **Empty state:** a dashed card (`wf-card wf-dash`), `minHeight:44px`, centered
  text "No work items", `color:--wf-t3; fontSize:12.5px`.
- **Populated:** `display:flex; gap:7px; minWidth:0`. One card per work stream
  that has items in this sprint. Each card:
  - `flex: {itemCount} 1 0` → **card width is proportional to its item count.**
  - `minWidth:86px`, `wf-card`, `padding:8px 11px`, `background:--wf-paper`,
    `overflow:hidden`, `display:flex; flexDirection:column; gap:6px`.
  - Top line: stream name (`fontSize:13px; fontWeight:650`, ellipsis,
    `flex:1 1 auto; minWidth:0`) + item count (mono, `fontSize:11.5px;
    color:--wf-t3; flex:0 0 auto`).
  - Below: a status `SegBar` (height 6px) showing the status breakdown.
  - Clicking a lane card navigates to that work stream (stop event propagation
    so the row's own click doesn't also fire).

---

## Component Spec: `CapBarInline` (capacity meter)

A compact horizontal meter: a track plus a `planned/cap` numeric label. Replaces
the old stacked `CapacityMeter` in this row.

- Props: `planned` (points planned), `cap` (sprint capacity in points),
  `w` (width, default `134`).
- Container: `flex:0 0 auto; width:w; display:flex; alignItems:center; gap:8px`.
  Set a `title` tooltip: over → `"Over capacity by {planned-cap} pts"`, else
  `"{cap-planned} pts of capacity remaining"`.
- **Math:**
  - `over = planned > cap`
  - `ratio = cap > 0 ? min(planned/cap, 1) : (planned > 0 ? 1 : 0)`
  - `overW = (over && cap > 0) ? min((planned-cap)/cap, 0.5) : 0`
- **Track:** `flex:1; display:flex; height:6px; borderRadius:4px;
  overflow:hidden; background:--wf-fill`. Contains:
  - filled segment: `flex:ratio`, background `--wf-st-ac-dot` (or
    `--wf-st-bl-dot` if over).
  - if over: an overflow segment `flex:overW`, background `--wf-st-bl-text`.
  - else: a remainder spacer `flex:(1-ratio)` (transparent).
- **Label:** monospace, `fontSize:11px; fontWeight:700; whiteSpace:nowrap`,
  color `--wf-t2` (or `--wf-st-bl-text` if over). Text: `"{planned}/{cap}"`.

So an over-capacity sprint turns the bar and number red and shows how far past
the line it is.

---

## Component Spec: `EventStrip` (overflow-aware event badges)

Renders as many calendar-event badges as fit on **one line**, then a `+N` chip
for the rest. Never wraps — that's what keeps the row height constant.

- Props: `events` (array of `{ id, label, dateISO }`), `align` (default
  `flex-start`; the row uses `flex-end`).
- If `events` is empty, render an empty `flex:1 1 0; minWidth:0` spacer (so the
  capacity bar doesn't stretch into the gap).
- Outer wrapper: `flex:1 1 0; minWidth:0; overflow:hidden; display:flex;
  justifyContent:align; position:relative`.
- **Measurement strategy** (how it decides how many fit):
  1. Render an **off-screen measurer** — an absolutely-positioned, hidden
     (`visibility:hidden; pointerEvents:none`) flex row with `gap:5` containing
     **all** badges. On ref callback, record each child's `offsetWidth` into a
     ref array.
  2. In a layout effect, compute how many fit: walk the recorded widths
     accumulating `used` width with a `gap` of 5px between badges; before
     accepting badge `i`, if any badges remain after it, reserve
     `gap + moreW` (with `moreW = 30`) for the `+N` chip. Accept while
     `used + thisBadge + reserve <= containerClientWidth`. The count that fits is
     `vis`.
  3. Re-run on resize via a `ResizeObserver` on the wrapper.
- **Visible run:** a flex row `gap:5; alignItems:center; minWidth:0` containing
  the first `vis` badges, plus, when `vis < events.length`, a `+N` chip
  (reuse the `wf-pts` mono pill style; `title` = "{N} more event(s)").

### EventBadge (`wf-event`, from `wireframe-kit.jsx`)
- `display:inline-flex; alignItems:center; gap:6px; fontSize:11.5px;
  fontWeight:600; color:--wf-t2; background:--wf-paper;
  border:1.5px solid --wf-line; borderRadius:6px; padding:3px 8px;
  whiteSpace:nowrap`.
- A small 7×7px rounded square "flag" (`background:--wf-t3`) precedes the label.
- The date (`fmtShort(dateISO)`, e.g. "May 31") trails in `--wf-t3`,
  `fontWeight:500`.
- The badge itself truncates its **label** to 16 chars (`max` prop) with an
  ellipsis, independent of the strip-level overflow.

---

## Interactions & Behavior
- **Row click** → navigate to the sprint detail screen.
- **Lane card click** → navigate to that work stream (must `stopPropagation`).
- **Hover** on row → stronger border + subtle bottom shadow (see container spec).
- **Resize** → `EventStrip` recomputes how many event badges fit (ResizeObserver).
- No animations beyond the `.12s` border/shadow hover transitions and the
  global `.25s` theme-swap color transition.

## State / Data
This row is purely derived/presentational. For each sprint it needs:
- `name`, `startISO`, `endISO` (sprint).
- `planned` = sum of `points` over work items in the sprint.
- `cap` (capacity) = `sprintVel(team, sp.daysOff)` — see `proto-store.jsx`:
  `velocity * max(0, (fullCap - daysOff)/fullCap)`, rounded. `fullCap =
  members.length * 10`.
- `isActive` = today's date falls within `[startISO, endISO]`.
- `events` in the sprint = release events whose date is within the sprint range,
  sorted ascending (`eventsIn`).
- `lane` = per-work-stream `{ name, itemCount, statusSegments }` for streams with
  ≥1 item in the sprint (`statusSegs` builds the segment array).

All selectors/derivations already exist in `proto-store.jsx`; reuse the
equivalents in the real data layer.

---

## Design Tokens (light theme)

**A ready-to-use `design-tokens.css` is included at the root of this bundle** —
it contains the full light + dark custom-property set plus the component classes
the sprint row uses (`.wf-card`, `.wf-sprintrow`, `.wf-active`, `.wf-event`,
`.wf-pts`, …). Drop it in as a foundation, or fold the values into the
codebase's existing token/theme system if one exists. The values below are
reproduced for reference; the same data lives in that file and in
`wireframe-kit.jsx` (`#wf-theme` style block). The `[data-theme="dark"]` variant
activates by setting that attribute on `<html>`.

### Neutrals (light)
| Token | Hex | Use |
|---|---|---|
| `--wf-ink` | `#23262b` | primary text (names) |
| `--wf-t2` | `#5a606a` | secondary text, capacity label |
| `--wf-t3` | `#8b919b` | tertiary text (dates, counts, event date) |
| `--wf-line` | `#dde1e7` | hairline borders, dividers |
| `--wf-line-strong` | `#c4c9d1` | hover border, input border |
| `--wf-fill` | `#eef0f4` | meter track, chip background |
| `--wf-fill-deep` | `#e3e6ec` | deeper fill |
| `--wf-paper` | `#ffffff` | card / row background |
| `--wf-bg` | `#f6f7f9` | screen background |
| `--wf-on-ink` | `#ffffff` | text on dark buttons |

### Status hues (light) — `{dot, soft, text}`
| Status | dot | soft | text |
|---|---|---|---|
| Not Started | `#aab0ba` | `#eceef2` | `#6b717b` |
| Active | `#5b82b8` | `#e6edf6` | `#3f5e8c` |
| Blocked | `#c2785f` | `#f6e9e4` | `#9c5640` |
| Complete | `#6f9d77` | `#e7f0e8` | `#4d7a55` |

`dot` = bar/segment fill, `soft` = tinted background (active row, status chips),
`text` = readable text on soft. The capacity bar uses Active for normal and
Blocked for over-capacity.

### Dark theme (from `wireframe-kit.jsx`)
Neutrals: ink `#e9ebee`, t2 `#a6acb6`, t3 `#787e88`, line `#2c3036`,
line-strong `#3b404a`, fill `#24272d`, fill-deep `#2c3037`, paper `#1c1f24`,
bg `#131519`, on-ink `#15181c`. Status — Active dot `#6b93c9`/soft `#1d2a3b`/text
`#9cbde9`; Blocked dot `#d08a70`/soft `#352017`/text `#e2a78c` (Not Started &
Complete also defined in the file).

### Typography
- **Sans:** `"Hanken Grotesk", system-ui, sans-serif` (Google Fonts; weights
  400/500/600/700/750/800 are loaded — note the non-standard **750**).
- **Mono:** `ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace` — used
  for the capacity number and `+N` chip.
- Sizes used in the row: name 13.5/750, dates & events 11.5, lane stream name
  13/650, capacity label & counts 11/11.5 mono.

### Spacing / radii used in the row
- Strip padding `9px 14px`; lane padding `10px 13px`; lane card padding
  `8px 11px`.
- Strip gap `12px`; lane gap `7px`; capacity bar inner gap `8px`; event strip
  gap `5px`.
- Radii: card `12px`, lane card inherits `12px`, event badge `6px`, meter track
  `4px`, `wf-pts` chip `5px`.
- Border weight throughout: `1.5px`.
- Meter track height `6px`; status seg bar height `6px`; event flag `7×7px`.

## Assets
No image assets. All icons are inline SVGs defined in the `Icon` object in
`wireframe-kit.jsx` (chevrons, plus, calendar, sync, users, etc.). The event
"flag" is a CSS square, not an icon. If the real codebase has an icon set,
substitute equivalents.

## Screenshots (`screenshots/`)

- **`01-release-plan-view.png`** — the full Release Overview in context (top
  bar, sprint board, work-stream rail). Shows row rhythm, proportional lane
  cards, the active row's tint, and event overflow.
  *Note:* a couple of short sprint names appear ellipsized in this static
  capture — that's a font-substitution artifact of the image rasterizer, **not**
  the live behavior. In-browser, short names like "Sprint 2" render in full;
  truncation only kicks in when a long name competes with events for space (see
  screenshot 02, which rasterizes faithfully).
- **`02-variant-b-row-anatomy.png`** — the canonical close-up of the chosen row
  (variant B), with three states: a normal sprint, an over-capacity sprint with
  a long name + many events (`+N` overflow), and the active sprint (tint +
  accent border, no pill). This is the most accurate reference for the row.
- **`03-variants-explored.png`** — all four directions explored (A · Inline
  rail, **B · Capacity meter inline ← chosen**, C · Stat cells, D · Two-row),
  for context on why B was selected.

## Files in this bundle

- `design-tokens.css` — drop-in tokens (light + dark) + the sprint-row component
  classes. See "Design Tokens" above.
- `screenshots/` — the three reference images described above.

### `prototype/` — the live, integrated prototype
- `Release Tracker Prototype.html` — entry point; loads the scripts in order.
- `proto-app.jsx` — **the main file.** Contains `ReleaseScreen` (the release
  plan view) and the new `CapBarInline` + `EventStrip` helpers directly above
  it. This is the primary reference for the redesigned row.
- `wireframe-kit.jsx` — design tokens (light + dark CSS variables), base
  component styles, `EventBadge`, `SegBar`, `Icon`.
- `proto-store.jsx` — data model + derivation helpers (`sprintVel`, `capPct`,
  `eventsIn`, `statusSegs`, `fmtShort`, `activeSprint`, …).
- `proto-ui.jsx`, `proto-dnd.jsx`, `proto-modals.jsx` — supporting primitives,
  drag/capacity helpers (incl. the older stacked `CapacityMeter` still used on
  other screens), and modals. Included so the prototype runs end-to-end.

### `exploration/` — the four explored directions (context)
- `Sprint Row — Horizontal Meta.html` + `sprint-row-horizontal.jsx` — a design
  canvas showing all four variants (A · Inline rail, **B · Capacity meter inline
  ← chosen**, C · Stat cells, D · Two-row). Each variant is shown against three
  sample rows including a stress case (long name + over capacity + many events).
  Useful to see the rejected alternatives and the truncation behavior in
  isolation.
- `design-canvas.jsx` — the canvas wrapper used by that file.

### How to run the prototypes
Open either HTML file in a browser (they use CDN React + in-browser Babel, no
build step). For the integrated view, set the route in `localStorage` as noted
under "The Screen" above, then reload.
