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
import { WF } from './tokens';
import btnStyles from './ui/Button.module.css';
import inputStyles from './ui/Input.module.css';
import modalStyles from './ui/Modal.module.css';
import toastStyles from './ui/Toast.module.css';
import iconBtnStyles from './ui/IconButton.module.css';
import segStyles from './ui/PointSeg.module.css';
import fieldStyles from './ui/PField.module.css';

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
          {hint && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: WF.t3 }}> · {hint}</span>}
        </span>
      )}
      {children}
    </label>
  );
}

export const PInput = (p: InputHTMLAttributes<HTMLInputElement>) => <input className={inputStyles.input} {...p} />;
export const PTextarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={inputStyles.input} {...p} />;
export const PSelect = ({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={inputStyles.input} {...rest}>
    {children}
  </select>
);

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

export function IconButton({
  icon,
  onClick,
  title,
  style,
}: {
  icon: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <button className={iconBtnStyles.iconbtn} onClick={onClick} title={title} aria-label={title} style={style}>
      {icon}
    </button>
  );
}

export function Modal({
  title,
  icon,
  onClose,
  footer,
  width = 480,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
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
      <div className={modalStyles.modal} role="dialog" aria-modal="true" style={{ maxWidth: width }}>
        <div className={modalStyles.head}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            {icon}
            <span style={{ fontSize: 17, fontWeight: 750, whiteSpace: 'nowrap' }}>{title}</span>
          </div>
          <IconButton icon={Icon.close} onClick={onClose} title="Close" style={{ border: 'none', padding: 4 }} />
        </div>
        <div className={modalStyles.body}>{children}</div>
        {footer && <div className={modalStyles.foot}>{footer}</div>}
      </div>
    </div>
  );
}

export const Toast = ({ children }: { children: ReactNode }): ReactElement => (
  <div className={toastStyles.toast}>
    {Icon.sync}
    {children}
  </div>
);

export function PointSeg({
  value,
  onChange,
  options = [1, 2, 3, 5, 8, 13],
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  options?: number[];
  disabled?: boolean;
}) {
  return (
    <div className={segStyles.seg} style={disabled ? { opacity: 0.55, pointerEvents: 'none' } : undefined}>
      {options.map((p) => (
        <button key={p} type="button" disabled={disabled} className={p === value ? segStyles.on : ''} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}
