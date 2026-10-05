const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

// Execute the production parser/state/export functions, with only DOM output and
// clipboard/download delivery stubbed. Fixtures are tiny, synthetic local files.
const source = fs.readFileSync(process.env.DBF_TEST_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');
const names = ['basename','extension','uniqueId','safeTextDecoder','decodeText','decodeAscii','isAllZero','parseDbfHeader','getActiveEncoding','parseMemoReference','parseFieldValue','readPage','readMemo','getActiveFile','buildFileState','activateFile','closeFile','visibleRows','renderDataLoading','renderPagination','resolveCellForCsv','csvEscape','buildCurrentCsv','normalizedFilenameBase','copyCsv','downloadCsv','pageContext','isCurrentPageContext','isPageReady','refreshCsvActions','createCsvSnapshot','isCsvSnapshotLive','isCsvSnapshotCurrent','buildCsv'];
function extract(name) {
  const match = new RegExp('^      (?:async )?function ' + name + '\\(', 'm').exec(source);
  if (!match) return ''; // New helpers are absent on the intentionally failing baseline.
  const start = match.index, rest = source.slice(start + match[0].length);
  const next = /\n      (?:async )?function |\n      const |\n      \/\//.exec(rest);
  return source.slice(start, next ? start + match[0].length + next.index : source.indexOf('\n      $(', start));
}
function harness() {
  const nodes = new Map(), downloads = [], copies = [], toasts = [], tables = [], blobs = new Map();
  const node = id => {
    if (!nodes.has(id)) { const classes = new Set(); nodes.set(id, {value:'',disabled:false,style:{},textContent:'',hidden:false,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,b)=>b?classes.add(c):classes.delete(c),contains:c=>classes.has(c)}}); }
    return nodes.get(id);
  };
  const state = {files:[],activeId:null,generation:0,language:'en'};
  const context = vm.createContext({state,TextDecoder,Uint8Array,DataView,Set,Map,Blob,Date,Math,Number,MAX_HEADER_BYTES:1024*1024,MAX_MEMO_BYTES:16*1024*1024,decoderCache:new Map(),asciiDecoder:new TextDecoder('windows-1252'),APP_CONFIG:{slug:'dbf-viewer'},$:node,t:(key,vars)=>vars ? key+':'+JSON.stringify(vars) : key,getAutoEncoding:()=> 'windows-1252',formatNumber:String,
    document:{body:{classList:{add(){},remove(){}}},createElement:()=>({click(){downloads.push({name:this.download,blob:blobs.get(this.href)});}})},
    URL:{createObjectURL:blob=>{const id='blob:'+blobs.size;blobs.set(id,blob);return id;},revokeObjectURL(){}},setTimeout(){},toast:x=>toasts.push(x),setBanner(){},renderFileStatus(){},renderFileManager(){},renderOverview(){},renderFields(){},renderColumnsDialog(){},
    renderDataTable:f=>tables.push({id:f.id,page:f.page,loading:f.loading,rows:f.rows.map(r=>r.cells[0].value)}),copyText:async text=>{copies.push(text);return true;}});
  vm.runInContext(names.map(extract).join('\n'),context);
  return {api:context,state,node,downloads,copies,toasts,tables};
}
function tinyDbf(name='Alpha.dbf', values=['Alpha','Beta'], memo=false) {
  const headerLength=memo?97:65, recordLength=memo?19:9;
  const bytes = Buffer.alloc(headerLength + values.length*recordLength + 1);
  bytes[0]=3;bytes[1]=126;bytes[2]=10;bytes[3]=5;bytes.writeUInt32LE(values.length,4);bytes.writeUInt16LE(headerLength,8);bytes.writeUInt16LE(recordLength,10);bytes[29]=3;
  bytes.write('NAME',32,'ascii');bytes[43]=67;bytes[48]=8;
  if(memo){bytes.write('NOTE',64,'ascii');bytes[75]=77;bytes[80]=10;}
  bytes[headerLength-1]=13;
  values.forEach((value,index)=>{const off=headerLength+index*recordLength;bytes.fill(32,off,off+recordLength);bytes.write(value,off+1,8,'ascii');if(memo)bytes.write('1'.padStart(10),off+9,10,'ascii');});
  bytes[bytes.length-1]=26;return new File([bytes],name);
}
async function ready(h,name='Alpha.dbf',values=['Alpha','Beta'],memo=false) {
  const native=tinyDbf(name,values,memo),header=await h.api.parseDbfHeader(native),file=h.api.buildFileState(native,header);file.pageSize=1;
  h.state.files.push(file);await h.api.activateFile(file.id);return file;
}
function gateFile(native) {
  const pending=[];return {pending,file:{name:native.name,size:native.size,slice(start,end){return {arrayBuffer(){return new Promise((resolve,reject)=>pending.push({resolve:async()=>resolve(await native.slice(start,end).arrayBuffer()),reject}));}};}}};
}
function memoGate(f,text='Alpha memo') {
  const bytes=Buffer.alloc(1024);bytes.write(text,512,'latin1');bytes[512+text.length]=26;bytes[513+text.length]=26;
  const gate=gateFile(new File([bytes],'Alpha.dbt'));f.memoFile=gate.file;f.memoKind='DBT';return gate;
}
async function waitForReads(gate,count=1) { for(let i=0;i<20 && gate.pending.length<count;i++) await new Promise(resolve=>setImmediate(resolve)); assert.equal(gate.pending.length,count,'memo read started'); }
function exportsDisabled(h) { assert.equal(h.node('#downloadCsvButton').disabled,true);assert.equal(h.node('#copyCsvButton').disabled,true); }

