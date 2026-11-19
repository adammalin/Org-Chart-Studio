import { DatabaseSync } from "node:sqlite";
import { registerHooks } from "node:module";
import { schemaStatements } from "../../db/schema";
const bindings: { DB: D1Database; SOURCE_FILES: R2Bucket } = {} as never;
(
  globalThis as unknown as { __ORGCHART_TEST_ENV: typeof bindings }
).__ORGCHART_TEST_ENV = bindings;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers")
      return {
        url: "data:text/javascript,export const env=globalThis.__ORGCHART_TEST_ENV",
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
export function testDatabase(path = ":memory:") {
  const sql = new DatabaseSync(path);
  for (const statement of schemaStatements) sql.exec(statement);
  const prepare = (query: string) => {
    let values: (string | number | null)[] = [];
    const p = {
      bind: (...args: typeof values) => {
        values = args;
        return p;
      },
      first: async () => sql.prepare(query).get(...values) ?? null,
      all: async () => ({ results: sql.prepare(query).all(...values) }),
      run: async () => {
        // D1 reports trigger writes too. SQLite's statement.changes reports only
        // the outer statement, which previously hid native-only regressions.
        const count = () =>
          (sql.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
        const before = count();
        const result = sql.prepare(query).run(...values);
        return { meta: { ...result, changes: count() - before } };
      },
    };
    return p;
  };
  const db = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const p of statements) results.push(await p.run());
        sql.exec("COMMIT");
        return results;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  const files = new Map<string, Uint8Array>();
  const bucket = {
    put: async (key: string, value: Uint8Array | ArrayBuffer) => {
      files.set(key, new Uint8Array(value instanceof Uint8Array ? value : new Uint8Array(value)));
    },
    delete: async (key: string) => files.delete(key),
    get: async (key: string) => {
      const bytes = files.get(key);
      return bytes
        ? {
            size: bytes.byteLength,
            arrayBuffer: async () => bytes.slice().buffer,
          }
        : null;
    },
  } as unknown as R2Bucket;
  Object.assign(bindings, { DB: db, SOURCE_FILES: bucket });
  return { sql, db, files };
}
export const initialDatabase = testDatabase();
