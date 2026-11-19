import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {strToU8,zipSync} from 'fflate';
import {extractSourceFile} from '../lib/source-extraction';
const source=(name:string,bytes:Uint8Array)=>({id:'synthetic',fileName:name,contentType:'application/octet-stream',checksum:'synthetic',bytes});
function pdf(stream:Uint8Array){return Buffer.concat([Buffer.from('%PDF-1.4\n<< /Filter /FlateDecode >>\nstream\n'),stream,Buffer.from('\nendstream\n%%EOF')]);}
test('PDF extraction reads compressed text, UTF16 hex and escaped literals',()=>{
 const bytes=pdf(deflateSync(Buffer.from('BT <FEFF00530079006E007400680065007400690063> Tj (Example\\040Leader) Tj ET')));
 const result=extractSourceFile(source('synthetic.pdf',bytes));
 assert.match((result.data as {text:string}).text,/Synthetic Example Leader/);assert.equal(result.truncated,false);
});
test('PDF decompression stops before retaining an oversized expanded stream',()=>{
 const compressed=deflateSync(Buffer.alloc(40_000_001,65));
 assert.throws(()=>extractSourceFile(source('expanded.pdf',pdf(compressed))),/40 MB extraction limit/);
});
test('Office archive expansion is bounded even when entries would be skipped',()=>{
 const archive=zipSync({'media/unused.bin':new Uint8Array(40_000_001)});
 assert.throws(()=>extractSourceFile(source('oversized.pptx',archive)),/40 MB extraction limit/);
});
test('source extraction handles numeric XML entities, malformed PDF streams and bounded plain text',()=>{
 const word=zipSync({'word/document.xml':strToU8('<w:document><w:p><w:r><w:t>Zo&#xEB; &amp; Ren&#233;e</w:t></w:r></w:p></w:document>')});
 assert.deepEqual((extractSourceFile(source('synthetic.docx',word)).data as {paragraphs:string[]}).paragraphs,['Zoë & Renée']);
 const bad=extractSourceFile(source('broken.pdf',pdf(new Uint8Array([1,2,3]))));assert.ok(bad.warnings.length);
 const large=extractSourceFile(source('large.json',strToU8('x'.repeat(180_001))));assert.equal(large.truncated,true);
 assert.equal(extractSourceFile(source('unsupported.bin',new Uint8Array([1]))).kind,'unsupported');
});
