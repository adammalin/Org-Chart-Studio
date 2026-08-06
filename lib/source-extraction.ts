import { strFromU8, unzipSync, unzlibSync } from "fflate";
import { extractFirstWorksheetMatrix } from "./import-org-chart-file";

const MAX_OFFICE_UNCOMPRESSED_BYTES = 40_000_000;
const MAX_TEXT_CHARACTERS = 180_000;
const MAX_RECORDS = 2_000;

export interface SourceExtractionInput {
  id: string;
  fileName: string;
  contentType: string;
  checksum: string;
  bytes: Uint8Array;
}

export interface SourceExtraction {
  id: string;
  fileName: string;
  contentType: string;
  checksum: string;
  kind: "powerpoint" | "word" | "spreadsheet" | "text" | "pdf" | "image" | "unsupported";
  truncated: boolean;
  warnings: string[];
  data: unknown;
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function attribute(attributes: string, name: string): string {
  return decodeXml(attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "");
}

function limitedText(value: string): { value: string; truncated: boolean } {
  if (value.length <= MAX_TEXT_CHARACTERS) return { value, truncated: false };
  return {
    value: `${value.slice(0, MAX_TEXT_CHARACTERS)}\n[Extraction truncated locally]`,
    truncated: true,
  };
}

function officeFiles(
  bytes: Uint8Array,
  include: (name: string) => boolean,
): Record<string, Uint8Array> {
  let expandedBytes = 0;
  return unzipSync(bytes, {
    filter(file) {
      expandedBytes += file.originalSize;
      if (expandedBytes > MAX_OFFICE_UNCOMPRESSED_BYTES) {
        throw new Error("The expanded source document exceeds the 40 MB extraction limit.");
      }
      return include(file.name);
    },
  });
}

function textRuns(xml: string, namespace = "a"): string[] {
  return [...xml.matchAll(new RegExp(`<${namespace}:t\\b[^>]*>([\\s\\S]*?)<\\/${namespace}:t>`, "g"))]
    .map((match) => decodeXml(match[1]))
    .filter((value) => value.trim());
}

function powerpointLines(xml: string): string[] {
  const lines: string[] = [];
  for (const paragraph of xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const parts = textRuns(paragraph[1]);
    const value = parts.join("").replace(/\s+/g, " ").trim();
    if (value) lines.push(value);
  }
  if (!lines.length) {
    const fallback = textRuns(xml).join(" ").replace(/\s+/g, " ").trim();
    if (fallback) lines.push(fallback);
  }
  return lines;
}

function transformGeometry(xml: string) {
  const xfrm = xml.match(/<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/)?.[1] ?? "";
  const off = xfrm.match(/<a:off\b([^>]*)\/?\s*>/)?.[1] ?? "";
  const ext = xfrm.match(/<a:ext\b([^>]*)\/?\s*>/)?.[1] ?? "";
  const number = (attributes: string, name: string) => {
    const value = attributes.match(new RegExp(`\\b${name}="(-?\\d+)"`))?.[1];
    return value === undefined ? null : Number(value);
  };
  return {
    x: number(off, "x"),
    y: number(off, "y"),
    width: number(ext, "cx"),
    height: number(ext, "cy"),
  };
}

function extractPowerPoint(bytes: Uint8Array) {
  const files = officeFiles(
    bytes,
    (name) => name === "ppt/presentation.xml" || /^ppt\/slides\/slide\d+\.xml$/.test(name),
  );
  const presentation = files["ppt/presentation.xml"]
    ? strFromU8(files["ppt/presentation.xml"])
    : "";
  const slideSizeAttributes = presentation.match(/<p:sldSz\b([^>]*)\/?\s*>/)?.[1] ?? "";
  const slideNames = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/slide(\d+)/)?.[1] ?? 0);
      const rightNumber = Number(right.match(/slide(\d+)/)?.[1] ?? 0);
      return leftNumber - rightNumber;
    });
  let recordCount = 0;
  let truncated = false;
  const slides = slideNames.map((name, slideIndex) => {
    const xml = strFromU8(files[name]);
    const shapes: unknown[] = [];
    const connectors: unknown[] = [];
    for (const shape of xml.matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)) {
      if (recordCount >= MAX_RECORDS) {
        truncated = true;
        break;
      }
      const properties = shape[0].match(/<p:cNvPr\b([^>]*)\/?\s*>/)?.[1] ?? "";
      const lines = powerpointLines(shape[0]);
      if (!lines.length) continue;
      shapes.push({
        id: attribute(properties, "id"),
        name: attribute(properties, "name"),
        lines,
        ...transformGeometry(shape[0]),
      });
      recordCount += 1;
    }
    for (const connector of xml.matchAll(/<p:cxnSp\b[^>]*>[\s\S]*?<\/p:cxnSp>/g)) {
      if (recordCount >= MAX_RECORDS) {
        truncated = true;
        break;
      }
      const properties = connector[0].match(/<p:cNvPr\b([^>]*)\/?\s*>/)?.[1] ?? "";
      const start = connector[0].match(/<a:stCxn\b([^>]*)\/?\s*>/)?.[1] ?? "";
      const end = connector[0].match(/<a:endCxn\b([^>]*)\/?\s*>/)?.[1] ?? "";
      connectors.push({
        id: attribute(properties, "id"),
        name: attribute(properties, "name"),
        startShapeId: attribute(start, "id") || null,
        startSite: attribute(start, "idx") || null,
        endShapeId: attribute(end, "id") || null,
        endSite: attribute(end, "idx") || null,
        ...transformGeometry(connector[0]),
      });
      recordCount += 1;
    }
    return { slide: slideIndex + 1, shapes, connectors };
  });
  return {
    data: {
      slideSize: {
        width: Number(attribute(slideSizeAttributes, "cx")) || null,
        height: Number(attribute(slideSizeAttributes, "cy")) || null,
      },
      slides,
    },
    truncated,
    warnings: truncated
      ? [`PowerPoint extraction stopped after ${MAX_RECORDS} shapes and connectors.`]
      : [],
  };
}

