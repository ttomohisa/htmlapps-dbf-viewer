const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

// Execute the production parser/state/export functions, with only DOM output and
// clipboard/download delivery stubbed. Fixtures are tiny, synthetic local files.
const source = fs.readFileSync(process.env.DBF_TEST_HTML || path.join(__dirname, '../../src/index.template.html'), 'utf8');
const names = ['closeCell','isCurrentCell','renderCellNavigation','navigateCell','copyCell','bindCellDialog','closeDialogOnBackdrop','bytesToHex','openCell','basename','extension','uniqueId','safeTextDecoder','decodeText','decodeAscii','isAllZero','parseDbfHeader','getActiveEncoding','parseMemoReference','parseFieldValue','readPage','readMemo','getActiveFile','buildFileState','activateFile','closeFile','visibleRows','renderDataLoading','renderPagination','resolveCellForCsv','csvEscape','buildCurrentCsv','normalizedFilenameBase','copyCsv','downloadCsv','pageContext','isCurrentPageContext','isPageReady','refreshCsvActions','createCsvSnapshot','isCsvSnapshotLive','isCsvSnapshotCurrent','buildCsv','renderCsvState','finishCsv','csvResult','applyLanguage','chooseAppLanguage','renderCellLanguage','localizedMessage','notify'];
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
    if (!nodes.has(id)) { const classes = new Set(), listeners = new Map(); nodes.set(id, {dataset:{},attributes:{},setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k]??null;},removeAttribute(k){delete this.attributes[k];},value:'',disabled:false,style:{},textContent:'',hidden:false,open:false,modalShows:0,showModal(){this.open=true;this.modalShows++;},close(){this.open=false;},addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);},async dispatch(type,event={}){for(const handler of listeners.get(type)||[])await handler(event);},getBoundingClientRect(){return {left:10,right:100,top:10,bottom:100};},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,b)=>b?classes.add(c):classes.delete(c),contains:c=>classes.has(c)}}); }
    return nodes.get(id);
  };
  const state = {files:[],activeId:null,generation:0,language:'en',activeCell:null,activeCellText:''};
  const context = vm.createContext({state,storageKey:'dbf-viewer:language',$$:()=>[],window:{},localStorage:null,location:{href:'file:///viewer.html'},history:{replaceState(){}},navigator:{languages:['en']},TextDecoder,Uint8Array,DataView,Set,Map,Blob,Date,Math,Number,MAX_HEADER_BYTES:1024*1024,MAX_MEMO_BYTES:16*1024*1024,decoderCache:new Map(),asciiDecoder:new TextDecoder('windows-1252'),APP_CONFIG:{slug:'dbf-viewer'},$:node,fieldTypeLabel:f=>f.type,t:(key,vars)=>vars ? key+':'+JSON.stringify(vars) : key,getAutoEncoding:()=> 'windows-1252',formatNumber:String,
    document:{documentElement:{},body:{classList:{add(){},remove(){}}},createElement:()=>({click(){downloads.push({name:this.download,blob:blobs.get(this.href)});}})},
    URL:class extends URL {static createObjectURL(blob){const id='blob:'+blobs.size;blobs.set(id,blob);return id;}static revokeObjectURL(){}},setTimeout(){},toast:x=>toasts.push(x),setBanner(){},renderFileStatus(){},renderFileManager(){},renderOverview(){},renderFields(){},renderColumnsDialog(){},
    renderDataTable:f=>tables.push({id:f.id,page:f.page,loading:f.loading,rows:f.rows.map(r=>r.cells[0].value)}),copyText:async text=>{copies.push(text);return true;}});
  const uiPath=path.join(__dirname,'../../components/ui-conventions.js'); if(fs.existsSync(uiPath)) vm.runInContext(fs.readFileSync(uiPath,'utf8'),context);
  vm.runInContext(source.match(/const translations = (\{[\s\S]*?\n      \});/)[0],context);
  vm.runInContext(names.map(extract).join('\n'),context);
  context.t=vm.runInContext('('+extract('t').trim()+')',context);
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

module.exports={harness,ready,tinyDbf,gateFile,memoGate,waitForReads,inspect,inspectorRows};
