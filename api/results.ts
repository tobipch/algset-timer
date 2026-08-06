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
    if (req.method === "PATCH") return await updateRegrips(req, res);
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

// Nachträgliche Korrektur der Regrip-Zahl am jüngsten Ergebnis eines Cases.
// Die gemessenen Zeiten bleiben unangetastet.
async function updateRegrips(req: VercelRequest, res: VercelResponse) {
  const { caseId, regrips } = req.body ?? {};
  if (!Number.isInteger(caseId) || caseId <= 0) {
    return res.status(400).json({ error: "invalid caseId" });
  }
  if (!Number.isInteger(regrips) || regrips < 0 || regrips > 20) {
    return res.status(400).json({ error: "invalid regrips" });
  }

  const updated = (await sql`
    UPDATE results SET regrips = ${regrips}
     WHERE id = (
       SELECT id FROM results WHERE case_id = ${caseId}
        ORDER BY created_at DESC, id DESC LIMIT 1
     )
    RETURNING id, times_ms, avg_ms, regrips, created_at
  `) as {
    id: number;
    times_ms: number[] | null;
    avg_ms: number;
    regrips: number;
    created_at: string;
  }[];

  if (updated.length === 0) {
    return res.status(404).json({ error: "no result for this case" });
  }
  const r = updated[0];
  const timesMs = Array.isArray(r.times_ms) ? r.times_ms : null;
  res.status(200).json({
    result: {
      id: r.id,
      timesMs: r.times_ms,
      avgMs: timesMs ? Math.round(trimmedMean(timesMs)!) : r.avg_ms,
      regrips: r.regrips,
      createdAt: r.created_at,
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
