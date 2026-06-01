// wireframe-kit.jsx — clean greyscale wireframe primitives
// Exports W.* components + tokens to window. Slightly-refined low-fi look:
// real labels in a clean grotesk, grey bars for body copy, restrained
// status colors. Load before the screen files.

// Tokens are CSS custom properties so a single [data-theme] swap on <html>
// re-themes everything — both injected CSS rules AND React inline styles,
// since var() resolves at paint time in both. Light is the default; dark
// overrides live in the wf-theme <style> block below.
const WF = {
  ink: 'var(--wf-ink)',
  t2: 'var(--wf-t2)',
  t3: 'var(--wf-t3)',
  line: 'var(--wf-line)',
  lineStrong: 'var(--wf-line-strong)',
  fill: 'var(--wf-fill)',
  fillDeep: 'var(--wf-fill-deep)',
  paper: 'var(--wf-paper)',
  bg: 'var(--wf-bg)',
  onInk: 'var(--wf-on-ink)',
  status: {
    'Not Started': { dot: 'var(--wf-st-ns-dot)', soft: 'var(--wf-st-ns-soft)', text: 'var(--wf-st-ns-text)' },
    'Active':      { dot: 'var(--wf-st-ac-dot)', soft: 'var(--wf-st-ac-soft)', text: 'var(--wf-st-ac-text)' },
    'Blocked':     { dot: 'var(--wf-st-bl-dot)', soft: 'var(--wf-st-bl-soft)', text: 'var(--wf-st-bl-text)' },
    'Complete':    { dot: 'var(--wf-st-co-dot)', soft: 'var(--wf-st-co-soft)', text: 'var(--wf-st-co-text)' },
  },
  sans: '"Hanken Grotesk", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
};

// ---- theme variable definitions (light default + dark override) ----------
if (typeof document !== 'undefined' && !document.getElementById('wf-theme')) {
  const t = document.createElement('style');
  t.id = 'wf-theme';
  t.textContent = `
  :root{
    color-scheme:light;
    --wf-ink:#23262b; --wf-t2:#5a606a; --wf-t3:#8b919b;
    --wf-line:#dde1e7; --wf-line-strong:#c4c9d1;
    --wf-fill:#eef0f4; --wf-fill-deep:#e3e6ec;
    --wf-paper:#ffffff; --wf-bg:#f6f7f9; --wf-on-ink:#ffffff;
    --wf-backdrop:rgba(35,38,43,0.42); --wf-shadow:rgba(0,0,0,.28);
    /* muted, desaturated status hues so it still reads as a wireframe */
    --wf-st-ns-dot:#aab0ba; --wf-st-ns-soft:#eceef2; --wf-st-ns-text:#6b717b;
    --wf-st-ac-dot:#5b82b8; --wf-st-ac-soft:#e6edf6; --wf-st-ac-text:#3f5e8c;
    --wf-st-bl-dot:#c2785f; --wf-st-bl-soft:#f6e9e4; --wf-st-bl-text:#9c5640;
    --wf-st-co-dot:#6f9d77; --wf-st-co-soft:#e7f0e8; --wf-st-co-text:#4d7a55;
  }
  :root[data-theme="dark"]{
    color-scheme:dark;
    --wf-ink:#e9ebee; --wf-t2:#a6acb6; --wf-t3:#787e88;
    --wf-line:#2c3036; --wf-line-strong:#3b404a;
    --wf-fill:#24272d; --wf-fill-deep:#2c3037;
    --wf-paper:#1c1f24; --wf-bg:#131519; --wf-on-ink:#15181c;
    --wf-backdrop:rgba(6,7,9,0.6); --wf-shadow:rgba(0,0,0,.55);
    --wf-st-ns-dot:#787e88; --wf-st-ns-soft:#272b31; --wf-st-ns-text:#9da3ad;
    --wf-st-ac-dot:#6b93c9; --wf-st-ac-soft:#1d2a3b; --wf-st-ac-text:#9cbde9;
    --wf-st-bl-dot:#d08a70; --wf-st-bl-soft:#352017; --wf-st-bl-text:#e2a78c;
    --wf-st-co-dot:#7fae87; --wf-st-co-soft:#1b2a1f; --wf-st-co-text:#9bcfa3;
  }
  html,body{transition:background-color .25s ease}
  .wf-screen,.pt-modal,.wf-card,.pt-in,.pt-btn,.pt-iconbtn{transition:background-color .25s ease,border-color .25s ease,color .25s ease}
  `;
  document.head.appendChild(t);
}

