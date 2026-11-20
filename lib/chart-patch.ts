import {z} from 'zod';
import type {ChartDocument} from './chart-library';
import {chartPatchSchema,chartPatchesSchema} from '../shared/agent-schemas.mjs';
export {chartPatchSchema,chartPatchesSchema};
export type ChartPatch=z.infer<typeof chartPatchSchema>;
/** Field edits preserve identifiers, membership, saved geometry and approval history. */
export function applyChartPatches(current:ChartDocument,input:unknown):ChartDocument{
 const patches=chartPatchesSchema.parse(input),next=structuredClone(current);
 const seen=new Set<string>();
 for(const patch of patches){
  let target:Record<string,unknown>|undefined;
  let key='chart';
  if(patch.kind==='chart')target=next as unknown as Record<string,unknown>;
  if(patch.kind==='unit'){target=next.nodes.find(n=>n.id===patch.unitId)?.data.unit as unknown as Record<string,unknown>;key='unit:'+patch.unitId;}
  if(patch.kind==='relationship'){const edge=next.edges.find(e=>e.id===patch.relationshipId);if(edge)target=edge.data??(edge.data={});key='relationship:'+patch.relationshipId;}
  if(patch.kind==='support_entry'){target=next.supportPanels?.find(p=>p.id===patch.panelId)?.entries.find(e=>e.id===patch.entryId) as unknown as Record<string,unknown>;key='support:'+patch.panelId+':'+patch.entryId;}
  if(!target)throw Error('The patch target does not exist: '+key);
  for(const field of Object.keys(patch.fields)){const k=key+':'+field;if(seen.has(k))throw Error('Duplicate field edit: '+k);seen.add(k);}
  Object.assign(target,patch.fields);
 }
 return next;
}
