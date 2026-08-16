import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createRuntimeContext, createVerifyServer } from "./server.js";

export function requireEnv(env: NodeJS.Dict<string> = process.env) {
  const DATABASE_URL = env.DATABASE_URL;
  const CROMA_API_KEY = env.CROMA_API_KEY;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!CROMA_API_KEY) throw new Error("CROMA_API_KEY is required");
  return { DATABASE_URL, CROMA_API_KEY };
}

export function start(env: NodeJS.Dict<string> = process.env) {
  const resolved = requireEnv(env);
  serveStdio(() => createVerifyServer(createRuntimeContext(resolved)));
}

if (!process.env.VITEST) {
  start();
}
