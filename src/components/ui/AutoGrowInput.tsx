import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
 * Text input that grows to fit its content by measuring an offscreen mirror
 * span in the same font, rather than guessing via `ch` units — fonts vary
 * wildly in glyph width across themes (condensed display faces, monospace
 * terminal fonts), so a character-count estimate is often wrong.
 */
export function AutoGrowInput({
  id, name, value, onChange, onCommit, onCancel, title, className, minWidthCh = 4,
}: AutoGrowInputProps) {
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    if (mirrorRef.current) setWidth(mirrorRef.current.offsetWidth);
  }, [value]);

  // The mirror may be measured against a fallback font while the theme's
  // custom @font-face is still downloading, undershooting or overshooting
  // the real glyph widths. Re-measure once webfonts actually finish loading
  // so an in-progress edit snaps to the correct width instead of staying
  // stuck at a fallback-font estimate.
  useEffect(() => {
    const remeasure = () => { if (mirrorRef.current) setWidth(mirrorRef.current.offsetWidth); };
    document.fonts?.ready.then(remeasure);
    document.fonts?.addEventListener('loadingdone', remeasure);
    return () => document.fonts?.removeEventListener('loadingdone', remeasure);
  }, []);

  return (
    <span className="relative inline-block align-middle">
      <span
        ref={mirrorRef}
        aria-hidden
        className={`${className ?? ''} invisible absolute top-0 left-0 whitespace-pre pointer-events-none`}
        style={{ minWidth: `${minWidthCh}ch` }}
      >
        {value || ' '}
      </span>
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
        className={`${className ?? ''} transition-[width] duration-100 ease-out`}
        style={{ width: width !== undefined ? `${width}px` : `${minWidthCh}ch`, minWidth: `${minWidthCh}ch` }}
      />
    </span>
  );
}
