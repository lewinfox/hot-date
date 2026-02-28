/**
 * main.tsx — Application Entry Point
 *
 * This is the very first file that runs in the browser. Its sole job is to
 * "mount" the React application onto the HTML page.
 *
 * How a React app boots:
 *   1. The browser loads index.html, which contains a single empty <div id="root">.
 *   2. Vite (the build tool) injects a <script> tag that loads this file.
 *   3. This file finds that <div> and hands it to React, which then takes over
 *      and renders the entire UI tree inside it.
 *
 * After this point, the browser never navigates to a new HTML page — React
 * intercepts link clicks and swaps the visible content itself. This is what
 * makes it a "Single Page Application" (SPA).
 */

import { createRoot } from 'react-dom/client';
import App from './App';
// Global CSS — Tailwind base styles, custom properties, and any app-wide rules.
import './index.css';

/**
 * `document.getElementById('root')` returns the <div id="root"> from index.html.
 *
 * The `!` at the end is a TypeScript non-null assertion. getElementById can
 * technically return null (if no element with that ID exists), which TypeScript
 * would normally flag as an error. The `!` tells TypeScript "trust me, this
 * element definitely exists" — if it doesn't, React will throw a runtime error
 * which is appropriate because the page fundamentally can't work without it.
 *
 * `createRoot` is React 18's API for initialising a React "root" — the
 * attachment point between the React component tree and the real DOM.
 *
 * `.render(<App />)` kicks off the first render pass. React evaluates the
 * entire component tree (App → Router → Home/Event/etc.) and writes the
 * resulting HTML into the <div id="root">.
 */
createRoot(document.getElementById('root')!).render(<App />);
