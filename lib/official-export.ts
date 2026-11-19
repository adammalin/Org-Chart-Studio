import {OFFICIAL_FONT_CSS,type OfficialCard,type ChartFonts} from './chart-appearance';
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function officialFontStyle(fonts?:ChartFonts|null){
  if(!fonts)return '';
  return `<style>${([['regular',400,'normal'],['bold',700,'normal'],['italic',400,'italic'],['boldItalic',700,'italic']] as const).filter(([key])=>fonts[key]).map(([key,weight,style])=>`@font-face{font-family:'OrgChart Century Gothic';font-weight:${weight};font-style:${style};src:url(data:font/ttf;base64,${fonts[key]})}`).join('')}</style>`;
}
export function officialCardSvg(card:OfficialCard,x:number,y:number,width:number,height:number,id:string) {
  return `<g data-unit-id="${escape(id)}"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${card.noFill?"none":"#"+card.fill}" stroke="${card.noBorder?"none":"#"+card.border}" stroke-width="${card.borderWidth}"/>${card.lines.map(l=>`<text x="${x+l.x}" y="${y+l.y}" text-anchor="${l.anchor??"middle"}" font-family="${escape(OFFICIAL_FONT_CSS)}" font-weight="${l.bold?700:400}" font-size="${l.size}"${l.textWidth!==undefined?` textLength="${l.textWidth}" lengthAdjust="spacingAndGlyphs"`:""} font-style="${l.italic?"italic":"normal"}" fill="#${l.color??"000000"}"${l.rotation?` transform="rotate(${l.rotation} ${x+l.x} ${y+l.y})"`:""}>${escape(l.text)}</text>`).join('')}</g>`;
}
