import "dotenv/config";

function readEnv(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function readPort() {
  const rawPort = readEnv("PORT", "3000");
  const port = Number.parseInt(rawPort, 10);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }
  return port;
}

export const config = {
  port: readPort(),
  databaseUrl: readEnv("DATABASE_URL", "postgresql://nomikai:nomikai_password@localhost:5432/nomikai"),
  redisUrl: readEnv("REDIS_URL", "redis://localhost:6379"),
  clientOrigin: readEnv("CLIENT_ORIGIN", "http://localhost:5173"),
};
