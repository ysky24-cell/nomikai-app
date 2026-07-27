import assert from "node:assert/strict";
import test from "node:test";
import { log } from "./logger.js";

test("structured logger redacts secret-shaped fields", () => {
  const original = console.log;
  let line = "";
  console.log = ((value?: unknown) => { line = String(value); }) as typeof console.log;
  try {
    log("info", "command", { token: "do-not-print", text: "anonymous body", version: 2 });
  } finally {
    console.log = original;
  }
  assert.equal(line.includes("do-not-print"), false);
  assert.equal(line.includes("anonymous body"), false);
  assert.equal(line.includes('"version":2'), true);
});
