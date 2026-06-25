import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
});

export async function checkRedis() {
  const pong = await redis.ping();
  if (pong !== "PONG") {
    throw new Error("Redis ping failed");
  }
}
