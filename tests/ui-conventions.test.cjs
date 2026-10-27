const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,ready,memoGate,waitForReads,inspectorRows,inspect}=require('./helpers/ui-harness.cjs');

test('CSV shows current visible scope and busy native state, then truthful delivery',async()=>{
  const h=harness(),f=await ready(h,'Alpha.dbf',['Alpha','Beta'],true);
  f.pageSize=2;await h.api.readPage(f);f.rows[1].deleted=true;f.hiddenFields.add(0);
  h.api.refreshCsvActions();
  assert.match(h.node('#csvScope').textContent,/Alpha\.dbf.*page 1.*1 row.*1 column/i);
  const gate=memoGate(f);h.node('#outputFilename').value='My report';const job=h.api.downloadCsv();await waitForReads(gate);
  assert.equal(h.node('#downloadCsvButton').disabled,true);
  assert.equal(h.node('#downloadCsvButton').getAttribute('data-bk-state'),'busy');
  assert.match(h.node('#downloadCsvLabel').textContent,/preparing/i);
  assert.match(h.node('#csvStatus').textContent,/preparing/i);
  f.showDeleted=true;f.hiddenFields.clear();h.api.refreshCsvActions();
  assert.match(h.node('#csvScope').textContent,/1 row.*1 column/i,'pending export keeps its captured scope visible');
  await gate.pending[0].resolve();await job;
  assert.equal(h.downloads[0].name,'My report.csv');
  assert.equal(await h.downloads[0].blob.text(),'NOTE\r\nAlpha memo');
  assert.match(h.toasts.at(-1),/Download started.*My report\.csv.*page 1.*1 row/i);
  assert.equal(h.node('#downloadCsvButton').disabled,false);
  assert.match(h.node('#csvScope').textContent,/2 rows.*2 columns/i);
});

test('startup reads URL then shared then legacy then navigator list without preference writes',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(process.env.DBF_TEST_HTML||path.join(__dirname,'../src/index.template.html'),'utf8');
  const init=source.match(/const state = \{ files: \[\],[^\n]+/)[0];
  for(const [url,shared,legacy,languages,want] of [
    ['https://example.test/?lang=ja','en','en',['en'],'ja'],
    ['file:///viewer.html?lang=xx','en','ja',['ja'],'en'],
    ['file:///viewer.html',null,'ja',['en'],'ja'],
    ['file:///viewer.html',null,'invalid',['fr','ja-JP','en-US'],'ja'],
    ['file:///viewer.html',null,null,['fr'],'en']
  ]) {
    const writes=[],context=vm.createContext({URL,storageKey:'dbf-viewer:language',location:{href:url},navigator:{languages},localStorage:{getItem:key=>key==='browser-kitty:ui-language:v1'?shared:legacy,setItem:(...args)=>writes.push(args)}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../components/ui-conventions.js'),'utf8'),context);
    const language=vm.runInContext(init+';state.language',context);assert.equal(language,want);assert.equal(writes.length,0);
  }
});

test('language change translates retained validation and memo errors without rereading files',async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h),job=inspect(h,f,0);await waitForReads(gate);
  gate.pending[0].reject(new Error('Could not read this memo value.'));await job;
  h.state.language='ja';h.api.applyLanguage();assert.equal(h.node('#cellValue').textContent,'メモデータを読み取れませんでした。');
  assert.equal(h.state.activeCellText,'メモデータを読み取れませんでした。');assert.equal(gate.pending.length,1);
  assert.equal(h.api.localizedMessage('The DBF header length is invalid.'),'ヘッダー長が不正です。');
});

test('copy failure remains beside CSV actions with recovery while session stays ready',async()=>{
  const h=harness(),f=await ready(h);h.api.copyText=async()=>false;await h.api.copyCsv();
  assert.match(h.node('#csvStatus').textContent,/could not copy.*try again/i);
  assert.equal(h.node('#csvStatus').getAttribute('role'),'alert');
  assert.equal(h.node('#copyCsvButton').disabled,false);assert.equal(f.rows[0].cells[0].value,'Alpha');
});

