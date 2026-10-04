import { useId, useRef, useState } from 'react';

interface RangeProps {
  label: string;
  accessibleLabel: string;
  value: number;
  disabled: boolean;
  revision?: string;
  onCommit: (value: number) => void;
}

/** Commit on release, key-up or blur, rather than issuing commands for every pointer movement. */
export function RangeControl({ label, accessibleLabel, value, disabled, revision = '', onCommit }: RangeProps) {
  const id = useId();
  const [draft, setDraft] = useState({ value, baseline: value, revision });
  const committed = useRef<typeof draft>(null);
  const currentDraft = draft.baseline === value && draft.revision === revision ? draft : null;
  // Discard old drafts permanently when confirmed data or the operation changes.
  // Keeping the same input node preserves keyboard focus, including after a failure.
  if (!currentDraft) setDraft({ value, baseline: value, revision });
  const shown = currentDraft?.value ?? value;
  function commit() {
    if (currentDraft && currentDraft.value !== value && committed.current !== currentDraft && !disabled) {
      committed.current = currentDraft;
      onCommit(currentDraft.value);
    }
  }
  return (
    <div className="range-control">
      <div className="range-control__label"><label htmlFor={id}>{label}</label><output htmlFor={id}>{shown}%</output></div>
      <input id={id} type="range" min="0" max="100" step="1" value={shown} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
        aria-label={accessibleLabel} aria-valuetext={`${shown}%`}
        onChange={(event) => { if (!disabled) setDraft({ value: Number(event.target.value), baseline: value, revision }); }}
        onPointerDown={(event) => { if (disabled) event.preventDefault(); }}
        onKeyDown={(event) => { if (disabled && event.key !== 'Tab') event.preventDefault(); }}
        onPointerUp={commit} onPointerCancel={() => setDraft({ value, baseline: value, revision })} onBlur={commit}
        onKeyUp={(event) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commit(); }} />
    </div>
  );
}
