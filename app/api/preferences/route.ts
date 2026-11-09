import { ensureSchema, getBindings } from "../../../db";
export async function GET() {
  const { DB } = getBindings();
  await ensureSchema(DB);
  const row = await DB.prepare(
    "SELECT payload FROM app_settings WHERE key='library-view'",
  ).first<{ payload: string }>();
  return Response.json(
    { libraryView: row?.payload === "tree" ? "tree" : "flat" },
    { headers: { "cache-control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  const body = (await request.json()) as { libraryView?: string };
  if (body.libraryView !== "flat" && body.libraryView !== "tree")
    return Response.json(
      { error: "Choose Flat list or Organization tree." },
      { status: 422 },
    );
  const { DB } = getBindings();
  await ensureSchema(DB);
  await DB.prepare(
    "INSERT INTO app_settings(key,payload) VALUES('library-view',?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload",
  )
    .bind(body.libraryView)
    .run();
  return Response.json({ libraryView: body.libraryView });
}
