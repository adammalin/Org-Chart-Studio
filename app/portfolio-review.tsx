"use client";
import { useMemo, useState } from "react";
import type { ChartDocument } from "../lib/chart-library";
import {
  auditPortfolio,
  prioritizedReview,
  type ReviewCategory,
  type RelatedAppearance,
} from "../lib/portfolio-consistency";
function SourceLink({ value }: { value: string }) {
  const url = value.match(/^https:\/\/[^;\s]+/)?.[0];
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      Open source diagram
    </a>
  ) : (
    <span>{value || "No source location recorded"}</span>
  );
}
export function PortfolioReview({
  charts,
  onOpen,
}: {
  charts: ChartDocument[];
  onOpen: (
    chartId: string,
    nodeId?: string,
    view?: "canvas" | "review" | "library",
  ) => void;
}) {
  const [filter, setFilter] = useState<ReviewCategory | "all">("all"),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(30);
  const issues = useMemo(() => auditPortfolio(charts), [charts]),
    tasks = useMemo(() => prioritizedReview(charts), [charts]);
  const visible = tasks.filter(
    (t) =>
      (filter === "all" || t.category === filter) &&
      [t.title, t.chartName, t.detail].some((v) =>
        v.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  function appearance(a: RelatedAppearance) {
    return (
      <article
        key={a.chartId + ":" + a.nodeId}
        className="consistency-appearance"
      >
        <h4>{a.chartName}</h4>
        <p>
          <strong>{a.person || "Not specified"}</strong> ·{" "}
          {a.role || "Role not specified"}
        </p>
        <p>
          Organization: {a.organization}
          <br />
          Immediate parent: {a.parent ?? "Chart root — parent not shown"}
        </p>
        <p>
          Effective date: {a.effectiveDate || "Not supplied"} ·{" "}
          {a.certainty.replace("_", " ")}
        </p>
        <details>
          <summary>Source evidence and review note</summary>
          <p>{a.source}</p>
          <p>{a.reviewNote}</p>
          <SourceLink value={a.sourceLocator} />
        </details>
        <button
          className="button button--secondary"
          onClick={() => onOpen(a.chartId, a.nodeId, "review")}
        >
          Review this occurrence
        </button>
      </article>
    );
  }
  return (
    <section className="portfolio-review">
      <h1>Consistency and prioritized review</h1>
      <p>
        Related names are candidates for comparison. Confirm that they represent
        the same organization before making consistent changes; repeated
        positions and planned roles may be intentional.
      </p>
      <div className="workflow-metrics">
        <div>
          <strong>{issues.filter((i) => i.priority === "high").length}</strong>
          <span>High-priority disagreements</span>
        </div>
        <div>
          <strong>
            {tasks.filter((t) => t.category === "reporting").length}
          </strong>
          <span>Reporting lines to verify</span>
        </div>
        <div>
          <strong>{tasks.filter((t) => t.category === "dates").length}</strong>
          <span>Effective dates not documented</span>
        </div>
        <div>
          <strong>
            {tasks.filter((t) => t.category === "placement").length}
          </strong>
          <span>Uncertain tree placements</span>
        </div>
      </div>
      <div className="workflow-filters">
        <label>
          Review type
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as typeof filter);
              setLimit(30);
            }}
          >
            {[
              ["all", "All priorities"],
              ["conflicts", "Cross-chart disagreements"],
              ["reporting", "Reporting lines"],
              ["dates", "Missing effective dates"],
              ["source", "Source questions"],
              ["placement", "Tree placement"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label} (
                {value === "all"
                  ? tasks.length
                  : tasks.filter((t) => t.category === value).length}
                )
              </option>
            ))}
          </select>
        </label>
        <label>
          Find organization or question
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(30);
            }}
          />
        </label>
      </div>
      <div className="portfolio-task-list">
        {visible.slice(0, limit).map((t) => {
          const issue = issues.find((i) => i.id === t.id);
          return (
            <article
              key={t.id}
              className={"portfolio-task priority-" + t.priority}
            >
              <span className="eyebrow">
                {t.priority === 0
                  ? "High priority"
                  : t.category.replace("_", " ")}
              </span>
              <h2>{t.title}</h2>
              <p>{t.detail}</p>
              {issue ? (
                <div className="consistency-appearances">
                  {issue.appearances.map(appearance)}
                </div>
              ) : (
                <>
                  <p>
                    {t.chartName} · {t.source}
                  </p>
                  <SourceLink value={t.sourceLocator} />
                  <button
                    className="button button--secondary"
                    onClick={() =>
                      onOpen(
                        t.chartId,
                        t.nodeId,
                        t.category === "placement" ? "library" : "review",
                      )
                    }
                  >
                    {t.category === "placement"
                      ? "Choose tree placement"
                      : "Open this review"}
                  </button>
                </>
              )}
            </article>
          );
        })}
      </div>
      {!visible.length ? <p>No matching review items.</p> : null}
      {visible.length > limit ? (
        <button
          className="button button--secondary"
          onClick={() => setLimit((n) => n + 30)}
        >
          Show 30 more ({visible.length - limit} remaining)
        </button>
      ) : null}
    </section>
  );
}
