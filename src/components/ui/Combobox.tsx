import { useEffect, useMemo, useState } from 'react';

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
      <input
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
        className="w-full bg-slate-700 border border-slate-500 rounded text-sm text-white px-2 py-1.5 outline-none focus:border-violet-500"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-slate-700 border border-slate-500 rounded shadow-lg">
          {filtered.map((o, i) => (
            <li
              key={o.id}
              onMouseDown={() => choose(o)}
              onMouseEnter={() => setActive(i)}
              className={`px-2 py-1.5 text-sm cursor-pointer flex justify-between gap-2 ${
                i === active ? 'bg-violet-600 text-white' : 'text-slate-200'
              }`}
            >
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="text-xs text-slate-400 shrink-0">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
