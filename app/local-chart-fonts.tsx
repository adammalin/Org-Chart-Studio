import {loadLocalChartFonts} from '../lib/chart-fonts';
export function LocalChartFonts({onLoaded,onNotice}:{onLoaded:()=>void;onNotice:(message:string)=>void}) {
  return <label className="local-chart-fonts">Load local chart fonts <input type="file" accept=".ttf" multiple aria-label="Local Century Gothic font files" onChange={async event=>{const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value='';if(!files.length)return;try{await loadLocalChartFonts(files);onLoaded();onNotice('Local chart fonts loaded for this session. Font files are not uploaded or stored in the library.');}catch(error){onNotice(error instanceof Error?error.message:'Could not load fonts.');}}}/></label>;
}
