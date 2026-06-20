import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

// Prisma 7 no longer reads the connection string from schema.prisma; the
// client needs an explicit driver adapter, and the constructor rejects an
// undefined adapter outright. The adapter only connects lazily on first
// query, so a placeholder url keeps the app booting (and /health serving)
// without DATABASE_URL set — any route that actually touches the database
// will fail at query time instead, which is the same behavior Phase 1
// already relied on. See prisma.config.ts for the equivalent CLI wiring.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL ?? "postgresql://unset/unset" });

export const prisma = new PrismaClient({ adapter });
