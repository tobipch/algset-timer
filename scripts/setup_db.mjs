// Creates the database schema on the Neon database given by DATABASE_URL.
// Usage: DATABASE_URL=postgres://... npm run setup-db
// (or put DATABASE_URL into a .env file next to package.json)
import { neon } from '@neondatabase/serverless'
import { readFileSync, existsSync } from 'node:fs'

// Minimal .env loader so the script works without extra dependencies.
if (!process.env.DATABASE_URL && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (env var or .env file)')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)

await sql`
  CREATE TABLE IF NOT EXISTS algsets (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    piece_type TEXT NOT NULL CHECK (piece_type IN ('edge', 'corner')),
    buffer TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`
await sql`
  CREATE TABLE IF NOT EXISTS cases (
    id SERIAL PRIMARY KEY,
    algset_id INTEGER NOT NULL REFERENCES algsets(id) ON DELETE CASCADE,
    pair TEXT NOT NULL,
    alg TEXT NOT NULL,
    sort_index INTEGER NOT NULL DEFAULT 0,
    UNIQUE (algset_id, pair)
  )
`
await sql`
  CREATE TABLE IF NOT EXISTS results (
    id SERIAL PRIMARY KEY,
    case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    times_ms JSONB NOT NULL,
    avg_ms INTEGER NOT NULL,
    regrips INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`
await sql`CREATE INDEX IF NOT EXISTS results_case_idx ON results (case_id, created_at DESC)`

console.log('Schema ist eingerichtet.')
