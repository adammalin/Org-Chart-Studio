import { OFFICIAL_FONT_CSS, type OfficialCard, type OfficialTextLine } from '../lib/chart-appearance';
export function OfficialCardDrawing({card,width,height,onEntry}:{card:OfficialCard;width:number;height:number;onEntry?:(id:string)=>void}) {
  return <svg className="official-card-drawing" style={card.noFill&&card.noBorder?{overflow:'visible'}:undefined} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden={card.lines.some(line=>line.entityId)?undefined:true}>
    <rect x={card.borderWidth/2} y={card.borderWidth/2} width={Math.max(0,width-card.borderWidth)} height={Math.max(0,height-card.borderWidth)} fill={card.noFill?"none":`#${card.fill}`} stroke={card.noBorder?"none":`#${card.border}`} strokeWidth={card.borderWidth}/>
    {card.lines.filter(l=>!l.entityId).map((line,i)=><OfficialLine key={i} line={line}/>)}
    {[...new Set(card.lines.flatMap(l=>l.entityId?[l.entityId]:[]))].map(id=><g key={id} className="official-compact-entry nodrag" role="button" tabIndex={0} aria-label={`Open ${card.lines.filter(l=>l.entityId===id).map(l=>l.text).join(', ')}`} onClick={e=>{e.stopPropagation();onEntry?.(id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onEntry?.(id);}}}>
      {card.lines.filter(l=>l.entityId===id).map((line,i)=><OfficialLine key={i} line={line}/>)}
    </g>)}
  </svg>;
}

function OfficialLine({line}:{line:OfficialTextLine}) {return <text x={line.x} y={line.y} textAnchor={line.anchor??"middle"} fontFamily={OFFICIAL_FONT_CSS} fontSize={line.size} textLength={line.textWidth} lengthAdjust={line.textWidth!==undefined?"spacingAndGlyphs":undefined} fontWeight={line.bold?700:400} fontStyle={line.italic?"italic":undefined} fill={`#${line.color??"000000"}`} transform={line.rotation?`rotate(${line.rotation} ${line.x} ${line.y})`:undefined}>{line.text}</text>;}
