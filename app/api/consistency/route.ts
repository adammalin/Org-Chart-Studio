import { GET as getCharts } from "../charts/route";
import {
  auditPortfolio,
  prioritizedReview,
  relatedAppearances,
} from "../../../lib/portfolio-consistency";
export async function GET(request: Request) {
  const response = await getCharts(new Request("http://127.0.0.1/api/charts"));
  const { charts: availableCharts } =
    (await response.json()) as import("../../../lib/chart-library").ChartLibraryResponse;
  const url = new URL(request.url),
    scope = url.searchParams.getAll("scopeId");
  const charts = scope.length
    ? availableCharts.filter((c) => scope.includes(c.id))
    : availableCharts;
  const id = url.searchParams.get("chartId");
  const issues = auditPortfolio(charts).filter(
    (i) => !id || i.appearances.some((a) => a.chartId === id),
  );
  const tasks = prioritizedReview(charts).filter(
    (t) => !id || t.chartId === id,
  );
  return Response.json(
    {
      issues,
      tasks,
      related: [...relatedAppearances(charts)]
        .filter(
          ([, a]) => a.length > 1 && (!id || a.some((r) => r.chartId === id)),
        )
        .map(([key, appearances]) => ({ key, appearances })),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
