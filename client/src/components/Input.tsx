/**
 * components/Input.tsx — Reusable Text Input Component
 *
 * A thin wrapper around a native HTML `<input>` that adds optional label and
 * error message rendering, consistent styling, and `ref` forwarding so parent
 * components can imperatively focus or scroll to the input.
 *
 * This is the same compositional pattern as Button.tsx: all styling lives here
 * so call sites stay clean. The neon-input CSS class (from index.css) adds the
 * themed focus glow.
 */

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * InputProps — The component's public API.
 *
 * `extends React.InputHTMLAttributes<HTMLInputElement>` gives us every native
 * input attribute for free: type, placeholder, value, onChange, onBlur,
 * required, disabled, autoFocus, etc. We don't have to list them all explicitly.
 *
 * Our additions:
 *   - `label`: if provided, renders a styled `<label>` above the input.
 *   - `error`: if provided, renders red helper text below the input AND adds a
 *              red border to the input itself (via the `border-destructive` class).
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/**
 * Input — The component.
 *
 * Wrapped in `React.forwardRef` for the same reason as Button: so a parent
 * component can hold a ref to the underlying `<input>` DOM element and call
 * imperative methods on it (e.g. `.focus()`, `.scrollIntoView()`).
 *
 * In Event.tsx, `nameInputRef` is passed to this component so that clicking a
 * participant's name in the list can programmatically focus and scroll to the
 * name input, improving the UX without the user having to manually click it.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      /**
       * The wrapping <div> groups the label, input, and error text as a single
       * vertical unit. `w-full` ensures it stretches to fill its container
       * regardless of the input's content width.
       */
      <div className="flex flex-col gap-2 w-full">
        {/**
         * Conditionally render the label. In JSX, `{condition && <element>}`
         * renders the element only when the condition is truthy. If `label` is
         * undefined (not passed), nothing is rendered here.
         */}
        {label && <label className="text-sm font-medium neon-label">{label}</label>}
        <input
          ref={ref}
          className={cn(
            'w-full min-w-0 px-4 py-3 rounded-xl bg-secondary/50 border',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none transition-all duration-200',
            'neon-input',
            // Apply a destructive (red) border when there's a validation error,
            // giving an immediate visual cue that something needs correcting.
            error && 'border-destructive',
            // Caller-supplied className goes last so it can override any of the
            // defaults above (e.g. to change font size on the Home page form).
            className
          )}
          /**
           * `...props` forwards all native input attributes — value, onChange,
           * placeholder, type, required, disabled, autoFocus, data-testid, etc.
           * The Input component handles only what it explicitly cares about
           * (label, error, className, ref) and lets everything else pass through.
           */
          {...props}
        />
        {/* Error message — only rendered when an `error` string is provided. */}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }
);

/**
 * Setting displayName so the component appears correctly in React DevTools
 * (see Button.tsx for a full explanation of why this is needed with forwardRef).
 */
Input.displayName = 'Input';
