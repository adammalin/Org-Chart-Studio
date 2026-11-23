import assert from "node:assert/strict";
import test from "node:test";
import { createBlankChart } from "../lib/chart-library";
import {
  auditPortfolio,
  prioritizedReview,
  comparableAssignments,
  effectiveDateCoverage,
} from "../lib/portfolio-consistency";
function chart(id: string, person: string) {
  const c = createBlankChart("Synthetic Physics Division", id);
  c.nodes[0].data.unit.name = "Synthetic Physics Division";
  c.nodes[0].data.unit.assignmentLabel = person;
  c.nodes[0].data.unit.positionTitle = "Director";
  c.nodes[0].data.unit.sourceCertainty = "needs_review";
  c.nodes[0].data.unit.effectiveDate = "Not specified by site source";
  return c;
}
test("matching source-backed organization names reveal disagreements without choosing a winner", () => {
  const a = chart("a", "Synthetic Alice"),
    b = chart("b", "Synthetic Bob");
  const issues = auditPortfolio([a, b]);
  assert.equal(issues[0].category, "assignment");
  assert.equal(issues[0].appearances.length, 2);
  assert.equal(prioritizedReview([a, b])[0].priority, 0);
  assert.equal(a.nodes[0].data.unit.assignmentLabel, "Synthetic Alice");
  b.status = "archived";
  assert.equal(auditPortfolio([a, b]).length, 0);
});

function occurrence(id: string, organization: string, person: string, role: string, parent?: string) {
  const c = chart(id, person);
  const node = c.nodes[0];
  node.data.unit.name = organization;
  node.data.unit.positionTitle = role;
  node.data.unit.sourceCertainty = "confirmed";
  if (parent) {
    const p = structuredClone(node);
    p.id = id + "-parent";
    p.data.unit.id = p.id;
    p.data.unit.name = parent;
    p.data.unit.assignmentLabel = "Synthetic Parent";
    p.data.unit.positionTitle = "Assignment shown in source";
    c.nodes.unshift(p);
    c.edges.push({ id: id + "-edge", source: p.id, target: node.id });
  }
  return c;
}

test("additional source-listed staff do not become different directors", () => {
  const a = occurrence("a", "Synthetic Chemistry Division", "Example Alice, Director · Example Bob, Division Admin", "Director");
  const b = occurrence("b", "Synthetic Chemistry Division", "Example Alice", "Director", "Synthetic Science Directorate");
  const before = JSON.stringify([a, b]);
  assert.equal(auditPortfolio([a, b]).length, 0);
  assert.equal(JSON.stringify([a, b]), before);
});

test("abbreviations, affiliations, accents and inline multi-role labels compare consistently", () => {
  const a = occurrence("a", "Synthetic Science Directorate", "Zoë Example (ORNL), Associate Laboratory Director · Example Bob, Chief Operating Officer · Example Carol, Executive Assistant", "Associate Laboratory Director");
  const b = occurrence("b", "Synthetic Science", "Zoe Example Assoc Lab Director Example Bob, COO", "Assignment shown in source", "Synthetic Laboratory");
  assert.equal(auditPortfolio([a, b]).length, 0);
  assert.deepEqual(comparableAssignments("Example Alice, CHRO", "Assignment shown in source"), [{ person: "example alice", role: "chief human resources officer" }]);
});

test("a changed COO is retained even when the principal leader agrees", () => {
  const a = occurrence("a", "Synthetic Directorate", "Example Alice, Director · Example Bob, COO", "Director");
  const b = occurrence("b", "Synthetic Directorate", "Example Alice, Director · Example Carol, Chief Operating Officer", "Director");
  const issues = auditPortfolio([a, b]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].priority, "high");
  assert.match(issues[0].title, /chief operating officer/);
});

test("an additional operations director is a separate role from the principal director", () => {
  const a = occurrence("a", "Synthetic Business Directorate", "Example Alice, Director · Example Bob, Executive Assistant", "Director");
  const b = occurrence("b", "Synthetic Business", "Example Alice, Director · Example Carol, Operations Director", "Director", "Synthetic Laboratory");
  assert.equal(auditPortfolio([a, b]).length, 0);
  assert.deepEqual(comparableAssignments("Example Carol, Operations Director", "Director"), [{ person: "example carol", role: "operations director" }]);
});

