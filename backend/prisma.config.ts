import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "src/prisma/schema.prisma",
  // Plain process.env access (not the config `env()` helper) so commands
  // that don't need a live database, like `prisma generate`, still work
  // when DATABASE_URL isn't set yet (e.g. a fresh install/build).
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    path: "src/prisma/migrations",
    seed: "tsx src/prisma/seed.ts",
  },
});
