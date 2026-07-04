import type { ComponentProps } from 'react';

/** Same field styling as TextInput, plus the cursor affordance every dialog select uses. */
const FIELD_CLASS = 'w-full bg-panel-2 border border-line-soft rounded text-sm text-ink px-2 py-1.5 cursor-pointer';

/** Standard <select> styled to match the app's dialog form fields. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={`${FIELD_CLASS} ${className ?? ''}`.trim()} {...props} />;
}
