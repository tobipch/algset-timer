import { sql } from "./db.js";

// Create the schema on demand so no manual setup step is needed: the first
// API request of a lambda instance runs the (idempotent) CREATE statements
// once; afterwards the cached promise makes this a no-op.
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = createSchema().catch((e) => {
      schemaReady = null; // retry on the next request
      throw e;
    });
  }
  return schemaReady;
}

async function createSchema(): Promise<void> {
  await sql.transaction([
    sql`
      CREATE TABLE IF NOT EXISTS algsets (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        piece_type TEXT NOT NULL CHECK (piece_type IN ('edge', 'corner')),
        buffer TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS cases (
        id SERIAL PRIMARY KEY,
        algset_id INTEGER NOT NULL REFERENCES algsets(id) ON DELETE CASCADE,
        pair TEXT NOT NULL,
        alg TEXT NOT NULL,
        sort_index INTEGER NOT NULL DEFAULT 0,
        UNIQUE (algset_id, pair)
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        times_ms JSONB NOT NULL,
        avg_ms INTEGER NOT NULL,
        regrips INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
    sql`CREATE INDEX IF NOT EXISTS results_case_idx ON results (case_id, created_at DESC)`,
  ]);
}
