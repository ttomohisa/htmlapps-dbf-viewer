const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

// Execute the production parser/state/export functions, with only DOM output and
// clipboard/download delivery stubbed. Fixtures are tiny, synthetic local files.
const source = fs.readFileSync(process.env.DBF_TEST_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');
const names = ['closeCell','isCurrentCell','renderCellNavigation','navigateCell','copyCell','bindCellDialog','closeDialogOnBackdrop','bytesToHex','openCell','basename','extension','uniqueId','safeTextDecoder','decodeText','decodeAscii','isAllZero','parseDbfHeader','getActiveEncoding','parseMemoReference','parseFieldValue','readPage','readMemo','getActiveFile','buildFileState','activateFile','closeFile','visibleRows','renderDataLoading','renderPagination','resolveCellForCsv','csvEscape','buildCurrentCsv','normalizedFilenameBase','copyCsv','downloadCsv','pageContext','isCurrentPageContext','isPageReady','refreshCsvActions','createCsvSnapshot','isCsvSnapshotLive','isCsvSnapshotCurrent','buildCsv'];
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
    if (!nodes.has(id)) { const classes = new Set(), listeners = new Map(); nodes.set(id, {value:'',disabled:false,style:{},textContent:'',hidden:false,open:false,modalShows:0,showModal(){this.open=true;this.modalShows++;},close(){this.open=false;},addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);},async dispatch(type,event={}){for(const handler of listeners.get(type)||[])await handler(event);},getBoundingClientRect(){return {left:10,right:100,top:10,bottom:100};},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,b)=>b?classes.add(c):classes.delete(c),contains:c=>classes.has(c)}}); }
    return nodes.get(id);
  };
  const state = {files:[],activeId:null,generation:0,language:'en',activeCell:null,activeCellText:''};
  const context = vm.createContext({state,TextDecoder,Uint8Array,DataView,Set,Map,Blob,Date,Math,Number,MAX_HEADER_BYTES:1024*1024,MAX_MEMO_BYTES:16*1024*1024,decoderCache:new Map(),asciiDecoder:new TextDecoder('windows-1252'),APP_CONFIG:{slug:'dbf-viewer'},$:node,fieldTypeLabel:f=>f.type,t:(key,vars)=>vars ? key+':'+JSON.stringify(vars) : key,getAutoEncoding:()=> 'windows-1252',formatNumber:String,
    document:{body:{classList:{add(){},remove(){}}},createElement:()=>({click(){downloads.push({name:this.download,blob:blobs.get(this.href)});}})},
    URL:{createObjectURL:blob=>{const id='blob:'+blobs.size;blobs.set(id,blob);return id;},revokeObjectURL(){}},setTimeout(){},toast:x=>toasts.push(x),setBanner(){},renderFileStatus(){},renderFileManager(){},renderOverview(){},renderFields(){},renderColumnsDialog(){},
    renderDataTable:f=>tables.push({id:f.id,page:f.page,loading:f.loading,rows:f.rows.map(r=>r.cells[0].value)}),copyText:async text=>{copies.push(text);return true;}});
  vm.runInContext(names.map(extract).join('\n'),context);
  return {api:context,state,node,downloads,copies,toasts,tables,extract};
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


async function inspectorRows(h,values=['Alpha','Beta']) {
  const native=tinyDbf('Inspect.dbf',values,true),bytes=Buffer.from(await native.arrayBuffer());
  values.forEach((_,index)=>bytes.write(String(index+1).padStart(10),97+index*19+9,10,'ascii'));
  const dbf=new File([bytes],'Inspect.dbf'),header=await h.api.parseDbfHeader(dbf),f=h.api.buildFileState(dbf,header);
  h.state.files.push(f);await h.api.activateFile(f.id);
  const memo=Buffer.alloc(512*(values.length+1));values.forEach((value,index)=>{const text=value+' memo',start=512*(index+1);memo.write(text,start,'ascii');memo[start+text.length]=26;memo[start+text.length+1]=26;});
  const gate=gateFile(new File([memo],'Inspect.dbt'));f.memoFile=gate.file;f.memoKind='DBT';return {f,gate};
}
function inspect(h,f,rowIndex,fieldIndex=1) { return h.api.openCell(f,f.rows[rowIndex],f.header.fields[fieldIndex],f.rows[rowIndex].cells[fieldIndex]); }
function expectCell(h,record,field,value) { assert.equal(h.node('#cellRecord').textContent,String(record));assert.equal(h.node('#cellField').textContent,field);assert.equal(h.node('#cellValue').textContent,value);assert.equal(h.state.activeCellText,value); }
function installDialog(h) { assert.equal(typeof h.api.bindCellDialog,'function');h.api.bindCellDialog(); }
function navigate(h,delta) { assert.equal(typeof h.api.navigateCell,'function');return h.api.navigateCell(delta); }

