import dotenv from "dotenv";

dotenv.config();

function readClientOrigin(value: string | undefined) {
  const origins = (value ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length <= 1 ? origins[0] ?? "http://localhost:5173" : origins;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://nomikai:nomikai@localhost:5432/nomikai",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  clientOrigin: readClientOrigin(process.env.CLIENT_ORIGIN),
};
