import type { ComponentProps } from 'react';

const BASE_CLASS = 'px-3 py-1.5 text-sm rounded';

const VARIANT_CLASS = {
  primary: 'bg-accent text-canvas hover:opacity-90',
  danger: 'bg-danger/80 text-canvas hover:bg-danger',
  ghost: 'bg-panel-2 text-ink-mid hover:text-ink',
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASS;

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
}

/** Shared dialog/action button; `variant` maps to the app's primary/danger/ghost color treatments. */
export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return <button className={`${BASE_CLASS} ${VARIANT_CLASS[variant]} ${className ?? ''}`.trim()} {...props} />;
}