for(const reject of [false,true]) test(`obsolete memo ${reject?'error':'success'} cannot overwrite a newer ordinary cell`,async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h),old=inspect(h,f,0);await waitForReads(gate);h.node('#cellDialog').close();await inspect(h,f,1,0);
  if(reject)gate.pending[0].reject(new Error('Old memo failure'));else await gate.pending[0].resolve();await old;
  expectCell(h,2,'NAME','Beta');
});
for(const reject of [false,true]) test(`obsolete memo ${reject?'error':'success'} cannot overwrite the reopened newer memo`,async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h),old=inspect(h,f,0);await waitForReads(gate);h.node('#cellDialog').close();const current=inspect(h,f,1);await waitForReads(gate,2);await gate.pending[1].resolve();await current;
  if(reject)gate.pending[0].reject(new Error('Old memo failure'));else await gate.pending[0].resolve();await old;expectCell(h,2,'NOTE','Beta memo');
});
test('current ordinary, empty and null values preserve value-copy behavior',async()=>{
  const h=harness(),{f}=await inspectorRows(h);await inspect(h,f,1,0);expectCell(h,2,'NAME','Beta');assert.equal(h.node('#copyCellButton').disabled,false);
  f.rows[1].cells[0].value='';await inspect(h,f,1,0);assert.equal(h.state.activeCellText,'');assert.equal(h.node('#cellValue').textContent,'');
  f.rows[1].cells[0].isNull=true;await inspect(h,f,1,0);assert.equal(h.node('#cellValue').textContent,'null');assert.equal(h.state.activeCellText,'');
});
test('copy stays disabled and has no previous text while current memo loads',async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h);await inspect(h,f,0,0);const current=inspect(h,f,1);await waitForReads(gate);
  assert.equal(h.node('#copyCellButton').disabled,true);assert.equal(h.state.activeCellText,'');assert.equal(typeof h.api.copyCell,'function');await h.api.copyCell();assert.equal(h.copies.length,0);
  await gate.pending[0].resolve();await current;expectCell(h,2,'NOTE','Beta memo');assert.equal(h.node('#copyCellButton').disabled,false);await h.api.copyCell();assert.equal(h.copies[0],'Beta memo');
});
test('current memo failure remains visible and copyable',async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h),job=inspect(h,f,0);await waitForReads(gate);gate.pending[0].reject(new Error('Current memo failure'));await job;expectCell(h,1,'NOTE','Current memo failure');assert.equal(h.node('#copyCellButton').disabled,false);
});
test('missing memo retains the actionable current error',async()=>{
  const h=harness(),{f}=await inspectorRows(h);f.memoFile=null;await inspect(h,f,0);expectCell(h,1,'NOTE','memoMissing');
});
test('record navigation follows visible sorted order in the same field without DBF reads',async()=>{
  const h=harness(),{f}=await inspectorRows(h,['Zulu','Alpha','Beta','Hidden']);f.rows[3].deleted=true;f.sort={fieldIndex:0,direction:'asc'};
  const pageGeneration=h.state.generation,csvGeneration=f.csvGeneration,dbf=f.dbfFile;let reads=0;const originalSlice=dbf.slice.bind(dbf);dbf.slice=(...args)=>{reads++;return originalSlice(...args);};
  await inspect(h,f,1,0);assert.equal(h.node('#prevCellButton').disabled,true);assert.equal(h.node('#nextCellButton').disabled,false);
  await navigate(h,-1);expectCell(h,2,'NAME','Alpha');await navigate(h,1);expectCell(h,3,'NAME','Beta');await navigate(h,1);expectCell(h,1,'NAME','Zulu');assert.equal(h.node('#nextCellButton').disabled,true);
  await navigate(h,1);expectCell(h,1,'NAME','Zulu');await navigate(h,-1);expectCell(h,3,'NAME','Beta');assert.equal(h.node('#cellDialog').modalShows,1);
  assert.equal(reads,0);assert.equal(h.state.generation,pageGeneration);assert.equal(f.csvGeneration,csvGeneration);assert.equal(f.page,1);
});
test('shown deleted rows participate in record navigation',async()=>{
  const h=harness(),{f}=await inspectorRows(h,['Zulu','Alpha','Beta']);f.rows[2].deleted=true;f.showDeleted=true;f.sort={fieldIndex:0,direction:'asc'};await inspect(h,f,1,0);await navigate(h,1);expectCell(h,3,'NAME','Beta');await navigate(h,1);expectCell(h,1,'NAME','Zulu');
});
test('single visible row disables both directions and never crosses the current page',async()=>{
  const h=harness(),{f}=await inspectorRows(h,['One','Two','Three']);f.pageSize=2;f.page=2;await h.api.readPage(f);await inspect(h,f,0,0);assert.equal(h.node('#prevCellButton').disabled,true);assert.equal(h.node('#nextCellButton').disabled,true);
  await navigate(h,1);await navigate(h,-1);expectCell(h,3,'NAME','Three');assert.equal(f.page,2);
});
test('rapid next and previous ignores both obsolete memo reads',async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h);const first=inspect(h,f,0);await waitForReads(gate);const second=navigate(h,1);await waitForReads(gate,2);const third=navigate(h,-1);await waitForReads(gate,3);await gate.pending[2].resolve();await third;expectCell(h,1,'NOTE','Alpha memo');
  gate.pending[1].reject(new Error('Obsolete Beta'));await second;await gate.pending[0].resolve();await first;expectCell(h,1,'NOTE','Alpha memo');
});
for(const action of ['button','escape','backdrop','native close']) test(`${action} invalidates pending memo and clears copy state`,async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h);installDialog(h);const job=inspect(h,f,0);await waitForReads(gate);
  if(action==='button')await h.node('#closeCellButton').dispatch('click');
  if(action==='escape')await h.node('#cellDialog').dispatch('cancel',{preventDefault(){}});
  if(action==='backdrop')await h.node('#cellDialog').dispatch('click',{clientX:0,clientY:0,target:h.node('#cellDialog')});
  if(action==='native close'){h.node('#cellDialog').close();await h.node('#cellDialog').dispatch('close');}
  const value=h.node('#cellValue').textContent;assert.equal(h.node('#cellDialog').open,false);assert.equal(h.state.activeCellText,'');assert.equal(h.node('#copyCellButton').disabled,true);
  await gate.pending[0].resolve();await job;assert.equal(h.node('#cellValue').textContent,value);assert.equal(h.state.activeCellText,'');
});
test('queued old native close event does not invalidate the reopened inspector',async()=>{
  const h=harness(),{f}=await inspectorRows(h);installDialog(h);await inspect(h,f,0,0);await h.node('#closeCellButton').dispatch('click');await inspect(h,f,1,0);await h.node('#cellDialog').dispatch('close');await h.node('#copyCellButton').dispatch('click');expectCell(h,2,'NAME','Beta');assert.equal(h.copies[0],'Beta');
});
for(const action of ['page','encoding','tab','close source']) test(`${action} change invalidates pending inspector without disturbing current rows`,async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h),job=inspect(h,f,0);await waitForReads(gate);
  if(action==='page'){f.pageSize=1;f.page=2;await h.api.readPage(f);}
  if(action==='encoding'){f.encodingMode='utf-8';await h.api.readPage(f);}
  if(action==='tab')await ready(h,'Other.dbf',['Other']);
  if(action==='close source')h.api.closeFile(f.id);
  assert.equal(h.node('#cellDialog').open,false);assert.equal(h.state.activeCellText,'');const renders=h.tables.length;gate.pending[0].reject(new Error('obsolete source failure'));await job;assert.equal(h.tables.length,renders);assert.equal(h.state.activeCellText,'');
});
for(const action of ['memo source','memo kind','dbf source','encoding']) test(`direct ${action} mutation makes an inspector completion and copy stale`,async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h),job=inspect(h,f,0);await waitForReads(gate);const value=h.node('#cellValue').textContent;
  if(action==='memo source')f.memoFile=new File([new Uint8Array(1)],'Other.dbt');if(action==='memo kind')f.memoKind='FPT';if(action==='dbf source')f.dbfFile=tinyDbf('Replacement.dbf');if(action==='encoding')f.encodingMode='utf-8';
  await gate.pending[0].resolve();await job;assert.equal(h.node('#cellValue').textContent,value);assert.equal(h.state.activeCellText,'');assert.equal(typeof h.api.copyCell,'function');await h.api.copyCell();assert.equal(h.copies.length,0);
});
test('FPT inspector reads only the captured source across header, block and data awaits',async()=>{
  const h=harness(),{f}=await inspectorRows(h),bytes=Buffer.alloc(1024);bytes.writeUInt16BE(512,6);bytes.writeUInt32BE(1,512);bytes.writeUInt32BE(4,516);bytes.write('caf\xe9',520,'latin1');const gate=gateFile(new File([bytes],'Inspect.fpt'));f.memoFile=gate.file;f.memoKind='FPT';const job=inspect(h,f,0);await waitForReads(gate);
  const replacement=gateFile(new File([bytes],'Replacement.fpt'));f.memoFile=replacement.file;f.memoKind='DBT';f.encodingMode='utf-8';await gate.pending[0].resolve();await waitForReads(gate,2);await gate.pending[1].resolve();await waitForReads(gate,3);await gate.pending[2].resolve();await job;assert.equal(replacement.pending.length,0);assert.equal(h.state.activeCellText,'');
});
test('current FPT inspector decodes its chosen encoding',async()=>{
  const h=harness(),{f}=await inspectorRows(h),bytes=Buffer.alloc(1024);bytes.writeUInt16BE(512,6);bytes.writeUInt32BE(1,512);bytes.writeUInt32BE(4,516);bytes.write('caf\xe9',520,'latin1');f.memoFile=new File([bytes],'Inspect.fpt');f.memoKind='FPT';await inspect(h,f,0);expectCell(h,1,'NOTE','café');
});
test('obsolete clipboard rejection never starts fallback copy or stale feedback',async()=>{
  const h=harness(),{f}=await inspectorRows(h);await inspect(h,f,0,0);let rejectClipboard,fallback=0;h.api.navigator={clipboard:{writeText:()=>new Promise((resolve,reject)=>rejectClipboard=reject)}};
  h.api.document.body.append=()=>{};h.api.document.createElement=()=>({style:{},select(){},remove(){}});h.api.document.execCommand=()=>{fallback++;return true;};vm.runInContext(extract('copyText'),h.api);
  assert.equal(typeof h.api.copyCell,'function');const copy=h.api.copyCell();while(!rejectClipboard)await new Promise(resolve=>setImmediate(resolve));await inspect(h,f,1,0);const notices=h.toasts.length;rejectClipboard(new Error('clipboard declined'));await copy;assert.equal(fallback,0);assert.equal(h.toasts.length,notices);
});
test('inspector navigation does not cancel a pending CSV snapshot',async()=>{
  const h=harness(),{f,gate}=await inspectorRows(h);const csv=h.api.copyCsv();await waitForReads(gate);await inspect(h,f,0,0);await navigate(h,1);await gate.pending[0].resolve();await waitForReads(gate,2);await gate.pending[1].resolve();await csv;assert.equal(h.copies[0],'NAME,NOTE\r\nAlpha,Alpha memo\r\nBeta,Beta memo');expectCell(h,2,'NAME','Beta');
});
test('navigation buttons use native keyboard semantics and bilingual labels',()=>{
  assert.match(source,/<button[^>]*id="prevCellButton"[^>]*type="button"[^>]*disabled/);assert.match(source,/<button[^>]*id="nextCellButton"[^>]*type="button"[^>]*disabled/);
  assert.match(source,/previousRecord: '前のレコード'/);assert.match(source,/previousRecord: 'Previous record'/);assert.match(source,/nextRecord: '次のレコード'/);assert.match(source,/nextRecord: 'Next record'/);
});

test('keyboard button clicks at zero coordinates navigate without being treated as backdrop clicks',async()=>{
  const h=harness(),{f}=await inspectorRows(h);installDialog(h);await inspect(h,f,0,0);
  const event={clientX:0,clientY:0,target:h.node('#nextCellButton')};await h.node('#nextCellButton').dispatch('click',event);await h.node('#cellDialog').dispatch('click',event);
  assert.equal(h.node('#cellDialog').open,true);expectCell(h,2,'NAME','Beta');assert.equal(h.node('#nextCellButton').disabled,true);
  const back={clientX:0,clientY:0,target:h.node('#prevCellButton')};await h.node('#prevCellButton').dispatch('click',back);await h.node('#cellDialog').dispatch('click',back);expectCell(h,1,'NAME','Alpha');
});