test('actual parser reads only current-page records from an 84-byte DBF',async()=>{
  const h=harness(),f=await ready(h);assert.equal(f.dbfFile.size,84);assert.equal(f.header.effectiveRecords,2);assert.equal(f.rows.length,1);assert.equal(await h.api.buildCurrentCsv(f),'NAME\r\nAlpha');f.page=2;await h.api.readPage(f);assert.equal(f.rows[0].recordNumber,2);assert.equal(await h.api.buildCurrentCsv(f),'NAME\r\nBeta');
});
test('pending page disables both CSV actions and rejects direct stale exports',async()=>{
  const h=harness(),f=await ready(h),gate=gateFile(f.dbfFile);f.dbfFile=gate.file;f.page=2;const job=h.api.readPage(f);
  exportsDisabled(h);assert.equal(f.rows.length,0);await assert.rejects(h.api.buildCurrentCsv(f));await h.api.downloadCsv();await h.api.copyCsv();assert.equal(h.downloads.length,0);assert.equal(h.copies.length,0);
  await gate.pending[0].resolve();await job;assert.equal(await h.api.buildCurrentCsv(f),'NAME\r\nBeta');assert.equal(h.node('#copyCsvButton').disabled,false);
});
test('obsolete success cannot clear newer loading or render older rows',async()=>{
  const h=harness(),f=await ready(h),gate=gateFile(f.dbfFile);f.dbfFile=gate.file;const old=h.api.readPage(f);f.page=2;const current=h.api.readPage(f);const renders=h.tables.length;
  await gate.pending[0].resolve();await old;assert.equal(f.loading,true);assert.equal(h.tables.length,renders);exportsDisabled(h);await gate.pending[1].resolve();await current;assert.equal(f.rows[0].cells[0].value,'Beta');
});
test('obsolete failure cannot erase a newer successful page or its ready state',async()=>{
  const h=harness(),f=await ready(h),gate=gateFile(f.dbfFile);f.dbfFile=gate.file;const old=h.api.readPage(f);f.page=2;const current=h.api.readPage(f);await gate.pending[1].resolve();await current;const renders=h.tables.length;gate.pending[0].reject(new Error('obsolete failure'));await old;
  assert.equal(f.rows[0]?.cells[0].value,'Beta');assert.equal(f.dataError,'');assert.equal(f.loading,false);assert.equal(h.tables.length,renders);assert.equal(await h.api.buildCurrentCsv(f),'NAME\r\nBeta');
});
test('memo download retains the edited Alpha filename and content after switching to Beta',async()=>{
  const h=harness(),b=await ready(h,'Beta.dbf'),a=await ready(h,'Alpha.dbf',['Alpha'],true),gate=memoGate(a);h.node('#outputFilename').value='Alpha-custom';const job=h.api.downloadCsv();await waitForReads(gate);await h.api.activateFile(b.id);const notices=h.toasts.length;await gate.pending[0].resolve();await job;
  assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].name,'Alpha-custom.csv');assert.equal(await h.downloads[0].blob.text(),'NAME,NOTE\r\nAlpha,Alpha memo');assert.equal(h.node('#outputFilename').value,'Beta-preview');assert.equal(h.toasts.length,notices);assert.deepEqual([...new Uint8Array(await h.downloads[0].blob.arrayBuffer())].slice(0,3),[239,187,191]);
});
test('current failure keeps exports unavailable; a retry recovers the requested page',async()=>{
  const h=harness(),f=await ready(h),gate=gateFile(f.dbfFile);f.dbfFile=gate.file;f.page=2;const bad=h.api.readPage(f);gate.pending[0].reject(new Error('temporary read failure'));await bad;assert.equal(f.dataError,'temporary read failure');assert.equal(f.loading,false);assert.equal(f.rows.length,0);exportsDisabled(h);await assert.rejects(h.api.buildCurrentCsv(f));
  const retry=h.api.readPage(f);assert.equal(f.dataError,'');await gate.pending[1].resolve();await retry;assert.equal(await h.api.buildCurrentCsv(f),'NAME\r\nBeta');assert.equal(h.node('#downloadCsvButton').disabled,false);
});
test('closed page request cannot change state or UI when it later rejects',async()=>{
  const h=harness(),f=await ready(h),gate=gateFile(f.dbfFile);f.dbfFile=gate.file;const job=h.api.readPage(f);h.api.closeFile(f.id);const before=JSON.stringify({loading:f.loading,rows:f.rows,error:f.dataError}),renders=h.tables.length;gate.pending[0].reject(new Error('closed failure'));await job;
  assert.equal(JSON.stringify({loading:f.loading,rows:f.rows,error:f.dataError}),before);assert.equal(h.tables.length,renders);exportsDisabled(h);await h.api.downloadCsv();assert.equal(h.downloads.length,0);
});
test('switching to an unparsed tab clears the previous loading indicator',async()=>{
  const h=harness(),a=await ready(h),gate=gateFile(a.dbfFile);a.dbfFile=gate.file;const job=h.api.readPage(a);const b=h.api.buildFileState(tinyDbf('Beta.dbf'));h.state.files.push(b);await h.api.activateFile(b.id);assert.equal(h.node('#dataLoading').classList.contains('show'),false);exportsDisabled(h);const renders=h.tables.length;await gate.pending[0].resolve();await job;assert.equal(h.tables.length,renders);
});
test('encoding changes reject the previous ready page until re-read',async()=>{
  const h=harness(),f=await ready(h);f.encodingMode='utf-8';await assert.rejects(h.api.buildCurrentCsv(f));await h.api.readPage(f);assert.equal(await h.api.buildCurrentCsv(f),'NAME\r\nAlpha');
});
test('zero-record and last-page row counts remain correct and header-only CSV is ready',async()=>{
  const h=harness(),empty=await ready(h,'Empty.dbf',[]);assert.equal(empty.rows.length,0);assert.equal(await h.api.buildCurrentCsv(empty),'NAME');assert.equal(h.node('#downloadCsvButton').disabled,false);h.api.renderPagination(empty);assert.match(h.node('#pageRangeLabel').textContent,/"start":"0","end":"0","total":"0"/);
  const f=await ready(h,'Three.dbf',['One','Two','Three']);f.pageSize=2;f.page=2;await h.api.readPage(f);assert.equal(f.rows.length,1);assert.equal(f.rows[0].recordNumber,3);assert.equal(await h.api.buildCurrentCsv(f),'NAME\r\nThree');
});
test('CSV snapshot preserves visible fields, row order, deletion flags, cells, memo source and encoding',async()=>{
  const h=harness(),f=await ready(h,'Alpha.dbf',['Zulu','Alpha'],true);f.pageSize=2;await h.api.readPage(f);f.rows[0].deleted=true;f.showDeleted=true;f.sort={fieldIndex:0,direction:'asc'};const gate=memoGate(f,'caf\xe9');const job=h.api.buildCurrentCsv(f);await waitForReads(gate);
  f.rows[1].cells[0].value='Changed';f.rows[0].deleted=false;f.hiddenFields.add(1);f.sort=null;f.showDeleted=false;f.encodingMode='utf-8';f.memoFile=new File([Buffer.alloc(1)],'Other.dbt');
  await gate.pending[0].resolve();await waitForReads(gate,2);await gate.pending[1].resolve();assert.equal(await job,'__deleted,NAME,NOTE\r\nfalse,Alpha,café\r\ntrue,Zulu,café');
});
test('ordinary copy honors hidden fields, deleted visibility, CSV quoting and CRLF',async()=>{
  const h=harness(),f=await ready(h,'Quotes.dbf',['A,"B','Hidden'],true);f.pageSize=2;await h.api.readPage(f);f.hiddenFields.add(1);f.rows[1].deleted=true;await h.api.copyCsv();assert.equal(h.copies[0],'NAME\r\n"A,""B"');assert.equal(h.toasts.at(-1),'csvCopied');
});
test('missing or failed memo retains the existing CSV reference fallback',async()=>{
  const h=harness(),f=await ready(h,'Alpha.dbf',['Alpha'],true);const fallback=f.rows[0].cells[1].display;assert.equal(await h.api.buildCurrentCsv(f),'NAME,NOTE\r\nAlpha,'+h.api.csvEscape(fallback));const gate=memoGate(f),job=h.api.buildCurrentCsv(f);await waitForReads(gate);gate.pending[0].reject(new Error('bad memo'));assert.equal(await job,'NAME,NOTE\r\nAlpha,'+h.api.csvEscape(fallback));
});
test('closing a source cancels its pending CSV delivery and stale notifications',async()=>{
  const h=harness(),f=await ready(h,'Alpha.dbf',['Alpha'],true),gate=memoGate(f),job=h.api.downloadCsv();await waitForReads(gate);h.api.closeFile(f.id);const notices=h.toasts.length;await gate.pending[0].resolve();await job;assert.equal(h.downloads.length,0);assert.equal(h.toasts.length,notices);
});
test('newer CSV request supersedes an older memo export without a stale delivery',async()=>{
  const h=harness(),f=await ready(h,'Alpha.dbf',['Alpha'],true),gate=memoGate(f);h.node('#outputFilename').value='Older';const old=h.api.downloadCsv();await waitForReads(gate);h.node('#outputFilename').value='Newer';const current=h.api.downloadCsv();await waitForReads(gate,2);await gate.pending[1].resolve();await current;const notices=h.toasts.length;await gate.pending[0].resolve();await old;assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].name,'Newer.csv');assert.equal(h.toasts.length,notices);
});
test('closing during pending memo copy prevents clipboard delivery',async()=>{
  const h=harness(),f=await ready(h,'Alpha.dbf',['Alpha'],true),gate=memoGate(f),job=h.api.copyCsv();await waitForReads(gate);h.api.closeFile(f.id);await gate.pending[0].resolve();await job;assert.equal(h.copies.length,0);
});
test('copy completion after tab switch does not notify the newer page',async()=>{
  const h=harness(),b=await ready(h,'Beta.dbf'),a=await ready(h,'Alpha.dbf');let finish;h.api.copyText=()=>new Promise(resolve=>finish=resolve);const job=h.api.copyCsv();while(!finish)await new Promise(resolve=>setImmediate(resolve));await h.api.activateFile(b.id);const notices=h.toasts.length;finish(true);await job;assert.equal(h.toasts.length,notices);
});

