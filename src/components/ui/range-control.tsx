import { useId, useRef, useState } from 'react';

interface RangeProps {
  label: string;
  accessibleLabel: string;
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}

/** Commit on release, key-up or blur, rather than issuing commands for every pointer movement. */
export function RangeControl({ label, accessibleLabel, value, disabled, onCommit }: RangeProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  function commit() {
    if (draft !== committed.current && !disabled) {
      committed.current = draft;
      onCommit(draft);
    }
  }
  return (
    <div className="range-control">
      <div className="range-control__label"><label htmlFor={id}>{label}</label><output htmlFor={id}>{draft}%</output></div>
      <input id={id} type="range" min="0" max="100" step="1" value={draft} disabled={disabled}
        aria-label={accessibleLabel} aria-valuetext={`${draft}%`}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={commit} onPointerCancel={commit} onBlur={commit}
        onKeyUp={(event) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commit(); }} />
    </div>
  );
}
