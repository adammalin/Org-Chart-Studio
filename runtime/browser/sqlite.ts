import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import { schemaStatements } from "../../db/schema";

export type StoredSource = { key: string; bytes: Uint8Array };
export type EngineSnapshot = { database: Uint8Array; sources: StoredSource[] };
let engine: Promise<SqlJsStatic> | undefined;
export function loadSqlite(locateFile?: (file: string) => string) {
  return engine ??= initSqlJs({ useOldExtensionFunctions: false, ...(locateFile ? { locateFile } : {}) });
}

// The same SQLite schema, triggers and guarded batches run on both platforms.
// Browser persistence commits the complete SQL snapshot and changed source blobs
// together. No SQLite binary supplied by a user is ever opened as a library file.
export class BrowserDatabase {
  sql: Database;
  private exported:Uint8Array|undefined;
  private exportedCount=-1;
  readonly files = new Map<string, Uint8Array>();
  readonly changedFiles = new Set<string>();
  readonly db: D1Database;
  readonly bucket: R2Bucket;
  constructor(readonly SQLite: SqlJsStatic, snapshot?: EngineSnapshot) {
    this.sql = new SQLite.Database(snapshot?.database);
    for (const source of snapshot?.sources ?? []) this.files.set(source.key, source.bytes);
    for (const statement of schemaStatements) this.sql.run(statement);
    this.sql.run("PRAGMA foreign_keys=ON");
    const prepare = (query: string) => {
      let values: SqlValue[] = [];
      const rows = () => {
        const statement = this.sql.prepare(query);
        try {
          statement.bind(values);
          const result: Record<string, SqlValue>[] = [];
          while (statement.step()) result.push(statement.getAsObject());
          return result;
        } finally { statement.free(); }
      };
      const p = {
        bind: (...args: SqlValue[]) => { values = args; return p; },
        first: async (column?: string) => { const row = rows()[0]; return row ? column ? row[column] : row : null; },
        all: async () => ({ results: rows(), success: true }),
        run: async () => {
          const before = this.changeCount(); const results = rows();
          return { results, success: true, meta: { changes: this.changeCount() - before } };
        },
      };
      return p;
    };
    this.db = {
      prepare,
      batch: async (statements: ReturnType<typeof prepare>[]) => {
        this.sql.run("BEGIN IMMEDIATE");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          this.sql.run("COMMIT"); return results;
        } catch (error) { this.sql.run("ROLLBACK"); throw error; }
      },
    } as unknown as D1Database;
    this.bucket = {
      put: async (key: string, value: Uint8Array | ArrayBuffer) => {
        this.files.set(key, new Uint8Array(value).slice()); this.changedFiles.add(key);
      },
      delete: async (key: string | string[]) => {
        for (const k of Array.isArray(key) ? key : [key]) { this.files.delete(k); this.changedFiles.add(k); }
      },
      get: async (key: string) => {
        const bytes = this.files.get(key);
        return bytes ? { size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer,
          body: new Blob([bytes.slice().buffer]).stream() } : null;
      },
    } as unknown as R2Bucket;
  }
  changeCount() { return Number(this.sql.exec("SELECT total_changes()")[0]?.values[0][0] ?? 0); }
  exportDatabase() {
    if(this.exported&&this.exportedCount===this.changeCount())return this.exported;
    const bytes = this.sql.export(); this.sql.run("PRAGMA foreign_keys=ON");
    this.exported=bytes;this.exportedCount=this.changeCount();return bytes;
  }
  snapshot(): EngineSnapshot {
    return { database: this.exportDatabase(), sources: [...this.files].map(([key, bytes]) => ({ key, bytes })) };
  }
  restore(snapshot: EngineSnapshot) {
    this.sql.close(); this.sql = new this.SQLite.Database(snapshot.database); this.sql.run("PRAGMA foreign_keys=ON");
    this.files.clear(); for (const { key, bytes } of snapshot.sources) this.files.set(key, bytes);
    this.changedFiles.clear();this.exported=snapshot.database;this.exportedCount=this.changeCount();
  }
  close() { this.sql.close(); }
}
