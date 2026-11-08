const assert = require('node:assert/strict');
const fs = require('node:fs');
// The browser script has a CommonJS test export; isolate it from the root ESM package.
const sandbox = {module:{exports:{}},exports:{}};
require('node:vm').runInNewContext(fs.readFileSync(process.argv[2],'utf8'),sandbox,{filename:process.argv[2]});
const core = sandbox.module.exports;
const {bundle,expectations} = JSON.parse(fs.readFileSync(0,'utf8'));
const rows=core.decode(bundle);
for(const {filters,expected} of expectations){
  const actual=core.totals(core.selectRows(rows,filters));
  for(const key of Object.keys(expected)) assert.ok(Math.abs(actual[key]-expected[key])<0.001,`${key}: ${actual[key]} != ${expected[key]}`);
}
const weighted=core.totals([
  {date:'2025-01-01',machine:'A',coin:100,payout:80,available:1,scheduled:2,theo:5},
  {date:'2025-01-02',machine:'A',coin:900,payout:855,available:9,scheduled:9,theo:45}
]);
assert.equal(weighted.hold,0.065);
assert.equal(weighted.availability,10/11);
assert.equal(weighted.theo_hour,5);
assert.equal(core.totals([]).hold,null);
assert.equal(core.totals([]).availability,null);
const moving=[{date:'2025-01-01',bank:'A',zone:'Z',machine:'M',coin:10},{date:'2025-06-01',bank:'B',zone:'Z',machine:'M',coin:30}];
assert.equal(core.totals(core.selectRows(moving,{start:'2025-01',end:'2025-06',bank:'A',zone:''})).coin,10);
console.log('Dashboard arithmetic checks passed: 3 SQL scopes, weighted ratios, empty scopes and dated moves.');

// Render-level checks run the actual view functions with a minimal document.
// This verifies page data bindings and events; it is not browser/visual QA.
const elements=new Map();
function element(id){
  if(!elements.has(id))elements.set(id,{id,value:'',innerHTML:'',listeners:{},open:false,
    addEventListener(event,fn){this.listeners[event]=fn;},
    showModal(){this.open=true;},close(){this.open=false;}});
  return elements.get(id);
}
const nav=['overview','machines','demand','downtime','guests','actions','validation','evidence'].map(page=>({dataset:{page},textContent:page,classList:{toggle(){}},setAttribute(){},removeAttribute(){}}));
global.window=global;
global.DR_DATA=bundle;
global.location={hash:'#overview'};
global.addEventListener=()=>{};
global.scrollTo=()=>{};
global.document={getElementById:element,querySelectorAll:()=>nav,querySelector:()=>nav[0],addEventListener(){}};
require('node:vm').runInThisContext(fs.readFileSync(process.argv[2],'utf8'),{filename:process.argv[2]});
const evidenceIds=new Set(['floor-math','luck-method','guest-scope','validation-data']);
for(const [reportKey,report] of Object.entries(bundle.reports||{})){
  const items=report?.evidence||report?.claims||[];
  if(Array.isArray(items))items.forEach((e,i)=>evidenceIds.add(e.id||`${reportKey}-${i+1}`));
}
let evidenceLinksChecked=0;
for(const page of nav.map(x=>x.dataset.page)){
  location.hash='#'+page;
  DR_APP.render();
  const html=element('view').innerHTML;
  assert.ok(html.includes('page-heading'),page+' has heading');
  assert.ok(!html.includes('NaN'),page+' must not display NaN');
  assert.ok(!html.includes('undefined'),page+' must not display undefined');
  for(const match of html.matchAll(/data-evidence="([^"]+)"/g)){
    assert.ok(evidenceIds.has(match[1]),`${page}: unresolved evidence reference ${match[1]}`);
    evidenceLinksChecked++;
  }
  if(page==='actions')assert.ok(html.includes(' proposed.')&&!html.includes(' deployed.'),'fictional action plan must be proposed, not deployed');
  if(page==='validation'&&bundle.reports.validation)assert.equal([...html.matchAll(/data-evidence="validation-data"/g)].length,5,'validation heading and four KPIs trace dedicated provenance');
}
console.log(`Evidence integrity checks passed: ${evidenceLinksChecked} emitted references across 8 pages resolve.`);
element('start-month').value='2025-06';
element('start-month').listeners.change();
assert.equal(DR_APP.state.start,'2025-06');
element('zone').listeners.change({target:{value:'Z-B40'}});
assert.equal(DR_APP.state.zone,'Z-B40');
assert.ok(element('bank').innerHTML.includes('B-31'));
assert.ok(!element('bank').innerHTML.includes('B-01'));
element('reset').listeners.click();
assert.equal(DR_APP.state.start,'2025-01');
assert.equal(DR_APP.state.zone,'');
Object.assign(DR_APP.state,{start:'2025-01',end:'2025-01',bank:'B-51'});
location.hash='#downtime';DR_APP.render();
assert.ok(!element('view').innerHTML.includes('100.0% of scheduled machine-hours'),'empty bank exposure is undefined, not total downtime');
console.log('Dashboard binding checks passed: 8 pages, date event, dependent bank options and reset.');
