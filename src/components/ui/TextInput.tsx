import type { ComponentProps } from 'react';

/** Shared field styling for text/number inputs and textareas across dialogs. */
const FIELD_CLASS = 'w-full bg-panel-2 border border-line-soft rounded text-sm text-ink px-2 py-1.5';

/** Standard single-line input styled to match the app's dialog form fields. */
export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input className={`${FIELD_CLASS} ${className ?? ''}`.trim()} {...props} />;
}

/** Multi-line variant of TextInput (non-resizable, matches NoteDialog's textarea). */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={`${FIELD_CLASS} resize-none ${className ?? ''}`.trim()} {...props} />;
}
