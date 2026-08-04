import { env } from "cloudflare:workers";
import { schemaStatements } from "./schema";

const schemaInitializations = new WeakMap<object, Promise<void>>();

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
  const databaseKey = db as unknown as object;
  const activeInitialization = schemaInitializations.get(databaseKey);
  if (activeInitialization) {
    await activeInitialization;
    return;
  }

  const initialization = (async () => {
    for (const statement of schemaStatements) {
      await db.prepare(statement).run();
    }
  })();
  schemaInitializations.set(databaseKey, initialization);

  try {
    await initialization;
  } catch (error) {
    if (schemaInitializations.get(databaseKey) === initialization) {
      schemaInitializations.delete(databaseKey);
    }
    throw error;
  }
}
