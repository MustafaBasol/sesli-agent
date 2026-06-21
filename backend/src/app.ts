import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestId } from "./middleware/requestId";
import { authRouter } from "./routes/auth";
import { conversationsRouter } from "./routes/conversations";
import { customersRouter } from "./routes/customers";
import { dashboardRouter } from "./routes/dashboard";
import { healthRouter } from "./routes/health";
import { integrationsRouter } from "./routes/integrations";
import { reservationRequestsRouter } from "./routes/reservationRequests";
import { restaurantsRouter } from "./routes/restaurants";
import { vapiWebhookRouter } from "./routes/webhooks/vapi";
import { logger } from "./utils/logger";

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
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
  app.use("/api/restaurants", customersRouter);
  app.use("/api/restaurants", conversationsRouter);
  app.use("/api/restaurants", integrationsRouter);
  app.use("/api/restaurants", dashboardRouter);
  app.use("/api/webhooks/vapi", vapiWebhookRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
