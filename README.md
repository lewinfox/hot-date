# Hot Date

A group scheduling app for finding shared availability. Users create events, share a link, and participants mark which dates work for them. A heatmap shows overlapping availability to help the group find the best time.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui, React Query, wouter |
| Backend | Node.js 20, Express 5, TypeScript (tsx) |
| Database | SQLite (via better-sqlite3) |
| ORM | Drizzle ORM + Drizzle Kit |

## Project Structure

```
.
├── client/         # React SPA (Vite)
│   └── src/
│       ├── pages/      # Home (create event), Event (view/edit availability)
│       ├── components/ # Calendar, UI primitives
│       └── lib/        # React Query hooks, query client config
├── server/         # Express API
│   ├── index.ts    # Entry point, middleware, server setup
│   ├── routes.ts   # API route handlers
│   └── storage.ts  # Database access layer
├── shared/         # Shared between client and server
│   ├── schema.ts   # Drizzle table definitions + TypeScript types
│   └── routes.ts   # Zod request/response schemas
├── migrations/     # SQL migration files (auto-generated, commit these)
└── script/         # Build scripts (esbuild for production)
```

## Architecture

The server runs Express and serves the Vite dev server (with HMR) in development, or static files from `dist/public/` in production. The API is under `/api/`; all other paths fall through to the SPA.

The database schema lives in `shared/schema.ts` and is shared across client and server for type safety. Path aliases `@/*` (client source) and `@shared/*` (shared/) are configured in both tsconfig and Vite.

On startup the server automatically applies any pending migrations from the `migrations/` folder using Drizzle's `migrate()`, creating the database file if it doesn't exist yet.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/events` | Create an event |
| `GET` | `/api/events/:slug` | Fetch event + all participants + availabilities |
| `POST` | `/api/events/:slug/participants` | Add or update a participant's availability (upsert by name) |

### Database Schema

- **events** — title, description, start/end dates, auto-generated slug
- **participants** — name, linked to an event
- **availabilities** — per-participant, per-date entries with type: `all_day` | `morning` | `afternoon`

## Running Locally

You need Node.js 20+. No separate database process is required.

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

The app is available at [http://localhost:5000](http://localhost:5000). The SQLite database file is created at `./data/hot-date.db` on first run.

## Deployment

### Docker (prebuilt image)

The quickest way to self-host is to pull the prebuilt image from the GitHub Container Registry:

```bash
docker run -d \
  --name hot-date \
  -p 5000:5000 \
  -v hot-date-data:/data \
  -e DATABASE_PATH=/data/hot-date.db \
  ghcr.io/lewinfox/hot-date:latest
```

The app will be available at [http://localhost:5000](http://localhost:5000).

To keep the container running across reboots, add `--restart unless-stopped`.

#### Using Docker Compose

Save the following as `docker-compose.yml` and run `docker compose up -d`:

```yaml
services:
  app:
    image: ghcr.io/lewinfox/hot-date:latest
    ports:
      - "5000:5000"
    volumes:
      - db_data:/data
    environment:
      DATABASE_PATH: /data/hot-date.db
    restart: unless-stopped

volumes:
  db_data:
```

#### Persistent data

The SQLite database is stored in the `/data` directory inside the container. Mount a volume there (as shown above) to keep your data when the container is updated or recreated.

### Building from source

```bash
docker compose up --build
```

## Changing the Database Schema

1. Edit `shared/schema.ts`
2. Generate a migration file:

```bash
npm run db:generate
```

This diffs your schema against the previous state and writes a new SQL file to `migrations/` (e.g. `0001_....sql`).

3. Commit both the schema change and the new migration file.

On next startup (dev or production), `migrate()` will automatically apply the new migration.

> Note: migrations only run forward. To undo a change, write a new migration that reverses it.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/hot-date.db` | Path to the SQLite database file |
| `EVENT_CLEANUP_DAYS` | `30` | Delete events this many days after their end date (set to `0` to disable) |
| `NODE_ENV` | — | Set to `development` or `production` |
| `PORT` | `5000` | Port the server listens on |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Bundle client + server for production |
| `npm start` | Run the production build |
| `npm run check` | TypeScript type checking |
| `npm run db:generate` | Generate a migration file from schema changes |
| `npm run db:push` | Directly push schema to DB (useful in development) |
