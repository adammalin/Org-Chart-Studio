import { ensureSchema, getBindings } from "../../../db";
import {
  extractSourceFile,
  type SourceExtraction,
} from "../../../lib/source-extraction";

const MAX_FILES = 20;
const MAX_TOTAL_SOURCE_BYTES = 25_000_000;
const MAX_RESPONSE_BYTES = 2_500_000;

interface StoredSourceRow {
  id: string;
  file_name: string;
  content_type: string;
  file_size: number;
  checksum: string;
  storage_key: string;
}

interface IntakeRow {
  id: string;
  name: string;
  status: string;
}

interface ChartRow {
  id: string;
  name: string;
}

function noStoreJson(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { ...init, headers });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  const { DB, SOURCE_FILES } = getBindings();
  await ensureSchema(DB);
  const body = (await request.json()) as {
    scope?: "intake" | "chart";
    id?: string;
  };
  const id = body.id?.trim();
  if (!id || !body.scope) {
    return noStoreJson({ error: "Choose one retained source intake or chart." }, { status: 400 });
  }

  let subjectName = "";
  let files: StoredSourceRow[] = [];
  if (body.scope === "intake") {
    const [intake, result] = await Promise.all([
      DB.prepare("SELECT id, name, status FROM import_intakes WHERE id = ?")
        .bind(id)
        .first<IntakeRow>(),
      DB.prepare(
        `SELECT id, file_name, content_type, file_size, checksum, storage_key
         FROM import_intake_files WHERE intake_id = ? ORDER BY created_at`,
      )
        .bind(id)
        .all<StoredSourceRow>(),
    ]);
    if (!intake || intake.status !== "pending") {
      return noStoreJson(
        { error: "Only a pending retained source intake can be extracted by intake ID." },
        { status: 404 },
      );
    }
    subjectName = intake.name;
    files = result.results;
  } else if (body.scope === "chart") {
    const [chart, result] = await Promise.all([
      DB.prepare("SELECT id, name FROM charts WHERE id = ?").bind(id).first<ChartRow>(),
      DB.prepare(
        `SELECT id, file_name, content_type, file_size, checksum, storage_key
         FROM source_records WHERE chart_id = ? ORDER BY imported_at`,
      )
        .bind(id)
        .all<StoredSourceRow>(),
    ]);
    if (!chart) return noStoreJson({ error: "Chart not found." }, { status: 404 });
    subjectName = chart.name;
    files = result.results;
  } else {
    return noStoreJson({ error: "Unsupported retained-source scope." }, { status: 400 });
  }

  if (!files.length) {
    return noStoreJson({ error: "No retained source files are available for extraction." }, { status: 404 });
  }
  if (files.length > MAX_FILES || files.reduce((total, file) => total + file.file_size, 0) > MAX_TOTAL_SOURCE_BYTES) {
    return noStoreJson(
      { error: "The retained source bundle exceeds the local extraction safety limits." },
      { status: 413 },
    );
  }

  const extractions: SourceExtraction[] = [];
  for (const file of files) {
    const object = await SOURCE_FILES.get(file.storage_key);
    if (!object) {
      return noStoreJson(
        { error: `Stored source file ${file.file_name} is missing; no source content was returned.` },
        { status: 409 },
      );
    }
    const bytes = await object.arrayBuffer();
    const checksum = await sha256Hex(bytes);
    if (checksum !== file.checksum) {
      return noStoreJson(
        { error: `Stored source file ${file.file_name} failed its checksum check; no source content was returned.` },
        { status: 409 },
      );
    }
    try {
      extractions.push(
        extractSourceFile({
          id: file.id,
          fileName: file.file_name,
          contentType: file.content_type,
          checksum,
          bytes: new Uint8Array(bytes),
        }),
      );
    } catch (error) {
      extractions.push({
        id: file.id,
        fileName: file.file_name,
        contentType: file.content_type,
        checksum,
        kind: "unsupported",
        truncated: false,
        warnings: [
          error instanceof Error
            ? `Local extraction failed: ${error.message}`
            : "Local extraction failed for this retained source.",
        ],
        data: { byteLength: bytes.byteLength },
      });
    }
  }

  const response = {
    scope: body.scope,
    id,
    name: subjectName,
    extractedAt: new Date().toISOString(),
    notice:
      "Only locally extracted text, table cells, PowerPoint geometry, and connector metadata are included. Raw retained file bytes are not returned.",
    sourceChecksums: files.map((file) => file.checksum),
    extractions,
  };
  if (new TextEncoder().encode(JSON.stringify(response)).byteLength > MAX_RESPONSE_BYTES) {
    return noStoreJson(
      { error: "The extracted source response exceeds 2.5 MB. Split the source bundle before asking AI to read it." },
      { status: 413 },
    );
  }
  return noStoreJson(response);
}
