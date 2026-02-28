/**
 * hooks/use-toast.ts — Global Toast Notification System
 *
 * This file implements a custom toast notification system. A "toast" is a
 * brief pop-up message (like "Link copied!" or "Error saving availability")
 * that appears at the edge of the screen and disappears automatically.
 *
 * Architecture overview:
 * ─────────────────────
 * Most state in a React app lives inside components and is managed with
 * React's built-in `useState`. This toast system is different: its state
 * lives at *module scope* — outside any component, in plain JavaScript
 * variables (`memoryState` and `listeners`). This means the state persists
 * as long as the page is loaded, not just as long as a particular component
 * is mounted.
 *
 * Why? Because toasts can be triggered from anywhere — from a mutation hook,
 * a click handler, a form submission — and they all need to feed into the
 * same queue displayed by the single `<Toaster>` component. A module-level
 * store is simpler than setting up a React Context for this use case.
 *
 * The `useToast` hook bridges the gap: when a component mounts it registers
 * a listener so that module-level dispatch calls cause a local `setState`,
 * which triggers a re-render and makes the new toasts visible.
 *
 * Data flow:
 *   toast("...") → dispatch(ADD_TOAST) → reducer → memoryState updated
 *     → each listener (each mounted useToast caller) called
 *       → setState in component → component re-renders → <Toaster> shows toast
 */

import * as React from 'react';

import type { ToastActionElement, ToastProps } from '@/components/ui/toast';

/**
 * TOAST_LIMIT — Maximum number of toasts visible at once.
 *
 * The `slice(0, TOAST_LIMIT)` in the ADD_TOAST reducer enforces this cap.
 * A limit of 1 keeps the UI clean — only the most recent notification is
 * shown, which avoids an awkward stack of notifications if the user triggers
 * multiple actions quickly.
 */
const TOAST_LIMIT = 1;

/**
 * TOAST_REMOVE_DELAY — Milliseconds after dismissal before a toast is purged
 * from state.
 *
 * Dismissing a toast sets `open: false`, which starts the CSS exit animation.
 * We don't remove the toast from state immediately because the animation needs
 * time to play. Only once this delay has elapsed do we dispatch REMOVE_TOAST
 * and actually delete the toast from the array.
 *
 * The value here (1,000,000 ms ≈ 16 minutes) is intentionally very large — it
 * means toasts effectively stay in memory until they're garbage-collected,
 * which is fine since the limit ensures there's rarely more than one.
 */
const TOAST_REMOVE_DELAY = 1000000;

/**
 * ToasterToast — The complete internal representation of a toast notification.
 *
 * Extends the public `ToastProps` (from Radix UI) with additional fields
 * managed by this module:
 *   - `id`: unique identifier used to target specific toasts for updates/dismissal.
 *   - `title` / `description`: the visible text content.
 *   - `action`: an optional interactive element (e.g. an "Undo" button).
 */
type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

/**
 * actionTypes — A map of all possible state transitions.
 *
 * Defining these as a const object (rather than plain strings) gives TypeScript
 * exact literal types. `as const` freezes the object so its values are typed as
 * e.g. `'ADD_TOAST'` (a literal) rather than `string` (too broad). This means
 * TypeScript can verify that we only dispatch known action types.
 */
const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const;

/**
 * genId — Generates a unique identifier for each toast.
 *
 * Uses a simple incrementing counter wrapped with modulo so it never exceeds
 * JavaScript's safe integer range. The modulo wraps the counter back to 0 after
 * ~9 quadrillion toasts, which is well beyond any practical concern.
 *
 * This is simpler than UUID generation for an ID that only needs to be unique
 * within a single page session.
 */
let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

/**
 * Action — A discriminated union of all possible dispatch payloads.
 *
 * A discriminated union is a TypeScript pattern where each variant has a `type`
 * field with a unique literal value. TypeScript can narrow the type of an action
 * inside a `switch (action.type)` statement, giving you type-safe access to that
 * variant's specific fields.
 *
 * For example, inside `case 'UPDATE_TOAST'`, TypeScript knows `action.toast` is
 * `Partial<ToasterToast>` (not `ToasterToast` as in ADD_TOAST).
 */
type Action =
  | {
      type: ActionType['ADD_TOAST'];
      toast: ToasterToast;
    }
  | {
      type: ActionType['UPDATE_TOAST'];
      toast: Partial<ToasterToast>; // Partial = all fields optional (for partial updates)
    }
  | {
      type: ActionType['DISMISS_TOAST'];
      toastId?: ToasterToast['id']; // Omitting toastId dismisses ALL toasts
    }
  | {
      type: ActionType['REMOVE_TOAST'];
      toastId?: ToasterToast['id']; // Omitting toastId removes ALL toasts from state
    };

interface State {
  toasts: ToasterToast[];
}

/**
 * toastTimeouts — Tracks the setTimeout handle for each pending removal.
 *
 * When a toast is dismissed, we schedule its actual removal from state after
 * TOAST_REMOVE_DELAY ms. The Map lets us look up whether a removal is already
 * scheduled for a given toast ID, preventing duplicate timers if `DISMISS_TOAST`
 * is dispatched multiple times for the same toast.
 */
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * addToRemoveQueue — Schedules a toast for removal from state.
 *
 * Called as a side effect of the DISMISS_TOAST action. The separation of
 * "dismiss" (mark as closed, start animation) and "remove" (delete from state)
 * is intentional: the exit animation plays during the delay window, so by
 * the time the state is cleaned up, the animation has finished and the user
 * never sees a jarring visual jump.
 *
 * The early-return guard (`toastTimeouts.has(toastId)`) ensures we don't
 * accumulate multiple timers for the same toast.
 */
