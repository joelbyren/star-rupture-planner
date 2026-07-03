interface AutoGrowInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  title?: string;
  className?: string;
  minWidthCh?: number;
}

/**
 * Text input that grows to fit its content. Uses the browser-native
 * `field-sizing: content`, so the same layout engine that renders the text
 * also sizes the box — there is no mirror element to keep in sync, and no
 * font/kerning/letter-spacing/uppercase discrepancy to correct for. Works
 * uniformly across every theme's font (monospace or proportional).
 */
export function AutoGrowInput({
  id, name, value, onChange, onCommit, onCancel, title, className, minWidthCh = 4,
}: AutoGrowInputProps) {
  return (
    <input
      id={id}
      name={name}
      autoComplete="off"
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') { onCancel(); e.currentTarget.blur(); }
      }}
      title={title}
      className={`field-sizing-content ${className ?? ''}`}
      style={{ minWidth: `${minWidthCh}ch` }}
    />
  );
}
