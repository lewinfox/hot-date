/**
 * components/ui/toaster.tsx — Toast Notification Renderer
 *
 * This is the component that actually renders toast notifications on screen.
 * It bridges the custom toast state management in `use-toast.ts` with the
 * Radix UI toast components defined in `toast.tsx`.
 *
 * It works like this:
 *   1. `useToast()` subscribes this component to the global toast queue.
 *      Any call to `toast(...)` anywhere in the app will cause a re-render here.
 *   2. We map over `toasts` and render a `<Toast>` for each one.
 *   3. `<ToastProvider>` and `<ToastViewport>` are the Radix containers needed
 *      to position and animate the toasts correctly.
 *
 * This component is rendered once in App.tsx so it's always present, regardless
 * of which page the user is on.
 */

import { useToast } from '@/hooks/use-toast';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';

export function Toaster() {
  /**
   * `toasts` is the array of currently queued toast notifications from
   * the module-level state in use-toast.ts. When a toast is added or removed,
   * the `useToast` hook triggers a re-render here via its listener mechanism,
   * causing the new list to be reflected on screen.
   */
  const { toasts } = useToast();

  return (
    /**
     * ToastProvider sets up the Radix context. ToastViewport defines the
     * fixed on-screen region where toasts appear. Both must be present for
     * Radix's internals to work correctly.
     *
     * Note: ToastViewport is rendered AFTER the mapped toasts. In Radix's
     * model, Toast elements are "portalled" into the Viewport, so their order
     * in the JSX doesn't correspond to their visual position.
     */
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        /**
         * `key={id}` is required by React when rendering a list. It lets React
         * track which toast is which across re-renders so it can animate the
         * right one out when it's dismissed, rather than re-mounting all of them.
         *
         * `...props` forwards the remaining toast state (variant, open,
         * onOpenChange, etc.) to the Toast component. The Radix `onOpenChange`
         * callback is how the library notifies us when the user dismisses a
         * toast, and we set it up in `use-toast.ts`'s `toast()` function.
         */
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {/* Conditionally render title/description — both are optional. */}
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {/* `action` is an optional React element (e.g. an "Undo" button). */}
            {action}
            {/* The × close button — always rendered, visible on hover. */}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
