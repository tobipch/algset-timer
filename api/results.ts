import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { ensureSchema } from "./_lib/schema.js";
import { requireAuth } from "./_lib/auth.js";
import { trimmedMean } from "./_lib/stats.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  try {
    await ensureSchema();
    if (req.method === "POST") return await saveResult(req, res);
    if (req.method === "DELETE") return await deleteResults(req, res);
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error("results api failed:", e);
    res.status(500).json({ error: "internal error" });
  }
}

async function saveResult(req: VercelRequest, res: VercelResponse) {
  const { caseId, timesMs, regrips } = req.body ?? {};
  if (!Number.isInteger(caseId) || caseId <= 0) {
    return res.status(400).json({ error: "invalid caseId" });
  }
  if (
    !Array.isArray(timesMs) ||
    timesMs.length === 0 ||
    timesMs.length > 100 ||
    !timesMs.every((t) => Number.isFinite(t) && t > 0 && t < 10 * 60 * 1000)
  ) {
    return res.status(400).json({ error: "invalid timesMs" });
  }
  if (!Number.isInteger(regrips) || regrips < 0 || regrips > 20) {
    return res.status(400).json({ error: "invalid regrips" });
  }

  const rounded = timesMs.map((t: number) => Math.round(t));
  // Getrimmter Mittelwert: je floor(10%) der schnellsten und langsamsten
  // Versuche fallen weg (bei 12 Versuchen also je einer).
  const avgMs = Math.round(trimmedMean(rounded)!);

  const inserted = (await sql`
    INSERT INTO results (case_id, times_ms, avg_ms, regrips)
    VALUES (${caseId}, ${JSON.stringify(rounded)}::jsonb, ${avgMs}, ${regrips})
    RETURNING id, created_at
  `) as { id: number; created_at: string }[];

  res.status(200).json({
    result: {
      id: inserted[0].id,
      timesMs: rounded,
      avgMs,
      regrips,
      createdAt: inserted[0].created_at,
    },
  });
}

async function deleteResults(req: VercelRequest, res: VercelResponse) {
  const caseId = Number(req.query.caseId);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    return res.status(400).json({ error: "invalid caseId" });
  }
  await sql`DELETE FROM results WHERE case_id = ${caseId}`;
  res.status(200).json({ ok: true });
}
