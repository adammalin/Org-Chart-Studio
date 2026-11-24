import assert from "node:assert/strict";
import test from "node:test";
import type { Edge } from "@xyflow/react";
import { buildOrthogonalEdgeRoutes, connectorRoutingPreference, manualEdgeRouteFromRoute, type EdgeRoutingNode } from "../lib/edge-routing";
import { createBlankChart } from "../lib/chart-library";
import { buildChartExportScene } from "../lib/chart-export";

const nodes: EdgeRoutingNode[] = [
  {id:"manager",x:390,y:40,width:340,height:150},
  {id:"graphics",x:40,y:320,width:340,height:150},
  {id:"editing",x:740,y:320,width:340,height:150},
];
const edges: Edge[] = [
  {id:"graphics-link",source:"manager",target:"graphics",data:{relationshipType:"primary supervisory"}},
  {id:"editing-link",source:"manager",target:"editing",data:{relationshipType:"primary supervisory"}},
];

test("default alignment removes the handoff chart's staggered branches without moving data", () => {
  const before=structuredClone({nodes,edges});
  const separate=buildOrthogonalEdgeRoutes(nodes,edges,"separate");
  assert.notEqual(separate.get(edges[0].id)!.points[1].y,separate.get(edges[1].id)!.points[1].y);
  const aligned=buildOrthogonalEdgeRoutes(nodes,edges);
  const left=aligned.get(edges[0].id)!,right=aligned.get(edges[1].id)!;
  assert.deepEqual(left.points[0],{x:560,y:190});
  assert.deepEqual(left.points[0],right.points[0]);
  assert.equal(left.points[1].y,right.points[1].y);
  assert.ok(left.points[1].y>190 && left.points[1].y<320);
  assert.equal(left.bundleKey,right.bundleKey);
  assert.deepEqual({nodes,edges},before);
});

test("automatic alignment keeps different rows and different relationship meanings separate", () => {
  const distant=nodes.map(n=>n.id==="editing"?{...n,y:500}:n);
  assert.ok([...buildOrthogonalEdgeRoutes(distant,edges).values()].every(r=>!r.bundleKey));
  for(const relationshipType of ["secondary supervisory","source connection — authority unspecified"]){
    const mixed=[edges[0],{...edges[1],data:{relationshipType}}];
    assert.ok([...buildOrthogonalEdgeRoutes(nodes,mixed).values()].every(r=>!r.bundleKey));
  }
});

test("automatic alignment does not move manual ports or captured source geometry", () => {
  const original=buildOrthogonalEdgeRoutes(nodes,edges,"separate");
  const manual=manualEdgeRouteFromRoute(original.get(edges[0].id)!)!;
  const pinned=[{...edges[0],data:{...edges[0].data,manualRoute:manual}},edges[1]];
  const pinnedBefore=buildOrthogonalEdgeRoutes(nodes,pinned,"separate");
  const pinnedAfter=buildOrthogonalEdgeRoutes(nodes,pinned,"auto");
  assert.deepEqual(pinnedAfter.get(edges[0].id)!.points,pinnedBefore.get(edges[0].id)!.points);
  assert.ok([...pinnedAfter.values()].every(r=>!r.bundleKey));
  const points=original.get(edges[0].id)!.points;
  const captured=[{...edges[0],data:{...edges[0].data,sourceRoute:{sourceBounds:nodes[0],targetBounds:nodes[1],points}}},edges[1]];
  const before=structuredClone(captured);
  assert.deepEqual(buildOrthogonalEdgeRoutes(nodes,captured).get(edges[0].id)!.points,points);
  assert.deepEqual(captured,before);
});

test("alignment still avoids unrelated cards in the shared branch area", () => {
  const obstacle={id:"unrelated",x:450,y:220,width:220,height:55};
  const routes=buildOrthogonalEdgeRoutes([...nodes,obstacle],edges);
  for(const route of routes.values())for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i];
    assert.ok(a.x===b.x || a.y===b.y);
    const intersects=a.x===b.x
      ? a.x>obstacle.x && a.x<obstacle.x+obstacle.width && Math.max(a.y,b.y)>obstacle.y && Math.min(a.y,b.y)<obstacle.y+obstacle.height
      : a.y>obstacle.y && a.y<obstacle.y+obstacle.height && Math.max(a.x,b.x)>obstacle.x && Math.min(a.x,b.x)<obstacle.x+obstacle.width;
    assert.equal(intersects,false);
  }
});

test("existing explicit routing choices survive the new automatic default", () => {
  assert.equal(connectorRoutingPreference(null),"auto");
  assert.equal(connectorRoutingPreference("auto"),"auto");
  assert.equal(connectorRoutingPreference("separate"),"separate");
  assert.equal(connectorRoutingPreference("combed"),"combed");
});

test("the shared export scene uses the same aligned branch as the canvas router", () => {
  const chart=createBlankChart("FAKE DEMO alignment export","fake-alignment");
  const template=chart.nodes[0];
  chart.nodes=nodes.map(n=>({...structuredClone(template),id:n.id,position:{x:n.x,y:n.y},style:{width:n.width,height:n.height},data:{...structuredClone(template.data),unit:{...structuredClone(template.data.unit),id:n.id,name:"FAKE DEMO "+n.id,assignmentLabel:"Casey Demo"}}}));
  chart.edges=structuredClone(edges);
  const before=structuredClone(chart);
  const scene=buildChartExportScene(chart,"internal","2026-11-24T15:00:00Z");
  assert.equal(scene.edges.length,2);
  assert.equal(scene.edges[0].points[1].y,scene.edges[1].points[1].y);
  assert.deepEqual(scene.edges[0].points[0],scene.edges[1].points[0]);
  const live=buildOrthogonalEdgeRoutes(scene.nodes.map(n=>({id:n.id,x:n.x,y:n.y,width:n.width,height:n.height,targetSide:n.targetSide})),chart.edges);
  for(const edge of scene.edges)assert.deepEqual(edge.points,live.get(edge.id)!.points);
  assert.deepEqual(chart,before);
});
