import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://nomikai:nomikai@localhost:5432/nomikai",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
};
