import { Redis } from "ioredis";
import { env } from "./env.js";
import logger from "./logger.js";

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    // Reconnect after increasing delay (max 3 seconds)
    const delay = Math.min(times * 200, 3000);
    logger.warn(`Redis reconnecting... attempt ${times}`);
    return delay;
  },
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("error", (err: Error) => {
  logger.error("Redis error", { error: err.message });
});

export default redis;
