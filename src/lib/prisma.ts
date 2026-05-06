import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL env var is required");
}

const fileFromUrl = (url: string) => {
  if (url === ":memory:") return ":memory:";
  return url.replace(/^file:/, "");
};

// Enable WAL mode + a few sane pragmas once per process via a sidecar
// better-sqlite3 connection. WAL is persistent on the file, so this is a no-op
// after the first run, but it costs nothing and survives DB rebuilds.
const enableWalMode = (url: string) => {
  if (url === ":memory:") return;
  try {
    const db = new Database(fileFromUrl(url));
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    db.close();
  } catch (err) {
    console.warn("Failed to set SQLite pragmas:", err);
  }
};

declare global {
  // eslint-disable-next-line no-var
  var __billyPrisma: PrismaClient | undefined;
}

const buildClient = () => {
  enableWalMode(databaseUrl);
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
};

export const prisma: PrismaClient = global.__billyPrisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  global.__billyPrisma = prisma;
}
