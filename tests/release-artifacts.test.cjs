const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const normalize = text => text.replace(/\r\n/g,'\n').replace(/"generatedAtUtc"\s*:\s*"[^"]+"/g,'"generatedAtUtc":"BUILD_TIME"');

test('generated release carries the current editable source',()=>{
  const template = text => normalize(text).replace(/const (APP_CONFIG|BUILD_MANIFEST|assetBundle) = [\s\S]*?;\n/g, 'const $1 = BUILD_VALUE;\n');
  assert.equal(template(read('dist/index.html')),template(read('src/index.template.html')));
});
test('root distribution matches the freshly generated readable release',()=>{
  assert.equal(normalize(read('dbf-viewer.html')),normalize(read('dist/index.html')));
});
test('self-extract release restores the readable release byte for byte',()=>{
  const wrapper=read('dist/index.self-extract.html');
  const payload=wrapper.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(zlib.gunzipSync(Buffer.from(payload,'base64')),fs.readFileSync(path.join(root,'dist/index.html')));
  assert.match(wrapper,/DecompressionStream/);
});
test('all inline release scripts parse and no new runtime dependency is introduced',()=>{
  for(const file of ['dist/index.html','dbf-viewer.html','dist/index.self-extract.html']) {
    const html=read(file);assert.match(html,/connect-src 'none'/);
    for(const [,attrs,script] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if(/type="(?:application\/json|application\/octet-stream)"/.test(attrs)) continue;
      new vm.Script(script,{filename:file});
    }
  }
  assert.deepEqual(JSON.parse(read('dependencies.json')).dependencies,[]);
});
