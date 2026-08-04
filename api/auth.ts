import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  SESSION_COOKIE,
  SESSION_TTL_S,
  authRequired,
  checkPassword,
  isAuthed,
  serializeCookie,
  sessionToken,
} from "./_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    res.status(200).json({ authRequired: authRequired(), authed: isAuthed(req) });
    return;
  }

  if (req.method === "POST") {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!authRequired()) {
      res.status(200).json({ authed: true });
      return;
    }
    if (!checkPassword(password)) {
      res.status(403).json({ error: "wrong password" });
      return;
    }
    res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, sessionToken(), SESSION_TTL_S));
    res.status(200).json({ authed: true });
    return;
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, "", 0));
    res.status(200).json({ authed: false });
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
