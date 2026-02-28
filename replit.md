# Overview

This is a **group scheduling / availability finder** web application (similar to When2Meet or Doodle). Users can create events, share a link, and participants mark their availability on a calendar. The app then shows a heatmap of overlapping availability to help find the best time for everyone.

The project follows a monorepo structure with a React frontend (`client/`), Express backend (`server/`), and shared types/schemas (`shared/`).

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Directory Structure
- `client/` — React SPA (Vite-powered)
- `server/` — Express API server
- `shared/` — Shared schemas, types, and route definitions used by both client and server
- `migrations/` — Drizzle-generated database migrations
- `script/` — Build scripts

## Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: `wouter` (lightweight client-side router)
- **State/Data Fetching**: `@tanstack/react-query` for server state management
- **Styling**: Tailwind CSS with CSS variables for theming, `shadcn/ui` component library (new-york style), plus custom components
- **Animations**: `framer-motion` for page transitions and interactions
- **Icons**: `lucide-react`
- **Date handling**: `date-fns` for calendar generation and date math
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Key Pages
- `/` — Home page: Create a new event (title + optional description)
- `/event/:slug` — Event page: View event, add your name, select available dates on a 3-month calendar, see heatmap of all participants' availability

### Custom Components (outside shadcn/ui)
- `client/src/components/Calendar.tsx` — Custom multi-month calendar with date selection and heatmap visualization
- `client/src/components/Button.tsx` — Custom animated button using framer-motion
- `client/src/components/Input.tsx` — Custom styled input

## Backend Architecture
- **Framework**: Express 5 on Node.js
- **Language**: TypeScript, run with `tsx`
- **API pattern**: REST endpoints defined in `shared/routes.ts` as a typed route manifest with Zod validation
- **Development**: Vite dev server middleware proxied through Express for HMR
- **Production**: Client built with Vite, server bundled with esbuild into `dist/`

### API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/events` | Create a new event |
| GET | `/api/events/:slug` | Get event with all participants and availabilities |
| POST | `/api/events/:slug/participants` | Add or update a participant's availability |

### Validation
- Request validation uses Zod schemas defined in `shared/routes.ts`
- Schema types are generated from Drizzle tables using `drizzle-zod`

## Database
- **Database**: PostgreSQL (required, `DATABASE_URL` environment variable)
- **ORM**: Drizzle ORM with `node-postgres` driver
- **Schema location**: `shared/schema.ts`
- **Schema push**: `npm run db:push` (uses `drizzle-kit push`)

### Tables
- **events**: `id`, `slug` (unique, auto-generated 10-char string), `title`, `description`, `createdAt`
- **participants**: `id`, `eventId`, `name`
- **availabilities**: `id`, `eventId`, `participantId`, `date` (YYYY-MM-DD string), `type` (all_day/morning/afternoon)

## Build System
- **Dev**: `npm run dev` — runs Express + Vite dev server with HMR
- **Build**: `npm run build` — Vite builds client to `dist/public`, esbuild bundles server to `dist/index.cjs`
- **Production**: `npm start` — serves pre-built assets from `dist/`

## Data Flow
1. User creates event → POST to `/api/events` → returns event with slug
2. User navigates to `/event/:slug` → GET fetches event + all participants
3. Participant enters name, selects dates on calendar → POST to `/api/events/:slug/participants`
4. If name matches existing participant, their availability is updated (upsert pattern)
5. Heatmap recalculates from all participants' data client-side

# External Dependencies

## Required Services
- **PostgreSQL Database**: Must be provisioned and `DATABASE_URL` environment variable set. Used for all data persistence via Drizzle ORM.

## Key NPM Packages
- `express` (v5) — HTTP server
- `drizzle-orm` + `drizzle-kit` — Database ORM and migration tooling
- `pg` — PostgreSQL client
- `zod` + `drizzle-zod` — Runtime validation and schema generation
- `vite` + `@vitejs/plugin-react` — Frontend build tooling
- `react` + `react-dom` — UI framework
- `@tanstack/react-query` — Server state management
- `wouter` — Client-side routing
- `framer-motion` — Animations
- `date-fns` — Date utilities
- `tailwindcss` — Utility CSS framework
- `shadcn/ui` components — Pre-built accessible UI primitives (Radix-based)

## Replit-Specific Plugins
- `@replit/vite-plugin-runtime-error-modal` — Error overlay in development
- `@replit/vite-plugin-cartographer` — Development tooling (dev only)
- `@replit/vite-plugin-dev-banner` — Development banner (dev only)