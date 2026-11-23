import metrics from './official-font-metrics.json';
import type { OrganizationalUnit } from './org-chart';
export type ChartAppearance = 'official' | 'annotated';
export const OFFICIAL_FONT_FAMILY = 'Century Gothic';
export const OFFICIAL_FONT_CSS = '"OrgChart Century Gothic", "Century Gothic", "Aptos", Arial, sans-serif';
export const OFFICIAL_COLORS = {ink:'000000',border:'595959',white:'FFFFFF',division:'D2E4BB',team:'FAEEDA',support:'D9D9D9'} as const;
export interface OfficialTextLine {text:string; x:number; y:number; size:number; bold:boolean;italic?:boolean;anchor?:"start"|"middle"|"end";color?:string;rotation?:number;textWidth?:number;entityId?:string;}
export interface OfficialCard {fill:string;border:string;borderWidth:number;noFill?:boolean;noBorder?:boolean;lines:OfficialTextLine[];}
export interface ChartFonts {family:string;regular:string;bold:string;italic?:string;boldItalic?:string;}
export function officialTextWidth(text:string,size:number,bold=false) {
  const table:Record<string,number>=bold?metrics.bold:metrics.regular;
  return Array.from(text).reduce((n,c)=>n+(table[c]??table[c.normalize('NFD')[0]]??.6)*size,0);
}
export function officialWrap(text:string,width:number,size:number,bold=false):string[] {
  const output:string[]=[];
  for(const paragraph of text.split(/\r?\n/)) {
    let line='';
    for(const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if(officialTextWidth(word,size,bold)>width) {
        if(line)output.push(line);line='';
        for(const char of word) {if(line&&officialTextWidth(line+char,size,bold)>width){output.push(line);line='';}line+=char;}
      } else if(line&&officialTextWidth(line+' '+word,size,bold)>width){output.push(line);line=word;}
      else line=line?line+' '+word:word;
    }
    if(line)output.push(line);
  }
  return output;
}
const clean=(s:string)=>s.replace(/\\?\*+/g,'').replace(/[ \t]+/g,' ').trim();
const hasActingQualifier=(value:string)=>/\b(?:interim|acting)\b/i.test(value);
export function officialAssignment(unit:Pick<OrganizationalUnit,'assignmentLabel'|'positionStatus'> & Partial<Pick<OrganizationalUnit,'positionTitle'>>) {
  const assignment=clean(unit.assignmentLabel).replace(/\s+·\s+/g,'\n');
  if(unit.positionStatus==='acting'&&!hasActingQualifier(unit.positionTitle??'')) return assignment ? hasActingQualifier(assignment)?assignment:`${assignment}, Interim` : 'Interim';
  if(unit.positionStatus==='vacant')return assignment||'Vacant';
  return assignment;
}
export function officialScale(sourceWidth:number|undefined,width:number) {
  return sourceWidth ? sourceWidth/960 : Math.max(.65,Math.min(1.5,width/194));
}
export function officialCard(unit:OrganizationalUnit,width:number,height:number,level:number,scale:number, publicAudience=false,entries:{id:string;title:string;assignment:string}[]=[],sourceFill?:string):OfficialCard {
  const title=clean(unit.shortName||unit.name);
  const role=clean(unit.positionTitle);
  const assignment=publicAudience ? (unit.positionStatus==='vacant'?'Vacant':unit.positionStatus==='acting'&&!hasActingQualifier(role)?'Interim':'') : officialAssignment(unit);
  const showRole=role&&!/assignment shown in source/i.test(role)&&role.toLowerCase()!==title.toLowerCase()&&!assignment.toLowerCase().includes(role.toLowerCase());
  const root=level===1;
  const bodySize=unit.type==='division'?12.24:unit.type==='section'?12:['group','team'].includes(unit.type)?10.5:10.8;
  const blocks=[{text:title,size:(root?(unit.type==='division'?14.28:18):bodySize)*scale,bold:true},
    ...(showRole?[{text:role,size:10.8*scale,bold:false}]:[]),
    ...assignment.split(/\r?\n/).filter(Boolean).map((text,i)=>({text,size:(root?(unit.type==='division'?14.28:[15.84,12.96,10.08][Math.min(i,2)]):bodySize)*scale,bold:false})),
    ...entries.flatMap(e=>[{text:e.title,size:10.8*scale,bold:true,entityId:e.id},{text:e.assignment,size:10.8*scale,bold:false,entityId:e.id}])];
  return layoutOfficialBlocks(blocks,width,height,scale,
    sourceFill && /^[0-9a-f]{6}$/i.test(sourceFill) ? sourceFill.toUpperCase() : root?OFFICIAL_COLORS.white:unit.type==='division'?OFFICIAL_COLORS.division:['group','team'].includes(unit.type)?OFFICIAL_COLORS.team:OFFICIAL_COLORS.white);
}
export function layoutOfficialBlocks(blocks:{text:string;size:number;bold:boolean;entityId?:string}[],width:number,height:number,scale:number,fill:string):OfficialCard {
  const inset=7.2*scale;
  let lines:OfficialTextLine[]=[];
  for(let shrink=1;shrink>=.35;shrink-=.025) {
    lines=[];let top=0;
    for(const block of blocks) {
      const size=block.size*shrink;
      const wrapped=officialWrap(block.text,Math.max(8,width-inset*2),size,block.bold);
      for(const text of wrapped){lines.push({text,size,bold:block.bold,entityId:block.entityId,x:width/2,y:top+size*.95});top+=size*1.12;}
      if(wrapped.length) top+=2.4*scale*shrink;
    }
    const total=lines.length?top-2.4*scale*shrink:0;
    if(total<=height-inset*2 || shrink<=.375) {
      const offset=Math.max(inset,(height-total)/2);
      lines=lines.map(l=>({...l,y:l.y+offset}));break;
    }
  }
  return {fill,border:OFFICIAL_COLORS.border,borderWidth:.75*scale,lines};
}
export function officialSupport(title:string,entries:{role:string;person:string;positionStatus:OrganizationalUnit['positionStatus']}[],width:number,height:number,scale:number):OfficialCard {
  return layoutOfficialBlocks([{text:title,size:10.8*scale,bold:true},...entries.map(e=>({text:`${e.role}: ${officialAssignment({assignmentLabel:e.person,positionStatus:e.positionStatus,positionTitle:e.role})}`,size:9.36*scale,bold:false}))],width,height,scale,OFFICIAL_COLORS.support);
}
