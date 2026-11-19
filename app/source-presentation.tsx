import { OfficialCardDrawing } from './official-card';
import type { SourcePresentation } from '../lib/source-presentation';
export function SourcePresentationDrawing({presentation}:{presentation:SourcePresentation}) {
  return <div className="source-presentation-drawing" style={{position:'absolute',left:0,top:0,zIndex:-1,pointerEvents:'none'}}>
    <svg aria-hidden="true" style={{position:'absolute',width:1,height:1,overflow:'visible'}}>{presentation.strokes.map((s,i)=><polyline key={i} points={s.points.map(p=>`${p.x},${p.y}`).join(' ')} stroke={`#${s.color}`} strokeWidth={s.width} strokeDasharray={s.dash?.join(' ')} fill="none"/>)}</svg>
    {presentation.annotations.map((a,i)=><div key={i} role="note" aria-label={`Source annotation: ${a.card.lines.map(l=>l.text).join(" ")}`} style={{position:'absolute',left:a.bounds.x,top:a.bounds.y,width:a.bounds.width,height:a.bounds.height}}><OfficialCardDrawing card={a.card} width={a.bounds.width} height={a.bounds.height}/></div>)}
  </div>;
}
