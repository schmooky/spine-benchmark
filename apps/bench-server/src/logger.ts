import { pino } from "pino";
import { pinoHttp } from "pino-http";

import { config } from "./config.js";

export const logger = pino({
  level: config.logLevel,
  base: { service: "bench-server" },
});

/** Request logger with noise control: health probes log at trace. */
export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (req.url === "/healthz" || req.url === "/livez") return "trace";
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});
