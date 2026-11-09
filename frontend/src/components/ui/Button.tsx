/** Button variants and sizes used across the app. */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-ink font-semibold hover:bg-accent-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_0_0_1px_rgb(181_242_61/0.4)] disabled:bg-accent/40',
  secondary: 'bg-surface-3 text-fg hover:bg-line-2 border border-line-2',
  outline: 'border border-line-2 text-fg-2 hover:text-fg hover:border-faint hover:bg-surface-2',
  ghost: 'text-fg-2 hover:text-fg hover:bg-surface-3',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
};
const SIZE: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded',
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-md',
  lg: 'h-10 px-4 text-[14px] gap-2 rounded-lg',
};

/** Button options. `kbd` shows a keyboard hint inside the button. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  kbd?: string;
}

/** Standard button; shows a spinner and disables itself while `loading`. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, kbd, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background,color,border,box-shadow,transform] duration-100 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
      {kbd && <span className="kbd ml-1 opacity-70">{kbd}</span>}
    </button>
  );
});

/** Square button holding only an icon. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, className, size = 'sm', variant = 'ghost', ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      variant={variant}
      size={size}
      className={cn(size === 'xs' ? 'w-6 px-0' : size === 'sm' ? 'w-7 px-0' : 'w-8 px-0', className)}
      {...rest}
    />
  );
});
