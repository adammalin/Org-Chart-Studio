import { ensureSchema, getBindings } from "../../../db";
import type {
  ImportIntake,
  ImportIntakeFile,
  ImportIntakeStatus,
} from "../../../lib/import-intake";

const MAX_INTAKE_FILES = 10;
const MAX_INTAKE_FILE_BYTES = 20_000_000;
const MAX_INTAKE_BYTES = 25_000_000;

interface IntakeRow {
  id: string;
  name: string;
  status: ImportIntakeStatus;
  created_at: string;
  updated_at: string;
  chart_id: string | null;
}

interface IntakeFileRow {
  id: string;
  intake_id: string;
  file_name: string;
  content_type: string;
  file_size: number;
  checksum: string;
  storage_key: string;
  created_at: string;
}

function noStoreJson(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "private, no-store");
  return Response.json(value, { ...init, headers });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function intakeFileFromRow(row: IntakeFileRow): ImportIntakeFile {
  return {
    id: row.id,
    intakeId: row.intake_id,
    fileName: row.file_name,
    contentType: row.content_type,
    fileSize: row.file_size,
    checksum: row.checksum,
    storageKey: row.storage_key,
    createdAt: row.created_at,
  };
}

function intakeFromRow(row: IntakeRow, files: ImportIntakeFile[]): ImportIntake {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chartId: row.chart_id,
    files: files.filter((file) => file.intakeId === row.id),
  };
}

export async function GET() {
  const { DB } = getBindings();
  await ensureSchema(DB);
  const [intakes, files] = await Promise.all([
    DB.prepare("SELECT * FROM import_intakes ORDER BY updated_at DESC LIMIT 100").all<IntakeRow>(),
    DB.prepare("SELECT * FROM import_intake_files ORDER BY created_at").all<IntakeFileRow>(),
  ]);
  const mappedFiles = files.results.map(intakeFileFromRow);
  return noStoreJson({
    intakes: intakes.results.map((row) => intakeFromRow(row, mappedFiles)),
  });
}

export async function POST(request: Request) {
  const { DB, SOURCE_FILES } = getBindings();
  await ensureSchema(DB);

  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const formData = await request.formData();
    const name = String(formData.get("name") ?? "").trim();
    const files = formData
      .getAll("evidence")
      .filter((value): value is File => value instanceof File && value.size > 0);
    if (!name || name.length > 160) {
      return noStoreJson(
        { error: "Provide an intake name no longer than 160 characters." },
        { status: 400 },
      );
    }
    if (!files.length || files.length > MAX_INTAKE_FILES) {
      return noStoreJson(
        { error: `Choose between 1 and ${MAX_INTAKE_FILES} source-evidence files.` },
        { status: 400 },
      );
    }
    const unsupported = files.find(
      (file) => !/\.(pptx|docx|pdf|png|jpe?g)$/i.test(file.name),
    );
    if (unsupported) {
      return noStoreJson(
        { error: `Unsupported source-evidence file: ${unsupported.name}.` },
        { status: 415 },
      );
    }
    const oversized = files.find((file) => file.size > MAX_INTAKE_FILE_BYTES);
    if (oversized || files.reduce((total, file) => total + file.size, 0) > MAX_INTAKE_BYTES) {
      return noStoreJson(
        { error: "Source evidence exceeds the 20 MB per-file or 25 MB intake limit." },
        { status: 413 },
      );
    }

    const id = `intake-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const writtenKeys: string[] = [];
    const records: ImportIntakeFile[] = [];
    try {
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const checksum = await sha256Hex(bytes);
        const fileId = `intake-file-${crypto.randomUUID()}`;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const storageKey = `import-intakes/${id}/${fileId}-${safeName}`;
        await SOURCE_FILES.put(storageKey, bytes, {
          httpMetadata: { contentType: file.type || "application/octet-stream" },
          customMetadata: { intakeId: id, fileId, checksum },
        });
        writtenKeys.push(storageKey);
        records.push({
          id: fileId,
          intakeId: id,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size,
          checksum,
          storageKey,
          createdAt: now,
        });
      }
      await DB.batch([
        DB.prepare(
          `INSERT INTO import_intakes (id, name, status, created_at, updated_at)
           VALUES (?, ?, 'pending', ?, ?)`,
        ).bind(id, name, now, now),
        ...records.map((record) =>
          DB.prepare(
            `INSERT INTO import_intake_files
              (id, intake_id, file_name, content_type, file_size, checksum, storage_key, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            record.id,
            record.intakeId,
            record.fileName,
            record.contentType,
            record.fileSize,
            record.checksum,
            record.storageKey,
            record.createdAt,
          ),
        ),
      ]);
    } catch (error) {
      await Promise.all(writtenKeys.map((key) => SOURCE_FILES.delete(key)));
      throw error;
    }
    return noStoreJson(
      {
        intake: {
          id,
          name,
          status: "pending",
          createdAt: now,
          updatedAt: now,
          chartId: null,
          files: records,
        } satisfies ImportIntake,
      },
      { status: 201 },
    );
  }

  const body = (await request.json()) as { action?: "discard"; intakeId?: string };
  if (body.action !== "discard" || !body.intakeId) {
    return noStoreJson({ error: "Unsupported intake action." }, { status: 400 });
  }
  const intake = await DB.prepare(
    "SELECT id FROM import_intakes WHERE id = ? AND status = 'pending'",
  )
    .bind(body.intakeId)
    .first<{ id: string }>();
  if (!intake) {
    return noStoreJson(
      { error: "Only pending source-intake bundles can be discarded." },
      { status: 409 },
    );
  }
  const files = await DB.prepare(
    "SELECT * FROM import_intake_files WHERE intake_id = ?",
  )
    .bind(body.intakeId)
    .all<IntakeFileRow>();
  await Promise.all(files.results.map((file) => SOURCE_FILES.delete(file.storage_key)));
  await DB.batch([
    DB.prepare("DELETE FROM import_intake_files WHERE intake_id = ?").bind(body.intakeId),
    DB.prepare("DELETE FROM import_intakes WHERE id = ? AND status = 'pending'").bind(body.intakeId),
  ]);
  return noStoreJson({ discarded: body.intakeId });
}
