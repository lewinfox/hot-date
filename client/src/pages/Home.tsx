/**
 * pages/Home.tsx — Landing Page and Event Creation Form
 *
 * This is the first page users see. Its responsibilities are:
 *   1. Show a brief animated splash screen (logo zooms in, then fades away).
 *   2. Reveal the event creation form once the splash is done.
 *   3. On form submission, POST to the server to create the event and then
 *      navigate the user directly to their new event's page.
 *
 * State management:
 *   All form state (title, description, dates) is managed with React's `useState`
 *   hook. This is "controlled component" pattern: each input's `value` is bound to
 *   a state variable, and `onChange` updates that variable on every keystroke.
 *   React re-renders the component whenever state changes, keeping the UI in sync.
 *
 * Animation:
 *   framer-motion powers both the splash screen and the form entrance. The
 *   `splashDone` boolean is the bridge between the two: after 1.8 seconds the
 *   timer fires, `splashDone` becomes true, framer-motion exits the splash and
 *   fades in the form.
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, CalendarPlus, Share2, CalendarCheck } from 'lucide-react';
import hotDateLogo from '@assets/logo.png';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { useCreateEvent } from '@/hooks/use-events';
import { format, addMonths } from 'date-fns';

export default function Home() {
  /**
   * useLocation — client-side navigation hook from wouter.
   *
   * Returns `[currentPath, setLocation]`. We discard the current path (we don't
   * need it here) and keep only `setLocation`, which lets us navigate to a new
   * URL programmatically — equivalent to clicking a link, but triggered by code.
   * We call it after a successful event creation to redirect to the new event page.
   */
  const [, setLocation] = useLocation();

  /**
   * createEvent — the mutation hook for creating events.
   *
   * Calling `createEvent.mutate(data)` fires the POST request. The `isPending`
   * property is true while the request is in-flight, which we use to show a
   * spinner on the submit button.
   */
  const createEvent = useCreateEvent();

  /**
   * splashDone — controls the splash → form transition.
   *
   * Starts as `false`, becomes `true` after 1800ms. The splash screen renders
   * while this is false; the form fades in when it becomes true.
   */
  const [splashDone, setSplashDone] = useState(false);

  /**
   * Splash timer effect.
   *
   * `useEffect` runs after the first render (and after any render if its
   * dependencies change — here the empty array `[]` means "run once on mount").
   * We set a 1.8-second timer to transition from splash to main content.
   *
   * The cleanup function (`return () => clearTimeout(t)`) cancels the timer
   * if the component unmounts before it fires. Without this, the timer would
   * still fire after unmount and try to call `setSplashDone` on an unmounted
   * component, which can cause memory leaks or React warnings.
   */
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1800);
    return () => clearTimeout(t);
  }, []);

  /**
   * Form field state — all controlled inputs.
   *
   * `title` and `description` start empty. `startDate` defaults to today and
   * `endDate` to 3 months from now using date-fns utilities:
   *   - `format(date, 'yyyy-MM-dd')` converts a Date object to the string format
   *     that native `<input type="date">` elements expect (ISO 8601).
   *   - `addMonths(new Date(), 3)` returns a Date object 3 months in the future.
   */
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addMonths(new Date(), 3), 'yyyy-MM-dd'));

  /**
   * handleSubmit — Form submission handler.
   *
   * `e.preventDefault()` is essential: without it, the browser's default form
   * behaviour would trigger a full page reload (submitting to the current URL),
   * which would wipe out all React state and lose the user's work.
   *
   * We fire the mutation and pass an `onSuccess` callback at the call site rather
   * than in the hook definition because the navigation (`setLocation`) is a page-
   * level concern — the hook doesn't know or care where to redirect.
   *
   * `data.slug` is the URL-safe identifier the server generates for the new event
   * (e.g. "summer-cabin-trip-abc123"). We navigate to `/event/{slug}` immediately
   * after creation so the user can share the link without waiting.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createEvent.mutate(
      {
        title,
        description,
        startDate,
        endDate,
      },
      {
        onSuccess: (data) => {
          setLocation(`/event/${data.slug}`);
        },
      }
    );
  };

  return (
    <>
      {/**
       * AnimatePresence — enables exit animations for components that are
       * removed from the React tree.
       *
       * Normally, when a condition like `{!splashDone && <div>...}` becomes
       * false, React immediately removes the element with no animation.
       * `AnimatePresence` detects when children are about to be removed and
       * gives them a chance to animate out first (the `exit` prop on
       * `motion.div`).
       *
       * Without AnimatePresence, the splash would just disappear instantly
       * instead of fading and scaling out.
       */}
      <AnimatePresence>
        {!splashDone && (
          <motion.div
            key="splash"
            /**
             * `initial` — the starting state when the element first mounts.
             *   opacity: 1 means it starts fully visible (no fade-in needed for the splash).
             *
             * `exit` — the ending state when the element is about to unmount.
             *   opacity: 0 fades it out; scale: 1.04 gives a subtle "zoom out" feeling.
             *
             * `transition` — controls the animation curve and duration.
             *   The `ease` array is a cubic-bezier curve that starts fast and
             *   decelerates smoothly (an "expo-out" easing).
             */
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background overflow-hidden"
          >
            {/* Retro glow blobs matching the logo palette */}
            <div className="absolute w-[60vw] h-[60vw] rounded-full bg-orange-400/20 blur-[120px] top-[-10%] left-1/2 -translate-x-1/2 pointer-events-none" />
            <div className="absolute w-[40vw] h-[40vw] rounded-full bg-pink-500/20 blur-[100px] bottom-0 left-0 pointer-events-none" />
            <div className="absolute w-[40vw] h-[40vw] rounded-full bg-purple-600/20 blur-[100px] bottom-0 right-0 pointer-events-none" />
            {/**
             * The logo animates in during the splash: scales from 75% to 100%
             * and fades from invisible to fully visible. This is the entrance
             * animation (controlled by `initial` and `animate`).
             */}
            <motion.img
              src={hotDateLogo}
              alt="Hot Date"
              initial={{ scale: 0.75, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="w-72 sm:w-96 h-auto relative z-10 drop-shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen flex flex-col items-center overflow-x-hidden relative">
        {/* Logo: absolutely positioned — acts as a decorative background header */}
        <motion.div
          initial={{ opacity: 0 }}
          /**
           * `animate` with a ternary: when `splashDone` becomes true, this
           * element animates to `opacity: 1`. When it's still false, it stays
           * at opacity 0. Framer-motion watches the `animate` prop and smoothly
           * transitions to whatever value it changes to.
           */
          animate={{ opacity: splashDone ? 1 : 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="absolute top-0 left-0 right-0 px-4 pt-8 sm:pt-12"
        >
          <img
            src={hotDateLogo}
            alt="Hot Date"
            className="w-full h-auto"
            style={{
              /**
               * maskImage / WebkitMaskImage — applies a transparency gradient to
               * the logo image so its edges fade to transparent. This creates the
               * effect of the logo bleeding into the background on the sides.
               *
               * The gradient goes: transparent → black (10%) → black (90%) →
               * transparent. Black = fully visible, transparent = invisible.
               *
               * WebkitMaskImage is the vendor-prefixed version required by Safari
               * and older Chrome. We supply both so it works cross-browser.
               */
              maskImage:
                'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
            }}
          />
        </motion.div>

        {/* Spacer — controls how much of the logo peeks above the form */}
        <div className="h-16 sm:h-24 w-full shrink-0" />

        {/* Form: normal flow + z-10, reliably above the absolute logo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          /**
           * Two properties animate simultaneously when `splashDone` becomes true:
           *   - opacity: 0 → 1 (fades in)
           *   - y: 20px → 0 (slides up from slightly below)
           * The combination gives a polished "emerge from below" entrance effect.
           */
          animate={{ opacity: splashDone ? 1 : 0, y: splashDone ? 0 : 20 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-2xl mx-auto flex flex-col gap-12 px-4 sm:px-8 pb-12"
        >
          {/* ── Event creation card ── */}
          <div className="bg-card/90 backdrop-blur-sm p-6 sm:p-10 rounded-[2rem] border neon-card">
            <div className="flex items-center gap-3 mb-8">
              {/**
               * drop-shadow-[0_0_8px_rgba(...)] is a Tailwind arbitrary value.
               * The filter: drop-shadow() CSS property creates a glow by adding
               * a coloured shadow in all directions — different from box-shadow,
               * which only works with rectangular elements.
               */}
              <Sparkles
                className="text-pink-400 drop-shadow-[0_0_8px_rgba(255,0,144,0.8)]"
                size={24}
              />
              {/**
               * bg-gradient-to-r from-cyan-300 via-white to-pink-300 — a
               * left-to-right gradient.
               * bg-clip-text — clips the background to just the text shape.
               * text-transparent — makes the text colour transparent so the
               * gradient background shows through. This is the CSS technique
               * for gradient-coloured text.
               */}
              <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-300 via-white to-pink-300 bg-clip-text text-transparent">
                Create an event
              </h2>
            </div>

            {/**
             * `onSubmit={handleSubmit}` is how React connects an event handler to
             * the native form submit event. It fires when the user clicks the submit
             * button or presses Enter in a text field. The `e` argument is a
             * SyntheticEvent (React's cross-browser wrapper around the native Event).
             */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <Input
                label="Event Name"
                placeholder="e.g. Summer Cabin Trip"
                value={title}
                /**
                 * `onChange` fires on every keystroke. `e.target.value` is the
                 * new value of the input after the keystroke. We update `title`
                 * state with it, which causes a re-render, which updates the
                 * `value` prop — this is the "controlled input" loop.
                 */
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
                className="text-lg py-4"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-hidden">
                <Input
                  type="date"
                  label="Earliest Date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
                <Input
                  type="date"
                  label="Latest Date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>

              {/**
               * Description uses a raw <textarea> rather than the Input component
               * because <textarea> is a different HTML element with different
               * attributes (rows, resize, etc.) and doesn't fit the single-line
               * Input abstraction cleanly.
               */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium neon-label">
                  Description <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <textarea
                  placeholder="What's this about?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl bg-secondary/50 border text-foreground placeholder:text-muted-foreground focus:outline-none transition-all duration-200 resize-none neon-input"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="mt-2 group"
                /**
                 * `isPending` comes from the React Query mutation — it's true from
                 * the moment `.mutate()` is called until the server responds. The
                 * Button renders a spinner and disables itself during this window.
                 */
                isLoading={createEvent.isPending}
                /**
                 * Also disable if the title is empty (or just whitespace). The `!!`
                 * in the Button component converts disabled to boolean, but here we
                 * pass `!title.trim()` directly. `trim()` removes leading/trailing
                 * whitespace so " " (just a space) doesn't pass validation.
                 */
                disabled={!title.trim()}
              >
                Get Started
                {/**
                 * `group-hover:translate-x-1` — when the parent element (the Button,
                 * which has `group` in its className) is hovered, this arrow icon
                 * slides 4px to the right. The `group` + `group-hover:` pattern is
                 * how Tailwind applies styles to children based on parent hover state.
                 */}
                <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </form>

            {/* Trust signal below the form */}
            <div className="mt-8 pt-8 border-t border-border/50">
              <div className="flex items-start gap-3 text-muted-foreground">
                <div className="p-2 bg-secondary/50 rounded-lg shrink-0">
                  {/* Inline SVG lock icon (not from lucide-react, inlined manually). */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-lock"
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div className="text-xs leading-relaxed">
                  <p className="font-semibold text-foreground mb-1">Secure & Simple</p>
                  <p>
                    No passwords required—access your events directly via your unique, secure URL.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── "How it works" explainer ── */}
          <div>
            <h3 className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-8">
              How it works
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/**
               * The steps are defined as an array of objects and rendered with
               * `.map()`. This is the React list-rendering pattern — instead of
               * duplicating JSX three times, we define the data once and let map()
               * generate the JSX dynamically.
               *
               * `key={item.step}` is required by React's reconciler. Each element
               * in a mapped list must have a unique key so React knows which element
               * changed when the list updates (performance and correctness).
               *
               * `item.icon` holds a component reference (e.g. `CalendarPlus`).
               * `<item.icon ...>` renders it like any other React component.
               * The variable name starts with uppercase `i` in `item.icon` — but
               * actually in JSX you can only use an expression like `<Component />`
               * if the expression is capitalised or accessed as a property. Since
               * `item.icon` is a property access, JSX treats it as a component.
               */}
              {[
                { icon: CalendarPlus, step: '1', text: 'Create an event' },
                {
                  icon: Share2,
                  step: '2',
                  text: 'Share the link with the people you want to invite',
                },
                {
                  icon: CalendarCheck,
                  step: '3',
                  text: "Compare the dates where everyone's available",
                },
              ].map((item) => (
                <div key={item.step} className="flex flex-col items-center text-center gap-3 px-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