test('language switch preserves pending memo ownership, edited filename, page and draft columns',async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h);f.sort={fieldIndex:0,direction:'desc'};h.state.mobilePage='data';
  h.node('#outputFilename').value='Uncommitted filename';h.node('#pageJump').value='7';h.node('#columnsDialog').open=true;
  let columnsRenders=0;h.api.renderColumnsDialog=()=>columnsRenders++;
  const job=inspect(h,f,0);await waitForReads(gate);const owner=h.state.activeCell,generation=h.state.generation;
  h.state.language='ja';h.api.applyLanguage();
  assert.equal(h.state.activeCell,owner);assert.equal(h.state.generation,generation);
  assert.equal(h.node('#cellValue').textContent,'メモを読み込み中…');
  assert.equal(h.node('#outputFilename').value,'Uncommitted filename');assert.equal(h.node('#pageJump').value,'7');
  assert.equal(h.state.mobilePage,'data');assert.equal(columnsRenders,0);
  await gate.pending[0].resolve();await job;assert.equal(h.node('#cellValue').textContent,'Alpha memo');
  assert.equal(h.node('#cellDialog').open,true);assert.equal(h.node('#copyCellButton').disabled,false);
});

test('explicit language writes only shared key, replaces existing query and reports storage failure',()=>{
  const h=harness(),writes=[],replacements=[];
  h.api.localStorage={getItem:()=>null,setItem:(k,v)=>writes.push([k,v])};
  h.api.location.href='https://example.test/viewer?lang=en&x=1';h.api.history={state:{a:1},replaceState:(...args)=>replacements.push(args)};
  assert.equal(typeof h.api.chooseAppLanguage,'function');h.api.chooseAppLanguage('ja');
  assert.equal(h.state.language,'ja');assert.deepEqual(writes,[['browser-kitty:ui-language:v1','ja']]);
  assert.match(replacements[0][2],/lang=ja/);assert.equal(replacements.length,1);
  h.api.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  h.api.chooseAppLanguage('en');assert.equal(h.state.language,'en');
  assert.equal(h.node('#languageStatus').textContent,'Language applies to this screen only');
});

test('session notice and disabled reason are visible without a source in each language',()=>{
  const h=harness();for(const language of ['en','ja']) {h.state.language=language;h.api.applyLanguage();
    assert.match(h.node('#sessionStatus').textContent,language==='en'?/tab closes/:/タブを閉じる/);
    assert.match(h.node('#csvStatus').textContent,language==='en'?/open a DBF/i:/DBF/);
    assert.equal(h.node('#downloadCsvButton').disabled,true);
  }
});

test('visible CSV notification follows language changes and keeps captured scope',async()=>{
  const h=harness(),f=await ready(h);h.node('#outputFilename').value='Scope';
  h.api.AppToast={show(){}};const vm=require('node:vm');vm.runInContext(h.extract('toast'),h.api);
  await h.api.downloadCsv();h.node('#appToast').classList.add('show');h.state.language='ja';h.api.applyLanguage();
  assert.match(h.node('#appToastMessage').textContent,/保存を開始しました.*Scope\.csv.*1.*1/);
});

test('invalid DBF validation translates in the fields and data empty states',()=>{
  const h=harness(),vm=require('node:vm');h.state.language='ja';
  const file={dbfFile:{name:'Invalid.dbf'},header:null,error:'The file is too small to contain a DBF header.'};
  for(const [fn,target] of [['renderFields','#fieldsTableWrap'],['renderDataTable','#dataTableWrap']]) {
    let child;h.node(target).replaceChildren=()=>{};h.node(target).append=value=>child=value;
    const render=vm.runInContext('('+h.extract(fn)+')',h.api);render(file);
    assert.match(child.textContent,/Invalid\.dbf.*DBFヘッダーとして小さすぎます。/);
  }
});

test('older same-source completion cannot clear newer CSV busy state',async()=>{
  const h=harness(),f=await ready(h,'Alpha.dbf',['Alpha'],true),gate=memoGate(f);
  const old=h.api.downloadCsv();await waitForReads(gate);const current=h.api.downloadCsv();await waitForReads(gate,2);
  await gate.pending[0].resolve();await old;
  assert.equal(h.downloads.length,0);assert.equal(h.node('#downloadCsvButton').getAttribute('data-bk-state'),'busy');
  await gate.pending[1].resolve();await current;assert.equal(h.downloads.length,1);
  assert.equal(h.node('#downloadCsvButton').getAttribute('data-bk-state'),'ready');
});

test('unparsed source explains pending CSV readiness before header parsing finishes',()=>{
  const h=harness(),file=h.api.buildFileState(new File([],'Incoming.dbf'));
  h.state.files.push(file);h.state.activeId=file.id;h.api.refreshCsvActions();
  assert.match(h.node('#csvStatus').textContent,/loading this page/i);
  file.error='invalid';h.api.refreshCsvActions();assert.match(h.node('#csvStatus').textContent,/open another DBF/i);
});
