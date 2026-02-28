/**
 * components/ui/toast.tsx — Styled Toast Notification Primitives
 *
 * This file is a styled wrapper around Radix UI's `@radix-ui/react-toast`
 * primitives. It follows the "headless UI" pattern:
 *
 *   - Radix UI handles all behaviour and accessibility (ARIA roles, keyboard
 *     navigation, swipe-to-dismiss, focus management, animation timing).
 *   - We supply all the visual styling via Tailwind CSS class names.
 *
 * The components here are low-level building blocks. They're assembled into the
 * `<Toaster>` component in toaster.tsx, which is what App.tsx actually renders.
 *
 * Components exported:
 *   ToastProvider   — Context wrapper required by Radix. Must surround all toasts.
 *   ToastViewport   — The fixed-position container where toasts appear on screen.
 *   Toast           — The individual toast card (supports variant styling).
 *   ToastTitle      — Bold heading text inside a toast.
 *   ToastDescription — Secondary body text inside a toast.
 *   ToastAction     — An optional interactive button inside a toast (e.g. "Undo").
 *   ToastClose      — The × dismiss button, always present in the top-right corner.
 */

import * as React from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * ToastProvider — Radix's context provider, passed through unchanged.
 *
 * This doesn't render any visible UI; it sets up shared state for all toasts
 * in the subtree (e.g. the swipe direction and duration).
 */
const ToastProvider = ToastPrimitives.Provider;

/**
 * ToastViewport — The fixed container where toast notifications appear.
 *
 * Positioned at the top of the screen on mobile (where it doesn't overlap the
 * keyboard) and at the bottom-right on desktop (the conventional toast corner).
 * `z-[100]` ensures toasts appear above modals and other overlays.
 * `max-w-[420px]` on desktop prevents very wide toasts on large monitors.
 *
 * The `flex-col-reverse` on mobile reverses the stacking order: newer toasts
 * appear at the top (closest to the user's view) when stacking upward.
 */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]',
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

/**
 * toastVariants — Class generation for the two visual variants.
 *
 * `cva` (class-variance-authority) is a utility for defining component variants
 * as a typed lookup. It takes a base class string and a variants config, then
 * produces a function `toastVariants({ variant })` that returns the combined
 * class string for the requested variant.
 *
 * The base classes include Radix's swipe/state data attributes. Radix sets
 * these attributes on the DOM element as the toast moves between states:
 *   data-[state=open]   — toast is entering or visible
 *   data-[state=closed] — toast is exiting
 *   data-[swipe=*]      — user is swiping the toast
 * Tailwind's `data-*` variant selectors translate these into CSS transitions.
 *
 * Variants:
 *   default     — neutral (dark background, light text) for informational toasts.
 *   destructive — red background for error toasts.
 */
const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
  {
    variants: {
      variant: {
        default: 'border bg-background text-foreground',
        destructive:
          'destructive group border-destructive bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/**
 * Toast — The styled toast card component.
 *
 * Extends Radix's Root primitive with our `toastVariants` class system.
 * `VariantProps<typeof toastVariants>` adds the `variant` prop to the type
 * automatically, so callers get type-checked variant names.
 */
const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

/**
 * ToastAction — An optional action button rendered inside the toast.
 *
 * Example usage: a toast saying "Item deleted" with an "Undo" action button.
 * The `group-[.destructive]:*` classes handle visual adjustments when this
 * action appears inside a destructive (red) toast — making the button border
 * and hover colours appropriate for the red background.
 */
const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive',
      className
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

/**
 * ToastClose — The × dismiss button in the top-right of the toast.
 *
 * `opacity-0` hides the button by default. It becomes visible (`opacity-100`)
 * on hover (`group-hover:opacity-100`) or on keyboard focus (`focus:opacity-100`).
 * This avoids visual clutter while still being accessible via keyboard.
 *
 * `toast-close=""` is a data attribute used by Radix internally to identify
 * which element should trigger the dismiss behaviour.
 */
const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      'absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600',
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

/** ToastTitle — Bold heading text for the toast. */
const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

/** ToastDescription — Secondary body text for the toast. */
const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('text-sm opacity-90', className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

/**
 * Type exports used by use-toast.ts to type the toast state.
 *
 * `React.ComponentPropsWithoutRef<typeof Toast>` extracts the prop types of the
 * Toast component, including Radix's props and our added `variant`. This is
 * used in use-toast.ts's `ToasterToast` type to ensure toast state objects
 * have the right shape.
 *
 * `React.ReactElement<typeof ToastAction>` types the optional `action` slot
 * as an element of ToastAction specifically (not any React element).
 */
type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