if (typeof document !== 'undefined' && !document.getElementById('wf-styles')) {
  const s = document.createElement('style');
  s.id = 'wf-styles';
  s.textContent = `
  .wf{font-family:${WF.sans};color:${WF.ink};box-sizing:border-box;-webkit-font-smoothing:antialiased}
  .wf *{box-sizing:border-box}
  .wf-screen{width:100%;height:100%;background:${WF.bg};overflow:hidden;position:relative;display:flex;flex-direction:column}
  .wf-mono{font-family:${WF.mono}}
  /* placeholder text bar */
  .wf-bar{height:9px;border-radius:5px;background:${WF.fill};display:block}
  .wf-bar.d{background:${WF.fillDeep}}
  /* buttons */
  .wf-btn{font-family:${WF.sans};font-weight:600;font-size:14px;border-radius:8px;padding:10px 16px;
    border:1.5px solid ${WF.ink};background:${WF.ink};color:${WF.onInk};cursor:default;display:inline-flex;
    align-items:center;gap:8px;line-height:1;white-space:nowrap}
  .wf-btn.ghost{background:transparent;color:${WF.ink}}
  .wf-btn.subtle{background:${WF.paper};color:${WF.t2};border-color:${WF.line}}
  .wf-btn.sm{padding:7px 11px;font-size:12.5px;border-radius:7px;gap:6px}
  /* fields */
  .wf-field{display:flex;flex-direction:column;gap:7px}
  .wf-flabel{font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:${WF.t3}}
  .wf-input{border:1.5px solid ${WF.lineStrong};background:${WF.paper};border-radius:9px;padding:12px 13px;
    font-size:15px;color:${WF.t3};display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:46px}
  .wf-input > span:first-child{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .wf-input.filled{color:${WF.ink};font-weight:500}
  /* cards / panels */
  .wf-card{background:${WF.paper};border:1.5px solid ${WF.line};border-radius:12px}
  .wf-dash{border-style:dashed;border-color:${WF.lineStrong};background:transparent}
  /* chips */
  .wf-chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;
    padding:4px 9px;border-radius:999px;line-height:1;white-space:nowrap}
  .wf-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
  .wf-event{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:${WF.t2};
    background:${WF.paper};border:1.5px solid ${WF.line};border-radius:6px;padding:3px 8px;line-height:1;white-space:nowrap}
  .wf-event .wf-flag{width:7px;height:7px;border-radius:2px;background:${WF.t3}}
  .wf-avatar{width:30px;height:30px;border-radius:50%;background:${WF.fillDeep};border:1.5px solid ${WF.line};
    display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${WF.t2}}
  .wf-tag{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${WF.t3}}
  .wf-pts{font-family:${WF.mono};font-size:11px;font-weight:700;color:${WF.t2};background:${WF.fill};
    border-radius:5px;padding:2px 6px;line-height:1;white-space:nowrap}
  .wf-sprintrow{transition:border-color .12s, box-shadow .12s}
  .wf-sprintrow:hover{border-color:${WF.lineStrong};box-shadow:0 2px 0 ${WF.line}}
  .wf-active{background:${WF.status.Active.soft};border-color:${WF.status.Active.dot}}
  .wf-active:hover{border-color:${WF.status.Active.text}}
  .wf-now{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fff;
    background:${WF.status.Active.dot};border-radius:4px;padding:2px 5px;line-height:1}
  .wf-area{border:1.5px solid ${WF.lineStrong};background:${WF.paper};border-radius:9px;padding:12px 13px;
    font-size:14px;color:${WF.t3};min-height:74px;display:block;line-height:1.5}
  .wf-calc{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:13px}
  .wf-calc .k{color:${WF.t2};white-space:nowrap}
  .wf-calc .v{font-family:${WF.mono};font-weight:600;color:${WF.ink};white-space:nowrap}
  .wf-divider{height:1.5px;background:${WF.line};border:0;width:100%}
  `;
  document.head.appendChild(s);
}

// ---- primitives ----------------------------------------------------------
const Bar = ({ w = '100%', deep, style }) => (
  <span className={'wf-bar' + (deep ? ' d' : '')} style={{ width: w, ...style }} />
);

