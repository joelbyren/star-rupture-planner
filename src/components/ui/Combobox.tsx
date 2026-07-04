import { useEffect, useMemo, useState } from 'react';
import { TextInput } from './TextInput.tsx';

export interface ComboboxOption {
  id: string;
  label: string;
  /** Optional secondary text shown muted (e.g. item type). */
  hint?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Autocomplete: text input + filtered list, keyboard up/down/enter. No deps. */
export function Combobox({ options, value, onChange, placeholder, autoFocus }: ComboboxProps) {
  const selected = options.find(o => o.id === value);
  const [query, setQuery] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Reflect externally-driven value changes (e.g. a pre-filled selection).
  useEffect(() => {
    setQuery(selected?.label ?? '');
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options
      .filter(o => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
      .slice(0, 50);
  }, [query, options]);

  function choose(opt: ComboboxOption) {
    onChange(opt.id);
    setQuery(opt.label);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <TextInput
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className="outline-none focus:border-accent"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-panel-2 border border-line-soft rounded shadow-lg">
          {filtered.map((o, i) => (
            <li
              key={o.id}
              onMouseDown={() => choose(o)}
              onMouseEnter={() => setActive(i)}
              className={`px-2 py-1.5 text-sm cursor-pointer flex justify-between gap-2 ${
                i === active ? 'bg-accent text-canvas' : 'text-ink-mid'
              }`}
            >
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="text-xs text-ink-dim shrink-0">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
