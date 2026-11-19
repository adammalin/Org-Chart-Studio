import {OFFICIAL_FONT_CSS,type OfficialCard,type ChartFonts} from './chart-appearance';
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function officialFontStyle(fonts?:ChartFonts|null){
  if(!fonts)return '';
  return `<style>@font-face{font-family:'OrgChart Century Gothic';font-weight:400;src:url(data:font/ttf;base64,${fonts.regular})}@font-face{font-family:'OrgChart Century Gothic';font-weight:700;src:url(data:font/ttf;base64,${fonts.bold})}</style>`;
}
export function officialCardSvg(card:OfficialCard,x:number,y:number,width:number,height:number,id:string) {
  return `<g data-unit-id="${escape(id)}"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#${card.fill}" stroke="#${card.border}" stroke-width="${card.borderWidth}"/>${card.lines.map(l=>`<text x="${x+l.x}" y="${y+l.y}" text-anchor="middle" font-family="${escape(OFFICIAL_FONT_CSS)}" font-weight="${l.bold?700:400}" font-size="${l.size}" fill="#000000">${escape(l.text)}</text>`).join('')}</g>`;
}
