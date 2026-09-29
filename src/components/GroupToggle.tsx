// How the Sprint view groups its work items — by work stream, or by status.
//
// Both sprint presenters render this control identically, and both used to carry
// their own copy of it. The first consolidation converged the *styling* (the table
// presenter had hand-rolled buttons where the card presenter used SegmentedToggle)
// but left the two declarations behind, so the option labels still had to agree by
// eye. One component now, so they can't drift.

import type { SprintGroupBy } from '../store/sprintGroupBy';
import { SegmentedToggle } from './SegmentedToggle';

export function GroupToggle({
  value,
  onChange,
}: {
  value: SprintGroupBy;
  onChange: (v: SprintGroupBy) => void;
}) {
  return (
    <SegmentedToggle<SprintGroupBy>
      ariaLabel="Group work items by"
      value={value}
      onChange={onChange}
      options={[
        { value: 'stream', label: 'By stream', title: 'Group by work stream' },
        { value: 'status', label: 'By status', title: 'Group by status' },
      ]}
    />
  );
}
