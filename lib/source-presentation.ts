import type { OfficialCard } from './chart-appearance';
import type { ChartDocument } from './chart-library';
import type { OrganizationalUnit } from './org-chart';
import type { SourceBounds, SupportPanel } from './chart-supplements';

/** Safe drawing primitives captured from an original; no SVG markup or external URLs. */
export interface SourceStroke { points: {x:number;y:number}[]; color:string; width:number; dash?:number[]; }
export interface SourceCardPresentation { bounds:SourceBounds; contentKey:string; card:OfficialCard; }
export interface SourcePresentation {
  cards:Record<string,SourceCardPresentation>;
  panels:Record<string,SourceCardPresentation>;
  relationships:{id:string;source:string;target:string;type:string}[];
  strokes:SourceStroke[];
  annotations:{bounds:SourceBounds;card:OfficialCard}[];
}
export function unitPresentationKey(unit:OrganizationalUnit):string {
  return JSON.stringify([unit.name,unit.shortName,unit.type,unit.positionTitle,unit.assignmentLabel,unit.positionStatus,unit.publicationVisibility]);
}
export function panelPresentationKey(panel:SupportPanel):string {
  return JSON.stringify([panel.title,panel.kind,panel.publicationVisibility,panel.entries.map(e=>[e.id,e.role,e.person,e.positionStatus,e.publicationVisibility])]);
}
const near=(a:number,b:number)=>Math.abs(a-b)<0.1;
export function sourceCardPresentation(source:SourceCardPresentation|undefined,key:string,width:number,height:number):OfficialCard|undefined {
  return source&&source.contentKey===key&&near(source.bounds.width,width)&&near(source.bounds.height,height)?source.card:undefined;
}
/** A changed relationship, moved/resized card, panel or manual route disables the captured wire layer. */
export function sourcePresentationActive(chart:Pick<ChartDocument,'nodes'|'edges'|'supportPanels'|'sourceLayout'>):boolean {
  const source=chart.sourceLayout?.presentation;
  if(!source||Object.keys(source.cards).length!==chart.nodes.length||Object.keys(source.panels).length!==(chart.supportPanels??[]).length)return false;
  if(chart.nodes.some(n=>{const b=source.cards[n.id]?.bounds;return !b||source.cards[n.id].contentKey!==unitPresentationKey(n.data.unit)||!near(b.x,n.position.x)||!near(b.y,n.position.y)||!near(b.width,Number(n.style?.width))||!near(b.height,Number(n.style?.height));}))return false;
  if((chart.supportPanels??[]).some(p=>{const b=source.panels[p.id]?.bounds,g=p.geometry;return !b||!g||source.panels[p.id].contentKey!==panelPresentationKey(p)||!near(b.x,g.x)||!near(b.y,g.y)||!near(b.width,g.width)||!near(b.height,g.height);}))return false;
  const edges=new Map(chart.edges.map(e=>[e.id,e]));
  return edges.size===source.relationships.length&&source.relationships.every(r=>{const e=edges.get(r.id);return e&&e.source===r.source&&e.target===r.target&&(e.data?.relationshipType??'primary supervisory')===r.type&&!e.data?.manualRoute;});
}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid source presentation object.');return v as Record<string,unknown>;}
function num(v:unknown,min=-50000,max=50000){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid source presentation coordinate.');return v;}
function str(v:unknown,max=20000){if(typeof v!=='string'||v.length>max)throw Error('Invalid source presentation text.');return v;}
function rgb(v:unknown){const c=str(v,6);if(!/^[A-Fa-f0-9]{6}$/.test(c))throw Error('Invalid source presentation RGB color.');return c.toUpperCase();}
function bounds(v:unknown):SourceBounds {const b=object(v);return{x:num(b.x),y:num(b.y),width:num(b.width,.01),height:num(b.height,.01)};}
function card(v:unknown):OfficialCard {
  const c=object(v);if(!Array.isArray(c.lines)||c.lines.length>2000)throw Error('Too many source presentation lines.');
  return {fill:rgb(c.fill),border:rgb(c.border),borderWidth:num(c.borderWidth,0,100),...(c.noFill===true?{noFill:true}:{}),...(c.noBorder===true?{noBorder:true}:{}),lines:c.lines.map(raw=>{const l=object(raw);if(typeof l.bold!=='boolean')throw Error('Invalid source text weight.');if(l.anchor!==undefined&&!['start','middle','end'].includes(String(l.anchor)))throw Error('Invalid source text alignment.');return{text:str(l.text,10000),x:num(l.x),y:num(l.y),size:num(l.size,.1,1000),bold:l.bold,...(l.italic===true?{italic:true}:{}),...(l.anchor?{anchor:l.anchor as 'start'|'middle'|'end'}:{}),...(l.color?{color:rgb(l.color)}:{}),...(l.textWidth!==undefined?{textWidth:num(l.textWidth,0,50000)}:{}),...(l.rotation!==undefined?{rotation:num(l.rotation,-360,360)}:{})};})};
}
export function normalizeSourcePresentation(raw:unknown,nodeIds:Set<string>,panelIds:Set<string>,edgeIds:Set<string>):SourcePresentation {
  const p=object(raw);
  function cards(raw:unknown,ids:Set<string>){const entries=Object.entries(object(raw));if(entries.length>ids.size)throw Error('Too many source presentation cards.');return Object.fromEntries(entries.map(([id,raw])=>{if(!ids.has(id))throw Error('Source presentation references an unknown card.');const v=object(raw);return[id,{bounds:bounds(v.bounds),contentKey:str(v.contentKey,100000),card:card(v.card)}];}));}
  if(!Array.isArray(p.relationships)||p.relationships.length>edgeIds.size||!Array.isArray(p.strokes)||p.strokes.length>10000||!Array.isArray(p.annotations)||p.annotations.length>200)throw Error('Invalid source presentation size.');
  const seen=new Set<string>();
  return {cards:cards(p.cards,nodeIds),panels:cards(p.panels,panelIds),relationships:p.relationships.map(raw=>{const r=object(raw),id=str(r.id,200),source=str(r.source,200),target=str(r.target,200);if(seen.has(id)||!edgeIds.has(id)||!nodeIds.has(source)||!nodeIds.has(target))throw Error('Invalid source presentation relationship.');seen.add(id);return{id,source,target,type:str(r.type,100)};}),strokes:p.strokes.map(raw=>{const s=object(raw);if(!Array.isArray(s.points)||s.points.length<2||s.points.length>100)throw Error('Invalid source stroke.');const dash=s.dash;if(dash!==undefined&&(!Array.isArray(dash)||dash.length>8))throw Error('Invalid source stroke dash.');return{points:s.points.map(raw=>{const pt=object(raw);return{x:num(pt.x),y:num(pt.y)};}),color:rgb(s.color),width:num(s.width,.001,100),...(Array.isArray(dash)?{dash:dash.map(d=>num(d,.001,1000))}:{})};}),annotations:p.annotations.map(raw=>{const a=object(raw);return{bounds:bounds(a.bounds),card:card(a.card)};})};
}
