/**
 * App.tsx — Root Component and Application Shell
 *
 * In React, every piece of UI is a "component" — a function that returns JSX
 * (HTML-like syntax). Components are nested inside each other like Russian dolls.
 * The component at the very top of this tree is called the root component, and
 * that's what this file defines.
 *
 * This file is responsible for three things:
 *   1. Wrapping the whole app in "Providers" that supply shared functionality
 *      (data fetching, tooltips) to every component below.
 *   2. Rendering the persistent decorative background that appears on all pages.
 *   3. Delegating page-level rendering to the Router.
 */

import { Switch, Route } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

// Import pages
import Home from '@/pages/Home';
import EventPage from '@/pages/Event';

/**
 * Router — Decides which page component to render based on the current URL.
 *
 * Wouter is a lightweight client-side router. "Client-side" means the browser
 * never actually requests a new page from the server when the URL changes —
 * wouter intercepts the navigation and swaps out the component that's rendered.
 *
 * How route matching works:
 *   - "/" matches only the exact home URL.
 *   - "/event/:slug" matches any URL like "/event/my-summer-trip". The `:slug`
 *     part is a dynamic segment; its value is made available to the page via
 *     `useRoute()`.
 *   - The final `<Route component={NotFound} />` has no `path`, so it acts as a
 *     catch-all — it renders whenever none of the routes above matched.
 *
 * `<Switch>` ensures only the FIRST matching route renders. Without it, multiple
 * routes could match simultaneously (e.g. "/" would also match "/event/foo"
 * because "foo" starts with "/").
 */
function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/event/:slug" component={EventPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * App — The outermost component of the entire application.
 *
 * "Provider" components use React's Context API to make values available to any
 * descendant component, no matter how deeply nested, without manually passing
 * props through every level. Think of them as global configuration that's
 * silently available to everything inside them.
 *
 * Provider nesting order matters: outer providers are available to inner ones,
 * so if a provider needs another provider's context, it must be nested inside it.
 */
function App() {
  return (
    /**
     * QueryClientProvider makes the React Query cache (`queryClient`) available
     * throughout the app. Any component that calls `useQuery` or `useMutation`
     * (e.g. to fetch event data) relies on this provider being present. Without
     * it, those hooks would throw an error.
     */
    <QueryClientProvider client={queryClient}>
      {/**
       * TooltipProvider is required by Radix UI's tooltip library. It sets up
       * shared state (e.g. delay timing) for all tooltips in the tree. This is
       * a good example of a "headless" UI library pattern: the library handles
       * behaviour and accessibility, while we control all styling ourselves.
       */}
      <TooltipProvider>
        {/**
         * Decorative background layer — the neon glow blobs visible behind the
         * page content.
         *
         * `fixed inset-0` pins the div to the viewport (it doesn't scroll).
         * `pointer-events-none` makes it completely click-through so it doesn't
         * interfere with any interactive elements above it.
         * `-z-10` pushes it behind all other content.
         *
         * The coloured blobs are simple <div>s with large `blur-[...px]` and
         * semi-transparent background colours. At very high blur radii, a sharp
         * blob becomes a soft, ambient glow — no image assets required.
         *
         * They live here in App (rather than in each page) so the glow persists
         * across page transitions and doesn't flash on navigation.
         */}
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
          <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[90vw] h-[55vh] bg-orange-500/25 blur-[140px] rounded-full" />
          <div className="absolute top-[20%] left-[-15%] w-[55vw] h-[55vh] bg-pink-600/20 blur-[120px] rounded-full" />
          <div className="absolute top-[15%] right-[-15%] w-[55vw] h-[55vh] bg-purple-700/22 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] left-[15%] w-[70vw] h-[45vh] bg-blue-700/15 blur-[110px] rounded-full" />
        </div>

        {/**
         * Toaster renders the toast notification pop-ups (e.g. "Link copied!",
         * "Error saving availability"). It reads from the global toast state
         * managed by `use-toast.ts` and renders each queued notification.
         * It lives here so notifications can appear on every page.
         */}
        <Toaster />

        {/* The actual page content, determined by the current URL. */}
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
