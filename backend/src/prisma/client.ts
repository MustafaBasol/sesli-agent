import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

// Prisma 7 no longer reads the connection string from schema.prisma; the
// client needs an explicit driver adapter. See prisma.config.ts for the
// equivalent wiring used by the Prisma CLI (migrate/generate).
const adapter = env.DATABASE_URL ? new PrismaPg({ connectionString: env.DATABASE_URL }) : undefined;

export const prisma = new PrismaClient({ adapter });