// stack of placeholder lines
const Lines = ({ n = 3, widths, gap = 7, deep, style }) => {
  const ws = widths || Array.from({ length: n }, (_, i) => (i === n - 1 ? '60%' : '100%'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
      {ws.map((w, i) => <Bar key={i} w={w} deep={deep} />)}
    </div>
  );
};

const Btn = ({ children, variant = 'primary', sm, icon, style }) => (
  <span className={'wf-btn' + (variant === 'ghost' ? ' ghost' : variant === 'subtle' ? ' subtle' : '') + (sm ? ' sm' : '')} style={style}>
    {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
    {children}
  </span>
);

const Field = ({ label, placeholder, value, icon, style }) => (
  <div className="wf-field" style={style}>
    {label && <span className="wf-flabel">{label}</span>}
    <span className={'wf-input' + (value ? ' filled' : '')}>
      <span>{value || placeholder}</span>
      {icon}
    </span>
  </div>
);

const StatusChip = ({ status, count }) => {
  const c = WF.status[status] || WF.status['Not Started'];
  return (
    <span className="wf-chip" style={{ background: c.soft, color: c.text }}>
      <span className="wf-dot" style={{ background: c.dot }} />
      {status}{count != null ? ` · ${count}` : ''}
    </span>
  );
};

const EventBadge = ({ children, date, max = 16 }) => {
  const full = typeof children === 'string' ? children : null;
  const txt = full && full.length > max ? full.slice(0, max - 1) + '\u2026' : children;
  return (
    <span className="wf-event" title={full || undefined}>
      <span className="wf-flag" style={{ flex: '0 0 auto' }} />
      <span style={{ whiteSpace: 'nowrap', flex: '0 0 auto' }}>{txt}</span>
      {date ? <span style={{ color: WF.t3, fontWeight: 500, flex: '0 0 auto' }}>{date}</span> : null}
    </span>
  );
};

const Avatar = ({ initials }) => <span className="wf-avatar">{initials}</span>;

// segmented micro-bar showing status breakdown of a set of items
const SegBar = ({ segs, height = 7, radius = 4 }) => (
  <div style={{ display: 'flex', height, borderRadius: radius, overflow: 'hidden', background: WF.fill, gap: 1.5 }}>
    {segs.map((s, i) => (
      <div key={i} style={{ flex: s.v, background: (WF.status[s.k] || {}).dot || WF.lineStrong }} />
    ))}
  </div>
);

// chevron / plus / sync glyphs
const Icon = {
  chevDown: <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg>,
  chevRight: <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4.5 2.5L8 6l-3.5 3.5" /></svg>,
  chevLeft: <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M7.5 2.5L4 6l3.5 3.5" /></svg>,
  plus: <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 2v8M2 6h8" /></svg>,
  cal: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" strokeLinecap="round" /></svg>,
  sync: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M13 4.5A5.5 5.5 0 0 0 3 6M3 2.5V6h3.5M3 11.5A5.5 5.5 0 0 0 13 10M13 13.5V10H9.5" /></svg>,
  users: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="5" r="2.4" /><path d="M2 13c0-2.2 1.8-3.6 4-3.6S10 10.8 10 13" strokeLinecap="round" /><path d="M11 3.2A2.2 2.2 0 0 1 12 7.4M11.5 9.6c1.7.3 2.9 1.6 2.9 3.4" strokeLinecap="round" /></svg>,
  close: <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2.5 4h9M5.5 4V2.8h3V4M3.7 4l.5 7.2h5.6l.5-7.2" /></svg>,
  edit: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9.3 2.4l2.3 2.3M10.2 1.5a1.2 1.2 0 0 1 1.7 1.7L4.4 10.7 1.8 11.5l.8-2.6 7.6-7.4z" /></svg>,
  sun: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="3.1" /><path d="M8 1.4v1.7M8 12.9v1.7M1.4 8h1.7M12.9 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M12.7 3.3l-1.2 1.2M4.5 11.5l-1.2 1.2" /></svg>,
  moon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 9.4A5.6 5.6 0 0 1 6.6 2.5a5.6 5.6 0 1 0 6.9 6.9z" /></svg>,
};

Object.assign(window, { WF, Bar, Lines, Btn, Field, StatusChip, EventBadge, Avatar, SegBar, Icon });
