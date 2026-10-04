interface SwitchProps {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ checked, label, disabled = false, onChange }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      disabled={disabled} className="switch" onClick={() => onChange(!checked)}>
      <span className="switch__thumb" />
    </button>
  );
}
