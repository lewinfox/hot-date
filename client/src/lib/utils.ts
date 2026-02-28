/**
 * lib/utils.ts — Shared Utility Functions
 *
 * This file is the standard "utilities" module used by almost every component
 * in the project. At the moment it exports a single helper: `cn`.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn — Conditionally join CSS class names, with Tailwind-aware merging.
 *
 * Components in this project are styled with Tailwind CSS — a utility-first
 * framework where you compose styles by listing short class names on an element,
 * e.g. `className="text-sm font-bold text-red-500"`.
 *
 * Two problems arise when building reusable components:
 *
 *   Problem 1 — Conditional classes:
 *     You often want to apply a class only when some condition is true:
 *       className={`base-class ${isError ? 'text-red-500' : ''}`}
 *     But this gets messy fast. `clsx` solves it elegantly:
 *       cn('base-class', isError && 'text-red-500', { 'font-bold': isBold })
 *     clsx accepts strings, booleans, arrays, and objects; it filters out
 *     falsy values and joins everything into a single clean class string.
 *
 *   Problem 2 — Tailwind class conflicts:
 *     Tailwind generates a style for every class you use, but if the same
 *     property is set twice (e.g. `p-2` AND `p-4`), the one that "wins" is
 *     determined by the order in the CSS file — not the order in your HTML.
 *     This makes it impossible to reliably override styles by passing a
 *     `className` prop.
 *     `twMerge` understands Tailwind's class taxonomy and intelligently removes
 *     the earlier class when a later one overrides the same property:
 *       twMerge('p-2 p-4')  →  'p-4'   (not 'p-2 p-4')
 *
 * By piping clsx output through twMerge, `cn` handles both problems at once.
 * Usage throughout the codebase:
 *   cn('base', condition && 'extra', className)
 *
 * The `...inputs` rest parameter collects any number of arguments into an array,
 * so you can pass as many class fragments as you like.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
