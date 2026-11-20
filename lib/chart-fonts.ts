import type { ChartFonts } from './chart-appearance';
let loaded:Promise<ChartFonts|null>|undefined;
async function install(fonts:ChartFonts):Promise<ChartFonts> {
  const faces=await Promise.all(([['regular','400','normal'],['bold','700','normal'],['italic','400','italic'],['boldItalic','700','italic']] as const).flatMap(([key,weight,style])=>fonts[key]?[new FontFace('OrgChart Century Gothic',`url(data:font/ttf;base64,${fonts[key]})`,{weight,style}).load()]:[]));
  faces.forEach(face=>document.fonts.add(face));return fonts;
}
export function loadChartFonts():Promise<ChartFonts|null> {
  if(typeof window==='undefined')return Promise.resolve(null);
  return loaded??= (async()=>{try {const fonts=await window.orgChartDesktop?.getChartFonts();return fonts?await install(fonts):null;}catch{return null;}})();
}
/** Inspect the OpenType embedding flags before a user-selected font can enter an export. */
export function chartFontEmbeddingAllowed(bytes:Uint8Array):boolean {
  if(bytes.length<12||bytes.length>5_000_000)return false;
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(v.getUint32(0)!==0x00010000)return false;
  const count=v.getUint16(4);if(12+count*16>bytes.length)return false;
  for(let i=0;i<count;i++){const record=12+i*16;if(String.fromCharCode(...bytes.subarray(record,record+4))!=='OS/2')continue;const offset=v.getUint32(record+8),length=v.getUint32(record+12);return length>=10&&offset+length<=bytes.length&&!(v.getUint16(offset+8)&(0x0002|0x0100|0x0200));}return false;
}
export async function loadLocalChartFonts(files:File[]):Promise<ChartFonts> {
  if(files.length<2||files.length>4)throw Error('Choose the regular and bold Century Gothic TTF files, plus italic variants if available.');
  const fonts:ChartFonts={family:'Century Gothic',regular:'',bold:''};
  for(const file of files){if(file.size>5_000_000||!/\.ttf$/i.test(file.name)||!/(century\s*gothic|^gothic(?:b|i|bi)?\.)/i.test(file.name))throw Error('Choose Century Gothic TrueType files from your existing licensed installation.');const bytes=new Uint8Array(await file.arrayBuffer());if(!chartFontEmbeddingAllowed(bytes))throw Error('This font does not allow the embedding needed for chart export.');const italic=/italic|gothici\.|gothicbi\./i.test(file.name),bold=/bold|gothicb\.|gothicbi\./i.test(file.name),key=italic?(bold?'boldItalic':'italic'):(bold?'bold':'regular');if(fonts[key])throw Error('Choose one font file per weight/style.');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));fonts[key]=btoa(binary);}
  if(!fonts.regular||!fonts.bold)throw Error('Both regular and bold fonts are required.');const result=await install(fonts);loaded=Promise.resolve(result);return result;
}
