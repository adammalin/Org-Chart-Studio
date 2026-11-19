/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Never accept a path or a font name from the renderer. Font files stay in the
// user's existing Office/OS installation and are never packaged with Studio.
function candidates(platform = process.platform, env = process.env) {
  if (platform === 'darwin') return [
    ['/Applications/Microsoft PowerPoint.app/Contents/Resources/DFonts/Century Gothic.ttf', '/Applications/Microsoft PowerPoint.app/Contents/Resources/DFonts/Century Gothic Bold.ttf'],
    ['/Library/Fonts/Century Gothic.ttf', '/Library/Fonts/Century Gothic Bold.ttf'],
    [path.join(os.homedir(),'Library/Fonts/Century Gothic.ttf'),path.join(os.homedir(),'Library/Fonts/Century Gothic Bold.ttf')],
  ];
  if (platform === 'win32') {
    const root = env.WINDIR || 'C:\\Windows';
    return [[path.win32.join(root,'Fonts','GOTHIC.TTF'),path.win32.join(root,'Fonts','GOTHICB.TTF')]];
  }
  return [];
}
function embeddingAllowed(bytes) {
  if (bytes.length < 12 || bytes.length > 5_000_000 || bytes.readUInt32BE(0) !== 0x00010000) return false;
  const count = bytes.readUInt16BE(4);
  if (12 + count * 16 > bytes.length) return false;
  for (let i=0;i<count;i++) {
    const record=12+i*16;
    if (bytes.toString('ascii',record,record+4) !== 'OS/2') continue;
    const offset=bytes.readUInt32BE(record+8),length=bytes.readUInt32BE(record+12);
    if (length < 10 || offset+length > bytes.length) return false;
    const restrictions=bytes.readUInt16BE(offset+8);
    // Restricted embedding, no subsetting, and bitmap-only fonts are not used.
    return !(restrictions & (0x0002|0x0100|0x0200));
  }
  return false;
}
function readChartFonts(options={}) {
  for (const pair of candidates(options.platform,options.env)) {
    try {
      const fonts=pair.map(file=>{
        const stat=fs.statSync(file);
        if (!stat.isFile() || stat.size>5_000_000) throw Error('Unavailable font');
        const bytes=fs.readFileSync(file);
        if (!embeddingAllowed(bytes)) throw Error('Unavailable font');
        return bytes.toString('base64');
      });
      return {family:'Century Gothic',regular:fonts[0],bold:fonts[1]};
    } catch { /* Try the next known installation location. */ }
  }
  return null;
}
module.exports={readChartFonts,embeddingAllowed,candidates};
