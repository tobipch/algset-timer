import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { requireAuth } from "./_lib/auth.js";

const VALID_PAIR = /^[A-X]{2}$/;

interface CaseInput {
  pair: string;
  alg: string;
  sortIndex?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === "GET") return await listAlgsets(res);
    if (req.method === "POST") return await createAlgset(req, res);
    if (req.method === "DELETE") return await deleteAlgset(req, res);
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error("algsets api failed:", e);
    res.status(500).json({ error: "internal error" });
  }
}

async function listAlgsets(res: VercelResponse) {
  const algsets = (await sql`
    SELECT id, name, piece_type, buffer, created_at FROM algsets ORDER BY created_at DESC, id DESC
  `) as { id: number; name: string; piece_type: string; buffer: string; created_at: string }[];

  const cases = (await sql`
    SELECT c.id, c.algset_id, c.pair, c.alg, c.sort_index,
           r.times_ms, r.avg_ms, r.regrips, r.created_at AS result_at
      FROM cases c
      LEFT JOIN LATERAL (
        SELECT times_ms, avg_ms, regrips, created_at
          FROM results
         WHERE case_id = c.id
         ORDER BY created_at DESC, id DESC
         LIMIT 1
      ) r ON true
     ORDER BY c.algset_id, c.sort_index, c.pair
  `) as {
    id: number;
    algset_id: number;
    pair: string;
    alg: string;
    sort_index: number;
    times_ms: number[] | null;
    avg_ms: number | null;
    regrips: number | null;
    result_at: string | null;
  }[];

  const byAlgset = new Map<number, unknown[]>();
  for (const c of cases) {
    if (!byAlgset.has(c.algset_id)) byAlgset.set(c.algset_id, []);
    byAlgset.get(c.algset_id)!.push({
      id: c.id,
      pair: c.pair,
      alg: c.alg,
      sortIndex: c.sort_index,
      result:
        c.avg_ms == null
          ? null
          : { timesMs: c.times_ms, avgMs: c.avg_ms, regrips: c.regrips, createdAt: c.result_at },
    });
  }

  res.status(200).json({
    algsets: algsets.map((a) => ({
      id: a.id,
      name: a.name,
      pieceType: a.piece_type,
      buffer: a.buffer,
      createdAt: a.created_at,
      cases: byAlgset.get(a.id) ?? [],
    })),
  });
}

async function createAlgset(req: VercelRequest, res: VercelResponse) {
  const { name, pieceType, buffer, cases } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (pieceType !== "edge" && pieceType !== "corner") {
    return res.status(400).json({ error: "pieceType must be edge or corner" });
  }
  if (typeof buffer !== "string" || !/^[UDFBLR]{2,3}$/.test(buffer)) {
    return res.status(400).json({ error: "invalid buffer" });
  }
  if (!Array.isArray(cases) || cases.length === 0 || cases.length > 1000) {
    return res.status(400).json({ error: "cases must be a non-empty array" });
  }
  for (const c of cases as CaseInput[]) {
    if (!VALID_PAIR.test(c?.pair ?? "") || typeof c?.alg !== "string" || !c.alg.trim()) {
      return res.status(400).json({ error: `invalid case: ${JSON.stringify(c)}` });
    }
  }

  const inserted = (await sql`
    INSERT INTO algsets (name, piece_type, buffer) VALUES (${name.trim()}, ${pieceType}, ${buffer})
    RETURNING id
  `) as { id: number }[];
  const algsetId = inserted[0].id;

  // The Neon HTTP driver has no multi-row template insert; batch the case
  // inserts in one round trip via transaction().
  const typed = cases as CaseInput[];
  await sql.transaction(
    typed.map(
      (c, i) => sql`
        INSERT INTO cases (algset_id, pair, alg, sort_index)
        VALUES (${algsetId}, ${c.pair}, ${c.alg.trim()}, ${c.sortIndex ?? i})
      `
    )
  );

  res.status(200).json({ id: algsetId });
}

async function deleteAlgset(req: VercelRequest, res: VercelResponse) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "invalid id" });
  }
  await sql`DELETE FROM algsets WHERE id = ${id}`;
  res.status(200).json({ ok: true });
}