test("deputy associate laboratory directors do not become additional principal leaders", () => {
  const a = occurrence("a", "Synthetic Security Directorate", "Example Alice, Associate Laboratory Director · Example Bob, Deputy Associate Laboratory Director · Example Carol, COO", "Associate Laboratory Director");
  const b = occurrence("b", "Synthetic Security", "Example Alice Assoc Lab Director · Example Carol, COO", "Assignment shown in source", "Synthetic Laboratory");
  assert.equal(auditPortfolio([a, b]).length, 0);
  assert.equal(comparableAssignments("Example Bob, Deputy Associate Laboratory Director", "Director")[0].role, "deputy associate laboratory director");
});

test("project function names cannot become formal division identity from a shared Director title", () => {
  const project = occurrence("p", "Synthetic Application Development", "Example Alice, Director · Example Bob, Deputy Director", "Assignment shown in source", "Synthetic Computing Project");
  const division = occurrence("d", "Synthetic Application Development Division", "Example Carol", "Director");
  const questions = auditPortfolio([project, division]);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].category, "identity");
  assert.equal(questions[0].priority, "medium");
});

test("an uncertain name alias retains a secondary-role difference even if the main leader agrees", () => {
  const a = occurrence("a", "Synthetic Directorate", "Example Alice, Director · Example Bob, COO", "Director");
  const b = occurrence("b", "Synthetic", "Example Alice, Director · Example Carol, COO", "Director", "Synthetic Laboratory");
  assert.equal(auditPortfolio([a, b])[0].category, "identity");
});

test("same group names beneath unrelated parents remain context questions", () => {
  const a = occurrence("a", "Synthetic Application Engineering Group", "Example Alice", "Group Leader", "Synthetic Computing Section");
  const b = occurrence("b", "Synthetic Application Engineering Group", "Example Bob", "Group Leader", "Synthetic Enrichment Section");
  const issues = auditPortfolio([a, b]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, "identity");
  assert.equal(issues[0].priority, "medium");
  assert.equal(prioritizedReview([a, b]).filter(t => t.category === "identity").length, 1);
});

test("support coverage and leadership with the same organization label are not high conflicts", () => {
  const a = occurrence("a", "Synthetic Science Directorate", "Example Alice", "Associate Laboratory Director");
  const b = occurrence("b", "Synthetic Science", "Example Bob", "Group Leader", "Synthetic Project Management Office");
  const issues = auditPortfolio([a, b]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].category, "identity");
  assert.equal(issues.some(i => i.priority === "high"), false);
});

test("unknown roles stay visible as questions without inventing a leadership role", () => {
  const a = occurrence("a", "Synthetic Services Division", "Example Alice", "Director");
  const b = occurrence("b", "Synthetic Services", "Example Bob", "Assignment shown in source", "Synthetic Directorate");
  const issue = auditPortfolio([a, b])[0];
  assert.equal(issue.category, "identity");
  assert.equal(issue.appearances[1].role, "Assignment shown in source");
});

test("unlabelled additional people do not inherit the principal leadership role", () => {
  const assignments = comparableAssignments("Example Alice, Director · Example Bob", "Director");
  assert.deepEqual(assignments, [{ person: "example alice", role: "director" }, { person: "example bob", role: "" }]);
});

test("a root-matched organization under different parents retains a reporting-source question", () => {
  const root = occurrence("r", "Synthetic Division", "Example Alice", "Director");
  const a = occurrence("a", "Synthetic Division", "Example Alice", "Director", "Synthetic Alpha Directorate");
  const b = occurrence("b", "Synthetic Division", "Example Alice", "Director", "Synthetic Beta Directorate");
  const issue = auditPortfolio([root, a, b]).find(i => i.category === "reporting")!;
  assert.equal(issue.priority, "medium");
  assert.deepEqual(issue.appearances.map(a => a.chartId), ["a", "b"]);
  assert.ok(prioritizedReview([root, a, b]).some(t => t.category === "reporting"));
});

test("different explicit unit levels cannot acquire high confidence by dropping suffixes", () => {
  const a = occurrence("a", "Synthetic Services Division", "Example Alice", "Director");
  const b = occurrence("b", "Synthetic Services Office", "Example Bob", "Director");
  assert.equal(auditPortfolio([a, b])[0].category, "identity");
});

