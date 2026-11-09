/** Joins Tailwind class names, skipping empty values. */
import clsx, { type ClassValue } from 'clsx';
/** Combine class names. */
export const cn = (...classes: ClassValue[]) => clsx(classes);
