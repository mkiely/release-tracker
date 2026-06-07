/**
 * A thin vertical separator. Two forms:
 *  - default: a fixed 16px-tall hairline used inside wrapping filter bars.
 *  - `stretch`: a 1.5px rule that stretches to the row height with side margins,
 *    used between inline meta groups in the sprint/stream header rows.
 */
export function VDivider({ stretch }: { stretch?: boolean }) {
  return stretch ? (
    <span style={{ width: 1.5, alignSelf: 'stretch', background: 'var(--rt-line)', flexShrink: 0, margin: '0 4px' }} />
  ) : (
    <span style={{ width: 1, height: 16, background: 'var(--rt-line)', flexShrink: 0 }} />
  );
}
