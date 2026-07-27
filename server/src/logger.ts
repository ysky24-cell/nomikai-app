import type { Request } from "express";
import { randomUUID } from "node:crypto";

export function requestCorrelationId(request: Request) {
  const supplied = request.header("x-correlation-id");
  return supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : randomUUID();
}

/** Structured, redacted logs. Never pass request bodies, tokens or game state. */
export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key]) => !/(token|secret|password|body|text|topic|role|payload)/i.test(key)));
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...safe }));
}