test("matching parent and role still reveal real differences and preserve each spelling", () => {
  const a = occurrence("a", "Synthetic Contracts Division", "Example Cannell", "Director", "Synthetic Services Directorate");
  const b = occurrence("b", "Synthetic Contracts", "Example Cannella", "Director", "Synthetic Services Directorate");
  const issue = auditPortfolio([a, b])[0];
  assert.equal(issue.priority, "high");
  assert.deepEqual(issue.appearances.map(a => a.person), ["Example Cannell", "Example Cannella"]);
});

test("a role disagreement includes only comparable appearances", () => {
  const a = occurrence("a", "Synthetic Directorate", "Example Alice", "Director");
  const b = occurrence("b", "Synthetic Directorate", "Example Bob", "Director");
  const support = occurrence("s", "Synthetic Directorate", "Example Carol", "Group Leader", "Synthetic Support Office");
  const issue = auditPortfolio([a, b, support]).find(i => i.category === "assignment")!;
  assert.deepEqual(issue.appearances.map(a => a.chartId), ["a", "b"]);
});

test("acting qualifications and distinct roles for the same person remain reviewable", () => {
  const a = occurrence("a", "Synthetic Division", "Example Alice", "Director");
  const b = occurrence("b", "Synthetic Division", "Example Alice", "Director (Interim)");
  assert.equal(auditPortfolio([a, b])[0].category, "role");
  b.nodes[0].data.unit.positionTitle = "Deputy Director";
  assert.equal(auditPortfolio([a, b])[0].category, "role");
});

test("date coverage counts confirmed unknowns separately from source errors", () => {
  const a = occurrence("a", "Synthetic Division", "Example Alice", "Director");
  const b = occurrence("b", "Synthetic Other Division", "Example Bob", "Director");
  b.nodes[0].data.unit.effectiveDate = "2026-11-01";
  assert.equal(effectiveDateCoverage([a, b]).cards, 1);
  const tasks = prioritizedReview([a, b]);
  assert.equal(tasks.filter(t => t.category === "dates").length, 1);
  assert.match(tasks[0].detail, /source coverage gap, not a proven error/);
  assert.equal(tasks.some(t => t.category === "source"), false);
  a.nodes[0].data.unit.planningState = "planned";
  assert.equal(effectiveDateCoverage([a, b]).cards, 0);
  a.nodes[0].data.unit.planningState = "current";
  a.status = "archived";
  assert.equal(effectiveDateCoverage([a, b]).cards, 0);
});
test("planned records and deliberately repeated team leads are not treated as current leadership conflicts", () => {
  const a = chart("a", "Synthetic Alice"),
    b = chart("b", "Synthetic Bob");
  b.nodes[0].data.unit.planningState = "planned";
  assert.equal(auditPortfolio([a, b]).length, 0);
  b.nodes[0].data.unit.planningState = "current";
  for (const c of [a, b]) c.nodes[0].data.unit.name = "Group Team Leads";
  assert.equal(auditPortfolio([a, b]).length, 0);
});

test("reusable position titles compare within parent organizations, not across unrelated directorates", () => {
  function withPosition(id:string, parent:string, person:string) {
    const c=chart(id,"Synthetic director");
    c.nodes[0].data.unit.name=parent;
    const position=structuredClone(c.nodes[0]);
    position.id=id+"-admin";position.data.unit.id=position.id;
    position.data.unit.name="Administrative Services Manager";
    position.data.unit.positionTitle="Administrative Services Manager";
    position.data.unit.assignmentLabel=person;
    c.nodes.push(position);c.edges.push({id:id+"-edge",source:c.nodes[0].id,target:position.id});
    return c;
  }
  const a=withPosition("a","Synthetic Physics Directorate","Synthetic Alice");
  const b=withPosition("b","Synthetic Chemistry Directorate","Synthetic Bob");
  assert.equal(auditPortfolio([a,b]).length,0);
  b.nodes[0].data.unit.name="Synthetic Physics Directorate";
  const disagreements=auditPortfolio([a,b]);
  assert.equal(disagreements.length,1);
  assert.equal(disagreements[0].organization,"Administrative Services Manager");
  assert.equal(disagreements[0].category,"assignment");
});
