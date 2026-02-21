import express from "express";
import userRoutes from "./routes/user.routes.js";
import productRoutes from "./routes/product.routes.js";
import { env } from "./config/env.js";
import helmet from "helmet";
import cors from "cors";
import redis from "./config/redis.js";
import logger from "./config/logger.js";

const app = express();

app.use(helmet()); // Secure HTTP headers
app.use(cors({ origin: env.CORS_ORIGIN })); // CORS

// ─── Body Parsing ───
app.use(express.json({ limit: "10kb" })); // Prevent large payload attacks
app.use(express.urlencoded({ extended: true }));

// Routes
app.get("/health", async (_req, res) => {
  const redisStatus = redis.status === "ready" ? "connected" : redis.status;

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: redisStatus,
  });
});

app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    await redis.quit(); // Close Redis connection
    logger.info("Server closed.");
    process.exit(0);
  });

  // Force exit after 10s if connections don't close
  setTimeout(() => {
    logger.error("Forcing shutdown...");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM")); // Docker sends this
process.on("SIGINT", () => shutdown("SIGINT")); // Ctrl+C sends this
