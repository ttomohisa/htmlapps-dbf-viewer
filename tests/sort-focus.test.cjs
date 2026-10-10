const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(process.env.DBF_TEST_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');
function extract(name) {
  const match = new RegExp('^      (?:async )?function ' + name + '\\(', 'm').exec(source);
  assert(match, `Production function ${name} exists`);
  const rest = source.slice(match.index + match[0].length);
  const next = /\n      (?:async )?function |\n      const |\n      \/\//.exec(rest);
  return source.slice(match.index, next ? match.index + match[0].length + next.index : source.indexOf('\n      $(', match.index));
}
// Run the actual render/sort handlers. This minimal DOM records focus on newly
// rendered buttons; native Tab/Enter/Space behavior is verified in Chromium.
function harness() {
  const nodes = new Map();
  let document;
  function element(tag = 'div') {
    const listeners = new Map();
    const node = {tagName:tag.toUpperCase(),children:[],dataset:{},style:{},className:'',textContent:'',
      append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children=children; },
      addEventListener(event, fn) { listeners.set(event, fn); }, click() { return listeners.get('click')?.(); },
      focus() { document.activeElement=this; },
      querySelector(selector) { const index=selector.match(/^\[data-sort-index="(\d+)"\]$/)?.[1]; return descendants(this).find(child => child.dataset.sortIndex === index) || null; }
    };
    node.classList={add(...names) { node.className += ' '+names.join(' '); }};
    return node;
  }
  document={body:element('body'),activeElement:null,createElement:element};
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const context=vm.createContext({document,$:get,state:{language:'en'},formatNumber:String,t:key=>key,renderPagination(){},openCell(){}});
  vm.runInContext(['visibleRows','cellDisplayNode','renderDataTable','cycleSort'].map(extract).join('\n'),context);
  return {api:context,document,get};
}
function descendants(node) { return node.children.flatMap(child=>[child,...descendants(child)]); }
function fixture() {
  return {header:{fields:[{index:0,name:'AMOUNT'}]},hiddenFields:new Set(),showDeleted:false,sort:null,
    rows:[3,1,2].map((value,index)=>({recordNumber:index+1,deleted:false,cells:[{value:String(value),display:String(value),sortValue:value}]}))};
}
test('sort activation retains the replaced header focus through ascending, descending and source order',()=>{
  const h=harness(),file=fixture();h.api.renderDataTable(file);
  const buttons=()=>descendants(h.get('#dataTableWrap')).filter(node=>node.className.split(/\s+/).includes('sort-button'));
  for(const [direction,order] of [['asc',[2,3,1]],['desc',[1,3,2]],[null,[1,2,3]]]) {
    const prior=buttons()[0];prior.focus();prior.click();
    assert.notEqual(buttons()[0],prior,'render replaces the header button');
    assert.equal(h.document.activeElement,buttons()[0],'focus returns to the same field button');
    assert.equal(file.sort?.direction ?? null,direction);
    assert.deepEqual(Array.from(h.api.visibleRows(file),row=>row.recordNumber),order);
    assert.deepEqual(file.rows.map(row=>row.recordNumber),[1,2,3],'source row order stays unchanged');
  }
});
test('nonfocused sort activation does not steal another control focus',()=>{
  const h=harness(),file=fixture();h.api.renderDataTable(file);const other=h.get('#columnsButton');other.focus();
  descendants(h.get('#dataTableWrap')).find(node=>node.className==='sort-button').click();
  assert.equal(h.document.activeElement,other);
});