function extractWord(bytes: Uint8Array) {
  const files = officeFiles(bytes, (name) => name === "word/document.xml");
  const xml = files["word/document.xml"] ? strFromU8(files["word/document.xml"]) : "";
  const paragraphs = [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
    .map((match) => textRuns(match[1], "w").join("").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_RECORDS);
  const tables = [...xml.matchAll(/<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g)]
    .slice(0, MAX_RECORDS)
    .map((table) =>
      [...table[1].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)].map((row) =>
        [...row[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)].map((cell) =>
          textRuns(cell[1], "w").join(" ").replace(/\s+/g, " ").trim(),
        ),
      ),
    );
  const truncated = paragraphs.length >= MAX_RECORDS || tables.length >= MAX_RECORDS;
  return {
    data: { paragraphs, tables },
    truncated,
    warnings: truncated ? [`Word extraction stopped after ${MAX_RECORDS} records.`] : [],
  };
}

function bytesToBinary(bytes: Uint8Array): string {
  let result = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return result;
}

function binaryToBytes(value: string): Uint8Array {
  const result = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) result[index] = value.charCodeAt(index);
  return result;
}

function decodePdfLiteral(value: string): string {
  return value
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(Number.parseInt(octal, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\([()\\])/g, "$1");
}

function decodePdfHex(value: string): string {
  const normalized = value.replace(/\s+/g, "");
  const padded = normalized.length % 2 ? `${normalized}0` : normalized;
  const bytes = new Uint8Array(padded.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(padded.slice(index * 2, index * 2 + 2), 16);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    }
    return text;
  }
  return bytesToBinary(bytes);
}

