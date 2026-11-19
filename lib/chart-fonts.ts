import type { ChartFonts } from './chart-appearance';
let loaded:Promise<ChartFonts|null>|undefined;
export function loadChartFonts():Promise<ChartFonts|null> {
  if(typeof window==='undefined')return Promise.resolve(null);
  return loaded??= (async()=>{
    try {
      const fonts=await window.orgChartDesktop?.getChartFonts();
      if(!fonts)return null;
      await Promise.all(([['regular','400'],['bold','700']] as const).map(async([key,weight])=>{
        const face=new FontFace('OrgChart Century Gothic',`url(data:font/ttf;base64,${fonts[key]})`,{weight,style:'normal'});
        document.fonts.add(await face.load());
      }));
      return fonts;
    } catch{return null;}
  })();
}
