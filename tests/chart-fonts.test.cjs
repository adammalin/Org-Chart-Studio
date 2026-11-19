/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');const assert=require('node:assert/strict');
const {embeddingAllowed,candidates}=require('../electron/chart-fonts.cjs');
function font(flags=0){const b=Buffer.alloc(38);b.writeUInt32BE(0x00010000,0);b.writeUInt16BE(1,4);b.write('OS/2',12);b.writeUInt32BE(28,20);b.writeUInt32BE(10,24);b.writeUInt16BE(flags,36);return b;}
test('font loading rejects restricted, bitmap-only, non-subsettable and malformed fonts',()=>{
 assert.equal(embeddingAllowed(font()),true);assert.equal(embeddingAllowed(font(8)),true);
 for(const flags of [2,256,512])assert.equal(embeddingAllowed(font(flags)),false);
 assert.equal(embeddingAllowed(Buffer.alloc(5)),false);
 const broken=font();broken.writeUInt32BE(999999,20);assert.equal(embeddingAllowed(broken),false);
 assert.equal(candidates('linux').length,0);
 assert.deepEqual(candidates('win32',{WINDIR:'C:\\Windows'})[0],['C:\\Windows\\Fonts\\GOTHIC.TTF','C:\\Windows\\Fonts\\GOTHICB.TTF']);
});
