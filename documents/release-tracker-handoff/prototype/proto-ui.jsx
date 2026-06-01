// proto-ui.jsx — interactive primitives for the clickable prototype.
// Reuses WF tokens + Icon from wireframe-kit.jsx; adds real inputs, modal, toast.

if (typeof document !== 'undefined' && !document.getElementById('proto-styles')) {
  const s = document.createElement('style');
  s.id = 'proto-styles';
  s.textContent = `
  .pt-root{font-family:${WF.sans};color:${WF.ink};-webkit-font-smoothing:antialiased}
  .pt-backdrop, .pt-backdrop *, .pt-modal, .pt-modal *{box-sizing:border-box}
  .pt-in{width:100%;border:1.5px solid ${WF.lineStrong};background:${WF.paper};border-radius:9px;
    padding:11px 13px;font-size:15px;font-family:${WF.sans};color:${WF.ink};min-height:46px;outline:none}
  .pt-in::placeholder{color:${WF.t3}}
  .pt-in:focus{border-color:${WF.ink};box-shadow:0 0 0 3px ${WF.fill}}
  select.pt-in{appearance:none;-webkit-appearance:none;cursor:pointer;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='%238b919b' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M2.5 4.5L6 8l3.5-3.5'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-position:right 13px center;padding-right:34px}
  textarea.pt-in{min-height:78px;resize:vertical;line-height:1.5}
  .pt-btn{font-family:${WF.sans};font-weight:600;font-size:14px;border-radius:8px;padding:10px 16px;
    border:1.5px solid ${WF.ink};background:${WF.ink};color:${WF.onInk};cursor:pointer;display:inline-flex;
    align-items:center;gap:8px;line-height:1;white-space:nowrap;transition:transform .06s, opacity .12s}
  .pt-btn:hover{opacity:.9}.pt-btn:active{transform:translateY(1px)}
  .pt-btn.ghost{background:transparent;color:${WF.ink}}
  .pt-btn.subtle{background:${WF.paper};color:${WF.t2};border-color:${WF.line}}
  .pt-btn.subtle:hover{border-color:${WF.lineStrong};opacity:1}
  .pt-btn.sm{padding:8px 12px;font-size:12.5px;border-radius:7px;gap:6px}
  .pt-btn.danger{background:transparent;border-color:transparent;color:${WF.status.Blocked.text};padding:6px}
  .pt-btn[disabled]{opacity:.4;cursor:not-allowed}
  .pt-iconbtn{display:inline-flex;align-items:center;justify-content:center;border:1.5px solid ${WF.line};
    background:${WF.paper};color:${WF.t2};border-radius:8px;padding:7px;cursor:pointer;transition:border-color .12s}
  .pt-iconbtn:hover{border-color:${WF.lineStrong};color:${WF.ink}}
  .pt-link{cursor:pointer}
  .pt-backdrop{position:fixed;inset:0;background:var(--wf-backdrop);display:flex;align-items:center;
    justify-content:center;z-index:50;padding:24px;animation:ptfade .14s ease}
  @keyframes ptfade{from{opacity:0}to{opacity:1}}
  .pt-modal{background:${WF.paper};border-radius:14px;box-shadow:0 24px 70px var(--wf-shadow);
    width:100%;display:flex;flex-direction:column;max-height:92vh;animation:ptpop .16s ease}
  @keyframes ptpop{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:none}}
  .pt-mhead{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1.5px solid ${WF.line}}
  .pt-mbody{padding:22px;display:flex;flex-direction:column;gap:16px;overflow:auto}
  .pt-mfoot{display:flex;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1.5px solid ${WF.line}}
  .pt-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:80;
    background:${WF.ink};color:${WF.onInk};border-radius:10px;padding:12px 18px;font-size:13.5px;font-weight:600;
    display:flex;align-items:center;gap:10px;box-shadow:0 12px 36px rgba(0,0,0,.25);animation:pttoast .2s ease}
  @keyframes pttoast{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
  .pt-seg{display:flex;gap:8px}
  .pt-seg > button{flex:1;text-align:center;padding:11px 0;border-radius:9px;font-weight:700;font-size:15px;
    border:1.5px solid ${WF.line};background:${WF.paper};color:${WF.t2};cursor:pointer;font-family:${WF.sans}}
  .pt-seg > button.on{border-color:${WF.ink};background:${WF.ink};color:${WF.onInk}}
  `;
  document.head.appendChild(s);
}

const PField = ({ label, hint, children, style }) => (
  <label className="wf-field" style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0, ...style }}>
    {label && <span className="wf-flabel">{label}{hint && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: WF.t3 }}> · {hint}</span>}</span>}
    {children}
  </label>
);

const PInput = (p) => <input className="pt-in" {...p} />;
const PTextarea = (p) => <textarea className="pt-in" {...p} />;
const PSelect = ({ value, onChange, children, ...rest }) => <select className="pt-in" value={value} onChange={onChange} {...rest}>{children}</select>;

const PButton = ({ children, variant, sm, icon, onClick, disabled, style }) => (
  <button className={'pt-btn' + (variant ? ' ' + variant : '') + (sm ? ' sm' : '')} onClick={onClick} disabled={disabled} style={style}>
    {icon}{children}
  </button>
);

const IconButton = ({ icon, onClick, title, style }) => (
  <button className="pt-iconbtn" onClick={onClick} title={title} style={style}>{icon}</button>
);

const Modal = ({ title, icon, onClose, footer, width = 480, children }) => {
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="pt-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pt-modal" style={{ maxWidth: width }}>
        <div className="pt-mhead">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            {icon}<span style={{ fontSize: 17, fontWeight: 750, whiteSpace: 'nowrap' }}>{title}</span>
          </div>
          <IconButton icon={Icon.close} onClick={onClose} title="Close" style={{ border: 'none', padding: 4 }} />
        </div>
        <div className="pt-mbody">{children}</div>
        {footer && <div className="pt-mfoot">{footer}</div>}
      </div>
    </div>
  );
};

const Toast = ({ children }) => <div className="pt-toast">{Icon.sync}{children}</div>;

// segmented point selector
const PointSeg = ({ value, onChange, options = [1, 2, 3, 5, 8, 13] }) => (
  <div className="pt-seg">
    {options.map((p) => (
      <button key={p} type="button" className={p === value ? 'on' : ''} onClick={() => onChange(p)}>{p}</button>
    ))}
  </div>
);

Object.assign(window, { PField, PInput, PTextarea, PSelect, PButton, IconButton, Modal, Toast, PointSeg });
