// Interactive primitives — ported from proto-ui.jsx. Styles live in proto.css.

import {
  useEffect,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from './Icon';
import { WF } from './tokens';

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
    <label className="wf-field" style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0, ...style }}>
      {label && (
        <span className="wf-flabel">
          {label}
          {hint && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: WF.t3 }}> · {hint}</span>}
        </span>
      )}
      {children}
    </label>
  );
}

export const PInput = (p: InputHTMLAttributes<HTMLInputElement>) => <input className="pt-in" {...p} />;
export const PTextarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className="pt-in" {...p} />;
export const PSelect = ({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className="pt-in" {...rest}>
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
  return (
    <button
      className={'pt-btn' + (variant ? ' ' + variant : '') + (sm ? ' sm' : '')}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
    >
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
  onClick?: () => void;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <button className="pt-iconbtn" onClick={onClick} title={title} aria-label={title} style={style}>
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
      className="pt-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pt-modal" role="dialog" aria-modal="true" style={{ maxWidth: width }}>
        <div className="pt-mhead">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            {icon}
            <span style={{ fontSize: 17, fontWeight: 750, whiteSpace: 'nowrap' }}>{title}</span>
          </div>
          <IconButton icon={Icon.close} onClick={onClose} title="Close" style={{ border: 'none', padding: 4 }} />
        </div>
        <div className="pt-mbody">{children}</div>
        {footer && <div className="pt-mfoot">{footer}</div>}
      </div>
    </div>
  );
}

export const Toast = ({ children }: { children: ReactNode }): ReactElement => (
  <div className="pt-toast">
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
    <div className="pt-seg" style={disabled ? { opacity: 0.55, pointerEvents: 'none' } : undefined}>
      {options.map((p) => (
        <button key={p} type="button" disabled={disabled} className={p === value ? 'on' : ''} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}
