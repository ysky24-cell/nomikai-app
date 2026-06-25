import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl);

export async function checkRedis() {
  const result = await redis.ping();
  if (result !== "PONG") {
    throw new Error("redis_unavailable");
  }
}
