import postgres from "postgres";

export function createClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return postgres(databaseUrl, { max: 1 });
}

export type Db = ReturnType<typeof createClient>;
