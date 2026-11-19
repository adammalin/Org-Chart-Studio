import { OFFICIAL_FONT_CSS, type OfficialCard, type OfficialTextLine } from '../lib/chart-appearance';
export function OfficialCardDrawing({card,width,height,onEntry}:{card:OfficialCard;width:number;height:number;onEntry?:(id:string)=>void}) {
  return <svg className="official-card-drawing" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden={card.lines.some(line=>line.entityId)?undefined:true}>
    <rect x={card.borderWidth/2} y={card.borderWidth/2} width={Math.max(0,width-card.borderWidth)} height={Math.max(0,height-card.borderWidth)} fill={`#${card.fill}`} stroke={`#${card.border}`} strokeWidth={card.borderWidth}/>
    {card.lines.filter(l=>!l.entityId).map((line,i)=><OfficialLine key={i} line={line}/>)}
    {[...new Set(card.lines.flatMap(l=>l.entityId?[l.entityId]:[]))].map(id=><g key={id} className="official-compact-entry nodrag" role="button" tabIndex={0} aria-label={`Open ${card.lines.filter(l=>l.entityId===id).map(l=>l.text).join(', ')}`} onClick={e=>{e.stopPropagation();onEntry?.(id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onEntry?.(id);}}}>
      {card.lines.filter(l=>l.entityId===id).map((line,i)=><OfficialLine key={i} line={line}/>)}
    </g>)}
  </svg>;
}

function OfficialLine({line}:{line:OfficialTextLine}) {return <text x={line.x} y={line.y} textAnchor="middle" fontFamily={OFFICIAL_FONT_CSS} fontSize={line.size} fontWeight={line.bold?700:400} fill="#000000">{line.text}</text>;}
