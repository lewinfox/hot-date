/**
 * server/db.ts — Database Connection and Migration
 *
 * This file sets up the single SQLite database connection used by the entire
 * server. It is imported by `storage.ts`, which is the only module that
 * actually runs queries — nothing else should import `db` directly.
 *
 * Technology choices:
 *
 *   SQLite (via better-sqlite3):
 *     A file-based relational database. Unlike PostgreSQL or MySQL, there's no
 *     separate server process to manage — the database is a single `.db` file on
 *     disk that the Node process reads and writes directly. This is ideal for a
 *     self-hosted app with modest traffic.
 *
 *   Drizzle ORM:
 *     An ORM (Object-Relational Mapper) provides a type-safe TypeScript API for
 *     writing SQL queries. Instead of raw SQL strings like
 *       `sqlite.prepare("SELECT * FROM events WHERE slug = ?").get(slug)`
 *     you write:
 *       `db.select().from(events).where(eq(events.slug, slug))`
 *     The benefit is that TypeScript knows the shape of the result — if the
 *     schema changes, type errors appear at compile time rather than as runtime
 *     surprises.
 *
 *   Drizzle migrations:
 *     Rather than manually running `ALTER TABLE` SQL scripts when the schema
 *     changes, Drizzle generates migration files (in the `migrations/` directory)
 *     and applies them automatically on startup. This ensures the database schema
 *     is always in sync with the code, even across deployments.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@shared/schema';
import path from 'path';
import fs from 'fs';

/**
 * Database file path.
 *
 * Defaults to `./data/hot-date.db` (relative to the working directory) but
 * can be overridden with the `DATABASE_PATH` environment variable. This allows
 * different paths in development, Docker containers, and production deployments
 * without changing the code.
 *
 * `fs.mkdirSync(..., { recursive: true })` creates the directory if it doesn't
 * already exist. `recursive: true` makes this a no-op if the directory is
 * already present (no error thrown), so it's safe to call on every startup.
 * Without this, starting the server for the first time would fail if `./data/`
 * hasn't been created yet.
 */
const dbPath = process.env.DATABASE_PATH || './data/hot-date.db';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

/**
 * Open (or create) the SQLite database file.
 *
 * `better-sqlite3` opens the file synchronously. If the file doesn't exist,
 * SQLite creates it automatically. The constructor call alone creates an empty
 * database; the schema is applied by Drizzle's migrate() call below.
 */
const sqlite = new Database(dbPath);

/**
 * Enable WAL (Write-Ahead Logging) journal mode.
 *
 * SQLite's default journal mode ("DELETE") locks the entire database file
 * during writes, blocking concurrent reads. WAL mode separates reads and
 * writes into different files, allowing readers to continue uninterrupted
 * while a write is in progress.
 *
 * For a web server that may handle multiple concurrent requests, WAL mode
 * provides significantly better read performance at the cost of a slightly
 * more complex on-disk layout (a `-wal` and `-shm` file appear alongside the
 * main `.db` file during operation).
 *
 * `sqlite.pragma(...)` executes a SQLite PRAGMA statement directly on the
 * connection. PRAGMAs are SQLite-specific configuration commands that don't
 * fit the standard SQL syntax.
 */
sqlite.pragma('journal_mode = WAL');

/**
 * db — The Drizzle query builder instance.
 *
 * `drizzle(sqlite, { schema })` wraps the raw SQLite connection in Drizzle's
 * type-safe query API. Passing `schema` gives Drizzle access to the table
 * definitions from `@shared/schema`, which it uses for type inference — so
 * `db.select().from(events)` returns `Event[]`, not `unknown[]`.
 *
 * This is the object that storage.ts imports and uses to run all queries.
 */
export const db = drizzle(sqlite, { schema });

/**
 * Apply pending database migrations on startup.
 *
 * `migrate()` reads the SQL files from the `migrations/` directory and runs any
 * that haven't been applied yet (tracked in a `__drizzle_migrations` table in
 * the database). This is idempotent — if the database is already up to date,
 * it does nothing.
 *
 * Running migrations synchronously on startup (before the HTTP server begins
 * listening) ensures the schema is correct before any request could reach a
 * route handler. If a migration fails, the process crashes immediately with
 * a clear error rather than silently serving requests against a broken schema.
 *
 * `path.resolve('migrations')` resolves the path relative to the process's
 * working directory (the project root), not relative to this file's location.
 */
migrate(db, { migrationsFolder: path.resolve('migrations') });
