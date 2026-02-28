/**
 * components/Button.tsx — Reusable Animated Button Component
 *
 * This file defines a single `Button` component used everywhere in the app.
 * Rather than writing `<button className="...a dozen Tailwind classes...">` at
 * every call site, we encapsulate the styling and behaviour here so each usage
 * site just writes `<Button variant="primary" size="lg">Click me</Button>`.
 *
 * It wraps framer-motion's `<motion.button>` instead of a plain `<button>` to
 * get a subtle press animation (scale down to 0.98 on tap) without any
 * additional CSS.
 */

import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * ButtonProps — The component's public API (all the props it accepts).
 *
 * `extends HTMLMotionProps<'button'>` means ButtonProps includes every standard
 * HTML button attribute (onClick, disabled, type, aria-label, etc.) PLUS all
 * framer-motion animation props (whileHover, whileTap, animate, etc.).
 * Callers can use all of those without Button needing to explicitly list them.
 *
 * Our custom additions:
 *   - `variant`: controls the visual style (colour scheme).
 *   - `size`: controls padding and font size.
 *   - `isLoading`: when true, replaces children with a spinner and disables the button.
 *   - `children`: the content rendered inside the button (text, icons, etc.).
 */
interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children?: React.ReactNode;
}

/**
 * Button — The component itself.
 *
 * `React.forwardRef` allows parent components to pass a `ref` prop to Button,
 * which Button then forwards down to the underlying `<motion.button>` DOM node.
 * This is necessary when a parent needs to imperatively interact with the DOM
 * element (e.g. call `.focus()` on it). Without `forwardRef`, a `ref` passed
 * to `<Button ref={myRef}>` would be attached to the Button function itself —
 * which is useless — rather than the DOM button element.
 *
 * The generic `<HTMLButtonElement, ButtonProps>` tells TypeScript what type of
 * DOM element the ref will hold (HTMLButtonElement) and what props the
 * component accepts (ButtonProps).
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
    /**
     * variants — Maps each variant name to the Tailwind classes that implement it.
     *
     * 'primary' uses the custom `neon-btn` class (defined in index.css) which
     * adds the signature neon glow effect. The others use standard Tailwind
     * utility classes for simpler styling.
     */
    const variants = {
      primary: 'neon-btn hover:-translate-y-0.5',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'bg-transparent border-2 border-border text-foreground hover:border-foreground/20',
      ghost: 'bg-transparent text-foreground hover:bg-secondary',
    };

    /**
     * sizes — Maps each size name to padding and font-size classes.
     *
     * These are kept separate from variants so you can combine any size with
     * any variant independently (e.g. a small primary button or a large ghost button).
     */
    const sizes = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    };

    return (
      <motion.button
        ref={ref}
        /**
         * `whileTap={{ scale: 0.98 }}` is a framer-motion directive:
         * while the button is being pressed/tapped, scale it to 98% of its
         * normal size. This gives tactile feedback without any CSS animation
         * keyframes. Framer handles the spring physics automatically.
         */
        whileTap={{ scale: 0.98 }}
        className={cn(
          // Base classes applied to every button regardless of variant or size.
          // `inline-flex items-center justify-center` aligns icon + text centrally.
          // `disabled:transform-none` prevents the hover lift animation from
          // appearing on a disabled button, since that would be misleading.
          'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
          variants[variant],
          sizes[size],
          // `className` from props is applied last so callers can override
          // specific styles without having to rewrite the base classes.
          className
        )}
        /**
         * Disable the button both when the caller passes `disabled` AND when
         * `isLoading` is true. This prevents double-submits — if the user clicks
         * while a mutation is in flight, the button is already disabled.
         */
        disabled={isLoading || props.disabled}
        /**
         * `...props` spreads all remaining props (onClick, type, data-testid, etc.)
         * onto the motion.button element. This is the standard React pattern for
         * "pass-through" — the Button component handles its own concerns (styling,
         * loading state) and forwards everything else transparently.
         */
        {...props}
      >
        {/**
         * When `isLoading` is true, render an animated SVG spinner instead of
         * the normal button content. The SVG draws a circle with a gap; the
         * `animate-spin` Tailwind class rotates it continuously.
         *
         * The spinner uses `text-current` so it inherits the button's text
         * colour automatically, staying legible against any variant.
         *
         * When not loading, render nothing here — `children` is rendered below.
         */}
        {isLoading ? (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        ) : null}
        {children}
      </motion.button>
    );
  }
);

/**
 * Button.displayName
 *
 * React DevTools displays component names in the component tree to aid
 * debugging. When a component is created with `forwardRef`, React can't
 * automatically infer its name from the variable, so we set it explicitly.
 * Without this, the component would appear as "ForwardRef" in DevTools.
 */
Button.displayName = 'Button';
