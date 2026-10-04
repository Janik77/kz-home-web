interface SwitchProps {
  checked: boolean;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ checked, label, disabled = false, busy = false, onChange }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      disabled={disabled} aria-disabled={disabled || busy} className="switch" onClick={() => { if (!busy && !disabled) onChange(!checked); }}>
      <span className="switch__thumb" />
    </button>
  );
}
