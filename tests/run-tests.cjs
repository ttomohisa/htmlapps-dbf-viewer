const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname,'..');
function run(file,env={}) {
  const result=spawnSync(process.execPath,['--test',path.join(__dirname,file)],{stdio:'inherit',env:{...process.env,...env}});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`${file} failed (${result.status})`);
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dbf-release-test-'));
try {
  run('release-artifacts.test.cjs');
  const payload=fs.readFileSync(path.join(root,'dist/index.self-extract.html'),'utf8').match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/)[1];
  const extracted=path.join(temp,'index.html');fs.writeFileSync(extracted,zlib.gunzipSync(Buffer.from(payload,'base64')));
  for(const variant of ['src/index.template.html','dist/index.html','dbf-viewer.html',extracted]) {
    console.log(`\nDBF page/export regression variant: ${variant===extracted?'self-extract payload':variant}`);
    run('page-export-state.test.cjs',{DBF_TEST_HTML:path.resolve(root,variant)});
    run('cell-inspector.test.cjs',{DBF_TEST_HTML:path.resolve(root,variant)});
  }
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
