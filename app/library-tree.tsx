"use client";
import { useMemo, useState } from "react";
import type { ChartDocument } from "../lib/chart-library";
import { chartMatches, libraryPlacements } from "../lib/library-navigation";
export function LibraryTree({
  charts,
  query,
  onOpen,
  onPlace,
}: {
  charts: ChartDocument[];
  query: string;
  onOpen: (c: ChartDocument) => void;
  onPlace: (c: ChartDocument, parentId: string | null | undefined) => void;
}) {
  const placement = useMemo(() => libraryPlacements(charts), [charts]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sorted = [...charts].sort((a, b) => a.name.localeCompare(b.name));
  function visible(c: ChartDocument, seen = new Set<string>()): boolean {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return (
      chartMatches(c, query) ||
      sorted.some(
        (x) => placement.get(x.id)?.parentId === c.id && visible(x, seen),
      )
    );
  }
  function branch(c: ChartDocument, depth: number): React.ReactNode {
    const p = placement.get(c.id)!,
      children = sorted.filter(
        (x) => placement.get(x.id)?.parentId === c.id && visible(x),
      ),
      open = !!query || !collapsed.has(c.id);
    return (
      <li key={c.id}>
        <div className="library-tree-row" style={{ paddingLeft: depth * 18 }}>
          <button
            type="button"
            aria-label={`${open ? "Collapse" : "Expand"} ${c.name}`}
            aria-expanded={open}
            disabled={!children.length}
            onClick={() =>
              setCollapsed((old) => {
                const n = new Set(old);
                if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
                return n;
              })
            }
          >
            {children.length ? (open ? "▾" : "▸") : "·"}
          </button>
          <button
            type="button"
            className="library-tree-name"
            onClick={() => onOpen(c)}
          >
            <strong>{c.name}</strong>
            <small>
              {c.status.replace("_", " ")} · {c.nodes.length} cards
              {p.inferred
                ? " · suggested placement"
                : p.ambiguous
                  ? " · placement needs review"
                  : ""}
            </small>
          </button>
          <label>
            <span className="sr-only">Parent chart for {c.name}</span>
            <select
              aria-label={`Parent chart for ${c.name}`}
              value={
                c.libraryParentId === undefined
                  ? "auto"
                  : (c.libraryParentId ?? "")
              }
              onChange={(e) =>
                onPlace(
                  c,
                  e.target.value === "auto"
                    ? undefined
                    : e.target.value || null,
                )
              }
              disabled={c.status === "archived"}
            >
              <option value="auto">Automatic placement</option>
              <option value="">Top level / unassigned</option>
              {sorted
                .filter((x) => x.id !== c.id && x.status !== "archived")
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {open && children.length ? (
          <ul>{children.map((x) => branch(x, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }
  return (
    <div className="library-tree">
      <p>
        Suggested placement uses matching organizations in reporting diagrams.
        Corrections affect library navigation; reporting lines stay in their
        charts.
      </p>
      <ul>
        {sorted
          .filter((c) => !placement.get(c.id)?.parentId && visible(c))
          .map((c) => branch(c, 0))}
      </ul>
    </div>
  );
}
