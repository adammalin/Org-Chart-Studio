import * as route0 from "./routes/edit-history/route";
import * as route1 from "./routes/preferences/route";
import * as route2 from "./routes/ai-proposals/route";
import * as route3 from "./routes/charts/route";
import * as route4 from "./routes/ai-activity/route";
import * as route5 from "./routes/consistency/route";
import * as route6 from "./routes/import-intakes/route";
import * as route7 from "./routes/source-extractions/route";
import * as route8 from "./routes/history/route";
import * as route9 from "./routes/history/answers/route";
import * as route10 from "./routes/mcp-control/route";
import * as route11 from "./routes/monthly-workspace/route";
import * as route12 from "./routes/backups/route";
import * as route13 from "./routes/ai-import-proposals/route";
import * as workspaceRoute from "./routes/workspace/route";
export type CommandPath = "/api/workspace" | "/api/edit-history" | "/api/preferences" | "/api/ai-proposals" | "/api/charts" | "/api/ai-activity" | "/api/consistency" | "/api/import-intakes" | "/api/source-extractions" | "/api/history" | "/api/history/answers" | "/api/mcp-control" | "/api/monthly-workspace" | "/api/backups" | "/api/ai-import-proposals";
type Handler = (request: Request) => Promise<Response>;
const commands: Record<string, { GET?: Handler; POST?: Handler }> = {
  "/api/workspace": workspaceRoute,
  "/api/edit-history": route0,
  "/api/preferences": route1,
  "/api/ai-proposals": route2,
  "/api/charts": route3,
  "/api/ai-activity": route4,
  "/api/consistency": route5,
  "/api/import-intakes": route6,
  "/api/source-extractions": route7,
  "/api/history": route8,
  "/api/history/answers": route9,
  "/api/mcp-control": route10,
  "/api/monthly-workspace": route11,
  "/api/backups": route12,
  "/api/ai-import-proposals": route13,
};
export async function dispatchCommand(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.origin !== "https://orgchart.local") return Response.json({error:"External commands are not allowed."},{status:403});
  const route = commands[url.pathname];
  if (!route) return Response.json({error:"Unknown application command."},{status:404});
  const handler = request.method === "GET" ? route.GET : request.method === "POST" ? route.POST : undefined;
  if (!handler) return Response.json({error:"Unsupported command method."},{status:405});
  return handler(request);
}
