import { env } from "cloudflare:workers";
import { schemaStatements } from "./schema";

export interface AppBindings {
  DB: D1Database;
  SOURCE_FILES: R2Bucket;
}

export function getBindings(): AppBindings {
  const bindings = env as unknown as Partial<AppBindings>;
  if (!bindings.DB || !bindings.SOURCE_FILES) {
    throw new Error("Chart persistence bindings are unavailable.");
  }
  return bindings as AppBindings;
}

export async function ensureSchema(db: D1Database): Promise<void> {
  for (const statement of schemaStatements) {
    await db.prepare(statement).run();
  }
}
