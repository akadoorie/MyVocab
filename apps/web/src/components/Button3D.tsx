import type { ButtonHTMLAttributes, Ref } from 'react';

export type Button3DVariant = 'accent' | 'know' | 'dontknow' | 'hint' | 'stop';

export type Button3DProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Button3DVariant;
  size?: 'md' | 'lg';
  ref?: Ref<HTMLButtonElement>;
};

/** A pressable-ledge 3D button (PRD §9.2). Disabled buttons lose the ledge and look muted. */
export function Button3D({
  variant = 'accent',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: Button3DProps) {
  const classes = ['btn3d'];
  if (variant !== 'accent') classes.push(`btn3d--${variant}`);
  if (size === 'lg') classes.push('btn3d--lg');
  if (className) classes.push(className);
  return <button type={type} className={classes.join(' ')} {...rest} />;
}
