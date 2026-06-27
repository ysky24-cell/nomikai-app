#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const lifecycleScript = resolve(scriptDir, "room-lifecycle-check.mjs");
const args = process.argv.slice(2);

const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
const apiUrl = process.env.API_URL ?? positionalArgs[0] ?? "http://localhost:3000";
const stopOnFail = parseBoolean(process.env.STOP_ON_FAIL, false);

if (flags.has("--help") || flags.has("-h")) {
  printHelp();
  process.exit(0);
}

try {
  const discoveredGameKeys = await discoverGameKeys();
  const requestedGameKeys = parseList(process.env.GAME_KEYS);
  const skippedGameKeys = new Set(parseList(process.env.SKIP_GAME_KEYS));
  const gameKeys = (requestedGameKeys.length > 0 ? requestedGameKeys : discoveredGameKeys).filter(
    (gameKey) => !skippedGameKeys.has(gameKey),
  );

  validateRequestedKeys(requestedGameKeys, discoveredGameKeys);

  if (flags.has("--list")) {
    for (const gameKey of gameKeys) {
      console.log(gameKey);
    }
    console.log(`Total: ${gameKeys.length}`);
    process.exit(0);
  }

  if (gameKeys.length === 0) {
    throw new Error("no game keys to check");
  }

  console.log(`API: ${apiUrl}`);
  console.log(`Game keys: ${gameKeys.length}`);

  const results = [];
  for (const [index, gameKey] of gameKeys.entries()) {
    const gameTitle = buildGameTitle(gameKey);
    console.log(`\n=== ${index + 1}/${gameKeys.length}: ${gameKey} ===`);
    const result = await runLifecycleCheck(gameKey, gameTitle);
    results.push(result);

    if (result.exitCode !== 0 && stopOnFail) {
      break;
    }
  }

  const failed = results.filter((result) => result.exitCode !== 0);
  console.log("\n=== Summary ===");
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Skipped: ${gameKeys.length - results.length}`);

  if (failed.length > 0) {
    console.log(`Failed game keys: ${failed.map((result) => result.gameKey).join(", ")}`);
    process.exitCode = 1;
  } else if (results.length !== gameKeys.length) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[failed] ${message}`);
  process.exitCode = 1;
}

async function discoverGameKeys() {
  const [appSource, urlCandidateSource] = await Promise.all([
    readFile(resolve(projectRoot, "src", "App.tsx"), "utf8"),
    readFile(resolve(projectRoot, "src", "data", "urlCandidateGames.ts"), "utf8"),
  ]);

  return unique([
    ...readStringUnion(appSource, "BuiltInGameKey"),
    ...readStringUnion(urlCandidateSource, "UrlCandidateGameKey"),
  ]);
}

function readStringUnion(source, typeName) {
  const match = source.match(new RegExp(`(?:export\\s+)?type\\s+${typeName}\\s*=([\\s\\S]*?);`));
  if (!match) {
    throw new Error(`could not find ${typeName}`);
  }

  const values = [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
  if (values.length === 0) {
    throw new Error(`could not read values from ${typeName}`);
  }
  return values;
}

function runLifecycleCheck(gameKey, gameTitle) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [lifecycleScript], {
      cwd: projectRoot,
      env: {
        ...process.env,
        API_URL: apiUrl,
        GAME_KEY: gameKey,
        GAME_TITLE: gameTitle,
      },
      stdio: "inherit",
    });

    child.on("error", (error) => {
      console.error(`[failed] ${gameKey}: ${error.message}`);
      resolve({ gameKey, exitCode: 1 });
    });

    child.on("close", (code) => {
      resolve({ gameKey, exitCode: code ?? 1 });
    });
  });
}

function validateRequestedKeys(requestedGameKeys, discoveredGameKeys) {
  if (requestedGameKeys.length === 0 || parseBoolean(process.env.ALLOW_UNKNOWN_GAME_KEYS, false)) {
    return;
  }

  const discovered = new Set(discoveredGameKeys);
  const unknown = requestedGameKeys.filter((gameKey) => !discovered.has(gameKey));
  if (unknown.length > 0) {
    throw new Error(
      `unknown GAME_KEYS: ${unknown.join(", ")}. Set ALLOW_UNKNOWN_GAME_KEYS=1 to run them anyway.`,
    );
  }
}

function parseList(value) {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value, defaultValue) {
  if (value == null || value === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(value);
}

function buildGameTitle(gameKey) {
  return gameKey
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function unique(items) {
  return [...new Set(items)];
}

function printHelp() {
  console.log(`Run the room lifecycle check for every known active game key.

Usage:
  npm run room:lifecycle:check:all
  npm run room:lifecycle:check:all -- http://localhost:3000
  GAME_KEYS=word-wolf,two-choice npm run room:lifecycle:check:all

Options:
  --list       Print discovered game keys without calling the API.
  --help       Show this message.

Environment:
  API_URL                 Room API base URL. Defaults to http://localhost:3000.
  GAME_KEYS               Comma or space separated game keys to check.
  SKIP_GAME_KEYS          Comma or space separated game keys to skip.
  STOP_ON_FAIL=1          Stop after the first failed game key.
  ALLOW_UNKNOWN_GAME_KEYS=1  Allow explicit GAME_KEYS outside the discovered active list.
`);
}
