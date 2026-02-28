/**
 * components/ui/tooltip.tsx — Styled Tooltip Primitives
 *
 * Styled wrappers around Radix UI's `@radix-ui/react-tooltip` primitives.
 * Like the toast components, this follows the headless UI pattern: Radix
 * handles all behaviour (positioning, delay, keyboard accessibility, focus
 * management) and we provide the visual styling.
 *
 * Note: The `'use client'` directive at the top is a Next.js convention marking
 * this as a client-side component. This project uses Vite (not Next.js), so
 * the directive has no effect here — it's harmless boilerplate from the shadcn
 * component generator that was not removed.
 *
 * Components:
 *   TooltipProvider — Context wrapper (required by Radix). Mounted once in
 *                     App.tsx. Sets the delay before tooltips appear globally.
 *   Tooltip         — The root of each tooltip; wraps the trigger + content.
 *   TooltipTrigger  — The element that the user hovers to reveal the tooltip.
 *   TooltipContent  — The styled floating panel that appears near the trigger.
 *
 * Usage example:
 *   <Tooltip>
 *     <TooltipTrigger asChild>
 *       <button>Hover me</button>
 *     </TooltipTrigger>
 *     <ToastContent>This is a tooltip</ToastContent>
 *   </Tooltip>
 *
 * In this app, TooltipProvider is mounted in App.tsx but individual Tooltip
 * components are not currently used in the custom UI — the Calendar heatmap
 * implements its own tooltip via fixed positioning (see Calendar.tsx).
 */

'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

/** Pass-throughs — no modification needed for these primitives. */
const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * TooltipContent — The styled floating panel.
 *
 * `sideOffset = 4` adds 4px of gap between the trigger and the tooltip bubble,
 * so the tooltip doesn't sit flush against the element it's describing.
 *
 * The long class string handles:
 *   - Base layout and styling (z-50, rounded, border, shadow, text size).
 *   - Entry animation (`animate-in fade-in-0 zoom-in-95`): fades and scales in.
 *   - Exit animation (`data-[state=closed]:animate-out ...`): fades and scales out.
 *   - Directional slide (`data-[side=bottom]:slide-in-from-top-2` etc.): the
 *     tooltip slides in from the direction it appears relative to the trigger.
 *   - `origin-[--radix-tooltip-content-transform-origin]`: uses a CSS custom
 *     property set by Radix to ensure the scale animation originates from the
 *     correct point (the anchor edge nearest the trigger).
 */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin]',
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
