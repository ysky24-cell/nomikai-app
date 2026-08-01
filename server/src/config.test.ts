import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("production configuration rejects the known placeholder database password", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", "--input-type=module", "-e", "import('./src/config.ts')"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "postgres://nomikai:valid-password@db:5432/nomikai",
        REDIS_URL: "redis://redis:6379",
        CLIENT_ORIGIN: "https://app.example.com",
        POSTGRES_PASSWORD: "CHANGE_ME",
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /postgres_password_placeholder_not_allowed/);
});
