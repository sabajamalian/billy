import "dotenv/config";
import { defineConfig } from "prisma/config";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL env var is required");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Required for `prisma migrate dev`. The runtime adapter is configured at
  // PrismaClient construction time (see src/lib/prisma.ts).
  datasource: { url },
});
