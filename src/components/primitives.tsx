import {
  useEffect,
  type CSSProperties,
  type InputHTMLAttributes,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from './Icon';
import btnStyles from './ui/Button.module.css';
import inputStyles from './ui/Input.module.css';
import modalStyles from './ui/Modal.module.css';
import toastStyles from './ui/Toast.module.css';
import iconBtnStyles from './ui/IconButton.module.css';
import segStyles from './ui/PointSeg.module.css';
import fieldStyles from './ui/PField.module.css';
import metaStyles from './ui/MetaLine.module.css';

/** A labelled form field: an optional uppercase label (with an optional inline
 *  hint) above whatever control is passed as children. Wraps in a `<label>`. */
export function PField({
  label,
  hint,
  children,
  style,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label className={fieldStyles.field} style={{ minWidth: 0, ...style }}>
      {label && (
        <span className={fieldStyles.label}>
          {label}
          {hint && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 'var(--rt-fw-medium)', color: 'var(--rt-t3)' }}> · {hint}</span>}
        </span>
      )}
      {children}
    </label>
  );
}

// Themed form controls — native elements wearing the shared input style. They
// forward all native props, so use them anywhere a plain input/textarea/select fits.
export const PInput = (p: InputHTMLAttributes<HTMLInputElement>) => <input className={inputStyles.input} {...p} />;
export const PTextarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={inputStyles.input} {...p} />;
/** A one-line metadata footnote: label/value pairs in the smallest type on the
 *  ramp, for read-only facts that belong on a record but shouldn't cost a form
 *  row's height (item timestamps). Absent values render an em dash. */
export function PMetaLine({ items }: { items: { label: string; value: string | null; title?: string }[] }) {
  return (
    <div className={metaStyles.line}>
      {items.map((m, i) => (
        <span key={m.label} className={metaStyles.pair}>
          {i > 0 && <span className={metaStyles.sep} aria-hidden="true">·</span>}
          <span className={metaStyles.label}>{m.label}</span>
          <span title={m.title}>{m.value ?? '—'}</span>
        </span>
      ))}
    </div>
  );
}

export const PSelect = ({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={inputStyles.input} {...rest}>
    {children}
  </select>
);

/** The standard button. `variant` switches the visual style (default is the
 *  primary fill); `sm` is the compact size; `icon` renders before the label. */
export function PButton({
  children,
  variant,
  sm,
  icon,
  onClick,
  disabled,
  title,
  style,
}: {
  children: ReactNode;
  variant?: 'subtle' | 'ghost' | 'danger';
  sm?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
}) {
  const cls = [btnStyles.btn, variant && btnStyles[variant], sm && btnStyles.sm].filter(Boolean).join(' ');
  return (
    <button className={cls} onClick={onClick} disabled={disabled} title={title} style={style}>
      {icon}
      {children}
    </button>
  );
}

/** A square icon-only button. `title` doubles as the `aria-label` (required, since
 *  there's no text); `active` reflects a pressed/toggled state. */
export function IconButton({
  icon,
  onClick,
  title,
  style,
  active,
}: {
  icon: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  title?: string;
  style?: CSSProperties;
  active?: boolean;
}) {
  return (
    <button
      className={`${iconBtnStyles.iconbtn} ${active ? iconBtnStyles.iconbtnActive : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={style}
    >
      {icon}
    </button>
  );
}

/** Modal shell: a centered dialog with a titled header, scrollable body, and
 *  optional footer. Closes on Escape and on backdrop click. `width` caps the
 *  dialog's max width; `minHeight` reserves vertical presence for dialogs that are
 *  a workspace rather than a form (the timeline panel), so they don't collapse to a
 *  letterbox when the content happens to be short. The 92vh cap still applies. */
export function Modal({
  title,
  icon,
  onClose,
  footer,
  width = 480,
  minHeight,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number | string;
  minHeight?: number | string;
  children: ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div
      className={modalStyles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={modalStyles.modal} role="dialog" aria-modal="true" style={{ maxWidth: width, minHeight }}>
        <div className={modalStyles.head}>
          <div className={modalStyles.titleWrap}>
            {icon}
            <span className={modalStyles.title}>{title}</span>
          </div>
          <IconButton icon={Icon.close} onClick={onClose} title="Close" style={{ border: 'none', padding: 4 }} />
        </div>
        <div className={modalStyles.body}>{children}</div>
        {footer && <div className={modalStyles.foot}>{footer}</div>}
      </div>
    </div>
  );
}

/** A validation message under a field's control. Same treatment whether the rule
 *  was checked locally or handed back by the connector as a 422 field error. */
export function PFieldError({ children }: { children: ReactNode }) {
  return <span className={fieldStyles.error}>{children}</span>;
}

/** Two-column body for the work-item modals: `main` carries the description (the
 *  one field whose usefulness scales with the space it gets), `rail` the metadata
 *  fields that read fine at half the width. Collapses to a single stacked column on
 *  narrow viewports, which is what every other modal does unconditionally.
 *
 *  A separate component rather than a `Modal` prop, so the split stays opt-in at the
 *  one call site that wants it and `Modal` keeps a single body shape. */
export function ModalSplit({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className={modalStyles.splitBody}>
      <div className={modalStyles.splitMain}>{main}</div>
      <div className={modalStyles.splitRail}>{rail}</div>
    </div>
  );
}

/** A transient, bottom-anchored status message (e.g. after a sync or item move). */
export const Toast = ({ children }: { children: ReactNode }): ReactElement => (
  <div className={toastStyles.toast}>
    {Icon.sync}
    {children}
  </div>
);

/** A segmented control for picking a story-point estimate from a fixed scale
 *  (Fibonacci by default). */
export function PointSeg({
  value,
  onChange,
  options = [1, 2, 3, 5, 8, 13],
  disabled,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  options?: number[];
  disabled?: boolean;
}) {
  return (
    <div className={segStyles.seg} style={disabled ? { opacity: 0.55, pointerEvents: 'none' } : undefined}>
      <button key="null" type="button" disabled={disabled} className={value == null ? segStyles.on : ''} onClick={() => onChange(null)}>
        –
      </button>
      {options.map((p) => (
        <button key={p} type="button" disabled={disabled} className={p === value ? segStyles.on : ''} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}
