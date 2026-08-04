import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

// One HTTP client per lambda instance. The Neon serverless driver speaks HTTP
// per query, so there is no pool to manage.
const globalForSql = globalThis as unknown as { neonSql?: NeonQueryFunction<false, false> };

function createSql(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set");
  return neon(url);
}

export const sql: NeonQueryFunction<false, false> = globalForSql.neonSql ?? createSql();
globalForSql.neonSql = sql;
