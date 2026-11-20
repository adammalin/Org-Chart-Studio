import {z} from 'zod';
const text=z.string().max(10000),id=z.string().min(1).max(200);
const certainty=z.enum(['confirmed','inferred','needs_review']);
const unitFields=z.object({name:text,shortName:text,type:z.enum(['laboratory','directorate','division','section','group','team','program','office','project','other']),positionTitle:text,assignmentLabel:text,positionStatus:z.enum(['filled','acting','vacant','not_specified']),effectiveDate:text,publicationVisibility:z.enum(['internal','public']),source:text,sourceLocator:text,sourceCertainty:certainty,reviewNote:text,planningState:z.enum(['current','planned']),compactDisplay:z.enum(['auto','card','list','sidecar']),reportingPlacement:z.enum(['hierarchy','standalone'])}).partial().strict();
const relationshipFields=z.object({relationshipType:z.enum(['primary supervisory','secondary supervisory','source connection — authority unspecified']),source:text,sourceLocator:text,sourceCertainty:certainty,reviewNote:text}).partial().strict();
const supportFields=z.object({role:text,person:text,positionStatus:z.enum(['filled','acting','vacant','not_specified']),effectiveDate:text,publicationVisibility:z.enum(['internal','public']),source:text,sourceLocator:text,sourceCertainty:certainty,reviewNote:text}).partial().strict();
export const chartPatchSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('chart'),fields:z.object({name:text,description:text}).partial().strict()}).strict(),
 z.object({kind:z.literal('unit'),unitId:id,fields:unitFields}).strict(),
 z.object({kind:z.literal('relationship'),relationshipId:id,fields:relationshipFields}).strict(),
 z.object({kind:z.literal('support_entry'),panelId:id,entryId:id,fields:supportFields}).strict(),
]).refine(p=>Object.keys(p.fields).length>0,'A patch must change at least one field.');
export const chartPatchesSchema=z.array(chartPatchSchema).min(1).max(100);

export const operationId=z.string().regex(/^agent-[A-Za-z0-9-]{1,100}$/);
export const chartIdSchema=z.string().min(1).max(200);
export const sourceCheckInput=z.object({chartId:chartIdSchema,expectedVersion:z.number().int().positive(),expectedUpdatedAt:z.string().min(1).max(60),checkedBy:z.string().min(1).max(160),sourceUrl:z.string().url().max(2000),sourceLocator:z.string().min(1).max(2000),sourceRevision:z.string().max(300).optional(),result:z.enum(['matches','differences','unavailable']),scope:z.enum(['full_chart','hierarchy_only']),findings:z.string().min(1).max(5000)}).strict();
export const proposalInput=z.object({proposalId:z.string().min(1).max(200),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
