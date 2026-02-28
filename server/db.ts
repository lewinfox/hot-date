import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@shared/schema';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_PATH || './data/hot-date.db';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.resolve('migrations') });
