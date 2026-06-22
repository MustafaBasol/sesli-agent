import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { corsAllowedOrigins } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestId } from "./middleware/requestId";
import { authRouter } from "./routes/auth";
import { conversationsRouter } from "./routes/conversations";
import { customersRouter } from "./routes/customers";
import { dashboardRouter } from "./routes/dashboard";
import { healthRouter } from "./routes/health";
import { integrationsRouter } from "./routes/integrations";
import { reservationRequestsRouter } from "./routes/reservationRequests";
import { reservationsRouter } from "./routes/reservations";
import { restaurantAvailabilityRouter } from "./routes/restaurantAvailability";
import { restaurantSettingsRouter } from "./routes/restaurantSettings";
import { restaurantsRouter } from "./routes/restaurants";
import { tablesRouter } from "./routes/tables";
import { teamRouter } from "./routes/team";
import { vapiWebhookRouter } from "./routes/webhooks/vapi";
import { logger } from "./utils/logger";

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  // Empty allow-list (dev/test only — production requires CORS_ALLOWED_ORIGINS,
  // see src/config/env.ts) means "reflect any origin" so local frontend dev
  // needs no configuration. A non-empty list restricts to exactly those origins.
  app.use(cors(corsAllowedOrigins.length > 0 ? { origin: corsAllowedOrigins } : {}));
  app.use(express.json());
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.requestId,
    })
  );

  app.use("/health", healthRouter);
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/restaurants", restaurantsRouter);
  app.use("/api/restaurants", reservationRequestsRouter);
  app.use("/api/restaurants", reservationsRouter);
  app.use("/api/restaurants", customersRouter);
  app.use("/api/restaurants", tablesRouter);
  app.use("/api/restaurants", conversationsRouter);
  app.use("/api/restaurants", integrationsRouter);
  app.use("/api/restaurants", dashboardRouter);
  app.use("/api/restaurants", teamRouter);
  app.use("/api/restaurants", restaurantSettingsRouter);
  app.use("/api/restaurants", restaurantAvailabilityRouter);
  app.use("/api/webhooks/vapi", vapiWebhookRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
