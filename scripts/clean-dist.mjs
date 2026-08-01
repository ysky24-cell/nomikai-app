import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await rm(resolve(workspaceDir, "dist"), { recursive: true, force: true });
