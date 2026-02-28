/**
 * components/ui/card.tsx — Card Layout Components
 *
 * A family of components for displaying content in a visually distinct "card"
 * container. Cards use a white/dark background, a border, and a shadow to
 * create visual elevation — the appearance of sitting above the page background.
 *
 * This is pure layout/styling — no behaviour or interactivity. All components
 * are simple `<div>` wrappers that apply consistent Tailwind classes. They use
 * `forwardRef` so parent components can attach refs to the underlying DOM nodes
 * if needed (e.g. for scroll management).
 *
 * Component hierarchy:
 *   <Card>                    — outer container with border and shadow
 *     <CardHeader>            — top section, typically contains title + description
 *       <CardTitle>           — large heading text
 *       <CardDescription>    — secondary grey subheading
 *     <CardContent>          — main body area (less top padding to flow from header)
 *     <CardFooter>           — bottom area, flex row (useful for action buttons)
 *
 * Usage (only Card and CardContent are used in this app, in not-found.tsx):
 *   <Card>
 *     <CardHeader>
 *       <CardTitle>Hello</CardTitle>
 *     </CardHeader>
 *     <CardContent>Body text</CardContent>
 *   </Card>
 *
 * The `shadcn-card` class on Card is a custom class from index.css — shadcn/ui
 * is the design system this file is part of.
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'shadcn-card rounded-xl border bg-card border-card-border text-card-foreground shadow-sm',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-2xl font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    // `pt-0` removes the top padding so content flows directly from the header
    // without a double gap between CardHeader's padding and CardContent's padding.
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