function pdfTextOperators(value: string): string[] {
  const lines: string[] = [];
  const textBlocks = [...value.matchAll(/BT([\s\S]*?)ET/g)].map((match) => match[1]);
  for (const block of textBlocks) {
    const tokens: string[] = [];
    for (const match of block.matchAll(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g)) {
      const token = match[0];
      tokens.push(token.startsWith("(") ? decodePdfLiteral(token.slice(1, -1)) : decodePdfHex(token.slice(1, -1)));
    }
    const text = tokens.join(" ").replace(/[ \t]+/g, " ").trim();
    if (text) lines.push(text);
  }
  return lines;
}

function extractPdf(bytes: Uint8Array) {
  const binary = bytesToBinary(bytes);
  const candidates = [binary];
  for (const stream of binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const dictionary = binary.slice(Math.max(0, (stream.index ?? 0) - 600), stream.index ?? 0);
    if (!/\/FlateDecode\b/.test(dictionary)) {
      candidates.push(stream[1]);
      continue;
    }
    try {
      candidates.push(bytesToBinary(unzlibSync(binaryToBytes(stream[1]))));
    } catch {
      // A malformed or unsupported compressed stream is skipped without exposing raw bytes.
    }
  }
  const uniqueLines = [...new Set(candidates.flatMap(pdfTextOperators))];
  const limited = limitedText(uniqueLines.join("\n"));
  return {
    data: { text: limited.value, textBlockCount: uniqueLines.length },
    truncated: limited.truncated,
    warnings: uniqueLines.length
      ? limited.truncated
        ? ["PDF text extraction was truncated locally."]
        : []
      : ["No embedded PDF text was readable. Image-only or custom-font PDFs may need a cleared image attached separately for review."],
  };
}

export function extractSourceFile(input: SourceExtractionInput): SourceExtraction {
  const lowerName = input.fileName.toLowerCase();
  const base = {
    id: input.id,
    fileName: input.fileName,
    contentType: input.contentType,
    checksum: input.checksum,
  };
  if (lowerName.endsWith(".pptx")) {
    const result = extractPowerPoint(input.bytes);
    return { ...base, kind: "powerpoint", ...result };
  }
  if (lowerName.endsWith(".docx")) {
    const result = extractWord(input.bytes);
    return { ...base, kind: "word", ...result };
  }
  if (lowerName.endsWith(".xlsx")) {
    const worksheet = extractFirstWorksheetMatrix(input.bytes);
    const truncated = worksheet.rows.length > MAX_RECORDS;
    return {
      ...base,
      kind: "spreadsheet",
      truncated,
      warnings: truncated ? [`Excel extraction stopped after ${MAX_RECORDS} rows.`] : [],
      data: {
        worksheetName: worksheet.worksheetName,
        rows: worksheet.rows.slice(0, MAX_RECORDS),
      },
    };
  }
  if (lowerName.endsWith(".csv") || lowerName.endsWith(".json") || /^text\//.test(input.contentType)) {
    const decoded = new TextDecoder().decode(input.bytes);
    const limited = limitedText(decoded);
    return {
      ...base,
      kind: "text",
      truncated: limited.truncated,
      warnings: limited.truncated ? ["Text extraction was truncated locally."] : [],
      data: { text: limited.value, lineCount: decoded.split(/\r?\n/).length },
    };
  }
  if (lowerName.endsWith(".pdf")) {
    const result = extractPdf(input.bytes);
    return { ...base, kind: "pdf", ...result };
  }
  if (/\.(png|jpe?g)$/i.test(lowerName)) {
    return {
      ...base,
      kind: "image",
      truncated: false,
      warnings: ["The local extractor does not perform OCR. Attach a cleared image separately when visual interpretation is required."],
      data: { byteLength: input.bytes.byteLength },
    };
  }
  return {
    ...base,
    kind: "unsupported",
    truncated: false,
    warnings: ["This retained source type has no local structured extractor."],
    data: { byteLength: input.bytes.byteLength },
  };
}
