import test from "node:test";
import assert from "node:assert/strict";
import { createBlankChart } from "../lib/chart-library";
import { libraryPlacements, searchLibrary } from "../lib/library-navigation";
function org(id: string, name: string, children: string[] = []) {
  const c = createBlankChart(name, id);
  c.nodes[0].data.unit.name = name;
  c.nodes[0].data.unit.shortName = name;
  for (const name of children) {
    const n = structuredClone(c.nodes[0]);
    n.id = name;
    n.data.unit.id = name;
    n.data.unit.name = name;
    n.data.unit.shortName = name;
    c.nodes.push(n);
    c.edges.push({ id: "edge-" + name, source: c.nodes[0].id, target: name });
  }
  return c;
}
test("tree picks nearest containing organization and leaves ambiguous parents unassigned", () => {
  const lab = org("l", "Synthetic Lab", ["Research", "Physics"]),
    research = org("r", "Research", ["Physics"]),
    physics = org("p", "Physics");
  const p = libraryPlacements([lab, research, physics]);
  assert.equal(p.get("p")?.parentId, "r");
  assert.equal(p.get("r")?.parentId, "l");
  const duplicate = org("d", "Other Directorate", ["Physics"]);
  assert.equal(
    libraryPlacements([research, physics, duplicate]).get("p")?.ambiguous,
    true,
  );
});
test("manual placement survives inference and cycles cannot hide charts", () => {
  const a = org("a", "Alpha", ["Beta"]),
    b = org("b", "Beta");
  b.libraryParentId = null;
  assert.equal(libraryPlacements([a, b]).get("b")?.parentId, null);
  a.libraryParentId = "b";
  b.libraryParentId = "a";
  const p = libraryPlacements([a, b]);
  assert.ok([...p.values()].some((x) => x.parentId === null));
});
test("search finds names, organizations, roles and abbreviations across charts", () => {
  const a = org("a", "Synthetic Physics"),
    b = org("b", "Other Org");
  a.nodes[0].data.unit.assignmentLabel = "Zoë Example";
  a.nodes[0].data.unit.positionTitle = "Deputy Director";
  a.nodes[0].data.unit.shortName = "SP";
  assert.equal(searchLibrary([a, b], "zoe")[0].chartId, a.id);
  assert.equal(searchLibrary([a, b], "deputy")[0].nodeId, a.nodes[0].id);
  assert.equal(searchLibrary([a, b], "sp")[0].chartId, a.id);
  assert.equal(
    searchLibrary([a, b], "physics")[0].organization,
    "Synthetic Physics",
  );
});