const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: 'REMOVE_TOAST',
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

/**
 * reducer — Pure function that computes the next state from the current state
 * and a dispatched action.
 *
 * This follows the "reducer" pattern (also used by Redux and React's own
 * `useReducer`). The rules:
 *   1. Never mutate `state` — always return a *new* object.
 *   2. Given the same inputs, always return the same output (no side effects).
 *
 * Spreading `...state` at the start of each case copies all existing state
 * fields and then overrides just the ones that change. This preserves any
 * fields we're not explicitly touching.
 *
 * Note: the DISMISS_TOAST case does have a side effect (calling
 * `addToRemoveQueue`), which technically violates the purity rule. The original
 * comment in the code acknowledges this and notes it's kept here for simplicity.
 */
export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD_TOAST':
      // Prepend the new toast and slice to the limit. Prepending (not appending)
      // means the newest toast is always at index 0, which is what we want to
      // keep when enforcing the TOAST_LIMIT cap.
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case 'UPDATE_TOAST':
      // Replace the matching toast's fields with the provided partial update.
      // Spreading `...t, ...action.toast` merges the old and new fields.
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      };

    case 'DISMISS_TOAST': {
      const { toastId } = action;

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        // Schedule removal of the specific toast.
        addToRemoveQueue(toastId);
      } else {
        // No toastId = dismiss everything currently visible.
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      // Set `open: false` to trigger the exit animation via Radix UI's
      // `data-[state=closed]` CSS selectors. The toast remains in state until
      // REMOVE_TOAST fires after TOAST_REMOVE_DELAY.
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }

    case 'REMOVE_TOAST':
      if (action.toastId === undefined) {
        // Clear everything.
        return {
          ...state,
          toasts: [],
        };
      }
      // Filter out just the one toast.
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

/**
 * listeners — Registered setState callbacks from all mounted `useToast` hooks.
 *
 * Each component that calls `useToast()` adds its local `setState` function to
 * this array on mount and removes it on unmount. When `dispatch` is called, it
 * pushes the new state to every listener, causing each subscribed component to
 * re-render with the latest toast list.
 *
 * In practice, only the `<Toaster>` component in App.tsx calls `useToast`, so
 * there's normally just one listener. But the design supports multiple if needed.
 */
const listeners: Array<(state: State) => void> = [];

/**
 * memoryState — The canonical toast state, held at module scope.
 *
 * This is the "single source of truth" for all toast notifications. It lives
 * outside React so it persists regardless of which components are mounted.
 * Any component can read from it (via `useToast`) or write to it (via `toast()`
 * or `dispatch()`).
 */
let memoryState: State = { toasts: [] };

/**
 * dispatch — Applies an action to the module-level state and notifies all
 * subscribed components.
 *
 * This is the only way state should be mutated. It:
 *   1. Runs the reducer to compute the new state.
 *   2. Replaces `memoryState` with the result.
 *   3. Calls every registered listener with the new state, which triggers
 *      re-renders in all subscribed components.
 */
function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

/**
 * Toast — The public type for creating a new toast (without the auto-generated `id`).
 *
 * `Omit<ToasterToast, 'id'>` produces a type identical to ToasterToast but with
 * the `id` field removed. Callers never supply their own ID — `toast()` generates
 * one internally.
 */
type Toast = Omit<ToasterToast, 'id'>;

/**
 * toast — The main public API for showing a notification.
 *
 * Call this from anywhere in the app (hooks, event handlers, etc.):
 *   toast({ title: 'Link copied!', description: 'Share this with your group.' })
 *   toast({ title: 'Error', description: err.message, variant: 'destructive' })
 *
 * Returns an object with `id`, `dismiss`, and `update` so the caller can
 * imperatively control the toast after creating it (e.g. update text while
 * an async operation is in progress, or dismiss it early).
 *
 * The `onOpenChange` callback wires into Radix UI's toast lifecycle — when the
 * user closes the toast (by clicking ×, swiping it away, or after a timeout),
 * Radix sets `open = false` and we dispatch DISMISS_TOAST to keep our state in sync.
 */
function toast({ ...props }: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

/**
 * useToast — React hook that subscribes a component to the toast state.
 *
 * A "hook" is a special React function (starting with "use") that can tap into
 * React's internal systems (state, effects, refs, etc.). Hooks can only be
 * called inside function components or other hooks.
 *
 * What this hook does:
 *   1. Initialises local React state with the current `memoryState` snapshot.
 *      This means the component has the correct data immediately on first render,
 *      even if toasts were shown before this component mounted.
 *   2. In a `useEffect`, registers `setState` as a listener so future dispatches
 *      cause this component to re-render.
 *   3. Returns the current toast list plus the `toast` and `dismiss` functions
 *      so the consumer can both read state and trigger actions.
 *
 * useEffect cleanup:
 *   The function returned from `useEffect` is called when the component unmounts
 *   (or before the effect re-runs). Here it removes `setState` from the listeners
 *   array to prevent memory leaks and calls to setState on an unmounted component.
 *
 * Dependency array `[state]`:
 *   This effect re-runs whenever `state` changes, which ensures that if the
 *   component's state is replaced (e.g. after a dispatch), the listener array
 *   always holds the current `setState` reference.
 */
function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state, // Spreads `toasts: ToasterToast[]` into the return value
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  };
}

export { useToast, toast };