test('closing during a rejected clipboard request must not start a fallback copy',async()=>{
  const h=harness(),f=await ready(h);let rejectClipboard, fallbackCopies=0;
  h.api.navigator={clipboard:{writeText:()=>new Promise((resolve,reject)=>rejectClipboard=reject)}};
  h.api.document.body.append=()=>{};h.api.document.createElement=()=>({style:{},select(){},remove(){}});h.api.document.execCommand=()=>{fallbackCopies+=1;return true;};
  vm.runInContext(extract('copyText'),h.api);
  const job=h.api.copyCsv();for(let i=0;i<20&&!rejectClipboard;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof rejectClipboard,'function');h.api.closeFile(f.id);rejectClipboard(new Error('clipboard declined'));await job;assert.equal(fallbackCopies,0);
});
test('ordinary copy still uses the legacy fallback when clipboard is unavailable',async()=>{
  const h=harness();let fallbackCopies=0;h.api.navigator={clipboard:{writeText:async()=>{throw new Error('unavailable');}}};h.api.document.body.append=()=>{};h.api.document.createElement=()=>({style:{},select(){},remove(){}});h.api.document.execCommand=()=>{fallbackCopies+=1;return true;};vm.runInContext(extract('copyText'),h.api);
  assert.equal(await h.api.copyText('cell value'),true);assert.equal(fallbackCopies,1);
});
test('FPT export retains its source and encoding across all three memo reads',async()=>{
  const h=harness(),f=await ready(h,'Fox.dbf',['Alpha'],true),bytes=Buffer.alloc(1024);bytes.writeUInt16BE(512,6);bytes.writeUInt32BE(1,512);bytes.writeUInt32BE(4,516);bytes.write('caf\xe9',520,'latin1');const gate=gateFile(new File([bytes],'Fox.fpt'));f.memoFile=gate.file;f.memoKind='FPT';const job=h.api.buildCurrentCsv(f);await waitForReads(gate);
  f.memoFile=new File([Buffer.alloc(1)],'Other.fpt');f.encodingMode='utf-8';await gate.pending[0].resolve();await waitForReads(gate,2);await gate.pending[1].resolve();await waitForReads(gate,3);await gate.pending[2].resolve();assert.equal(await job,'NAME,NOTE\r\nAlpha,café');
});
