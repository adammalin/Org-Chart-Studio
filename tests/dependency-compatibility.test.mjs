import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import React from 'react';
import satori from 'satori';

const require = createRequire(import.meta.url);
test('scoped archive parser update preserves synthetic SVG image rendering', async () => {
  const font = readFileSync(path.join(path.dirname(require.resolve('@vercel/og')), 'Geist-Regular.ttf'));
  const svg = await satori(React.createElement('div', {style:{display:'flex', background:'white', color:'black', fontSize:24}}, 'Synthetic compatibility check'), {width:320,height:100,fonts:[{name:'Geist',data:font,style:'normal',weight:400}]});
  assert.match(svg, /^<svg/);
  assert.match(svg, /width="320"/);
  assert.match(svg, /<path/);
});
