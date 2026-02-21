import winston from "winston";
import { env } from "./env.js";

const logger = winston.createLogger({
  level: env.isDev ? "debug" : "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(), // JSON logs → Loki/ELK can parse these
  ),
  defaultMeta: { service: "api" },
  transports: [
    new winston.transports.Console({
      format: env.isDev
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(), // Human-readable in development
          )
        : winston.format.json(), // JSON in production
    }),
  ],
});

export default logger;