import { streamVars } from './streamColor';

/** A soft-tinted work-stream pill (dot + label) for item-table rows. Color is
 *  keyed to the stream id via {@link streamVars}; a missing id renders the
 *  neutral "no stream" flavor. */
export function StreamChip({ workStreamId, label }: { workStreamId?: string | null; label: string }) {
  const { soft, text, dot } = streamVars(workStreamId);
  return (
    <span
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 9px 2px 7px',
        borderRadius: 20,
        background: soft,
        color: text,
        fontSize: 'var(--rt-fs-xs)',
        fontWeight: 'var(--rt-fw-semibold)',
        whiteSpace: 'nowrap',
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </span>
  );
}
