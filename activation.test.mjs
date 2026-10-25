import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedResource} from './activation.mjs';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';

const before={source:'none',target:null,focused:true,blockingWindows:[]};
const selected={source:'resource',target:349641,occupied:false,focused:true,blockingWindows:[],gestureId:7};
function harness({baseline=before,states=[selected],gesture=true,stop=false}={}) {
  let clock=0,index=0;const calls=[];
  return {calls,run:()=>selectedResource({call:async command=>{
    calls.push(command);
    if(command==='selectionGesture')return {gesture:gesture?{id:7,before:baseline}:null};
    return states[Math.min(index++,states.length-1)];
  }},{check:()=>{if(stop)throw new Error('stopped');},sleep:async ms=>{clock+=ms;},now:()=>clock})};
}
test('selection requires a new eligible resource stable across two observations',async()=>{
  const h=harness({states:[{...selected,source:'none'},selected,selected]});
  assert.deepEqual(await h.run(),{target:349641,gestureId:7});
  assert.equal(h.calls.filter(c=>c==='selection').length,3);
  assert.deepEqual(await harness({baseline:{...before,source:'resource',target:99}}).run(),{target:349641,gestureId:7});
});
test('old selection, occupied resource, combat panel, drag/no gesture and blocking dialogs never qualify',async()=>{
  for(const options of [
    {gesture:false},{baseline:{...before,source:'resource',target:selected.target}},
    {baseline:{...before,source:'dispatch'}},{baseline:{...before,blockingWindows:['Dialog']}},
    {states:[{...selected,occupied:true}]},{states:[{...selected,source:'dispatch'}]},
    {states:[{...selected,blockingWindows:['CastleWindow']}]},{states:[{...selected,focused:false}]},
    {states:[{...selected,gestureId:8}]},{states:[{...selected,target:0}]}
  ])assert.equal(await harness(options).run(),null);
});
test('selection wait honors stop and does not send any native mutation',async()=>{
  const h=harness({stop:true});await assert.rejects(h.run(),/stopped/);
  assert.deepEqual(h.calls,['selectionGesture']);
});
const source=await readFile(new URL('./auto-trigger.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function contentHarness(mode, reply=async()=>({ok:true})) {
  const listeners=new Map(),changes=new Set(),messages=[],notices=[],timers=new Map();let nextTimer=0;
  const document={querySelector:()=>({id:'unity-canvas'}),hasFocus:()=>true,createElement:()=>({style:{},setAttribute(){},remove(){}}),documentElement:{appendChild:node=>notices.push(node.textContent)}};
  const context=createContext({document,setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    window:{addEventListener:(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},removeEventListener:(n,f)=>listeners.get(n)?.delete(f)},
    chrome:{runtime:{sendMessage:async message=>{messages.push(message);return reply(message);}},
      storage:{local:{get:async()=>({activationMode:mode})},onChanged:{addListener:f=>changes.add(f),removeListener:f=>changes.delete(f)}}}});
  const install=()=>runInContext(source,context);install();
  const fire=(patch={})=>{for(const fn of listeners.get('click')||[])fn({isTrusted:true,button:0,detail:1,target:{id:'unity-canvas'},...patch});};
  return {messages,notices,document,install,fire,listeners,retry:()=>{const next=[...timers].find(([,t])=>t.fn.name==='prepare');assert.ok(next,'preparation retry should remain scheduled');timers.delete(next[0]);return next[1].fn();},setMode:value=>{for(const f of changes)f({activationMode:{newValue:value}},'local');}};
}
test('manual is default, mode change persists externally, and enabling never sends autoRun',async()=>{
  const h=contentHarness(undefined);await flush();h.fire();
  assert.equal(h.messages.some(m=>m.type==='autoRun'),false);
  h.setMode('selection');await flush();
  assert.equal(h.messages.filter(m=>m.type==='autoPrepare').length,1);
  assert.equal(h.messages.some(m=>m.type==='autoRun'),false);
  h.fire();assert.equal(h.messages.filter(m=>m.type==='autoRun').length,1);
  h.setMode('manual');await flush();h.fire();
  assert.equal(h.messages.filter(m=>m.type==='autoRun').length,1);
});
test('automatic trigger ignores synthetic, modified, non-canvas, double and unfocused clicks; repair deduplicates',async()=>{
  const h=contentHarness('selection');await flush();
  for(const patch of [{isTrusted:false},{button:2},{detail:2},{ctrlKey:true},{altKey:true},{shiftKey:true},{metaKey:true},{target:{id:'other'}}])h.fire(patch);
  h.document.hasFocus=()=>false;h.fire();assert.equal(h.messages.some(m=>m.type==='autoRun'),false);
  h.document.hasFocus=()=>true;h.install();await flush();h.fire();
  assert.equal(h.listeners.get('click').size,1);assert.equal(h.messages.filter(m=>m.type==='autoRun').length,1);
});

test('slow game loading beyond one minute still initializes without dispatching the stale selection',async()=>{
  const h=contentHarness('selection');h.document.querySelector=()=>null;await flush();
  for(let i=0;i<45;i++){await h.retry();await flush();}
  assert.equal(h.messages.some(m=>m.type==='autoPrepare'),false);
  h.document.querySelector=()=>({id:'unity-canvas'});await h.retry();await flush();
  assert.ok(h.notices.some(n=>n.includes('Click-to-run ready')));
  assert.equal(h.messages.some(m=>m.type==='autoRun'),false);
  h.fire();await flush();assert.equal(h.messages.filter(m=>m.type==='autoRun').length,1);
});
test('failed preparation keeps retrying and rejected automatic runs are visible',async()=>{
  let attempts=0;
  const h=contentHarness('selection',async message=>message.type==='autoPrepare'
    ? (++attempts<40?{ok:false,error:'Unity is not ready.'}:{ok:true})
    : {ok:false,error:'Native method mismatch. No dispatch sent.'});
  await flush();
  for(let i=0;i<39;i++){await h.retry();await flush();}
  assert.ok(h.notices.some(n=>n.includes('Unity is not ready')));
  assert.ok(h.notices.some(n=>n.includes('Click-to-run ready')));
  h.fire();await flush();assert.match(h.notices.at(-1),/Native method mismatch/);
});

test('resource initialization can take several seconds; pending state never qualifies as a target',async()=>{
  const pending={...selected,source:'pending',target:null};
  const h=harness({states:[...Array(35).fill(pending),selected,selected]});
  assert.deepEqual(await h.run(),{target:349641,gestureId:7});
  assert.equal(h.calls.filter(c=>c==='selection').length,37);
  assert.equal(await harness({states:[pending]}).run(),null);
  assert.equal(await harness({baseline:{...before,source:'pending'}}).run(),null);
});

test('castle activation requires a fresh stable target and preserves its kind',async()=>{
 const state={...selected,source:'castle'};
 assert.deepEqual(await harness({states:[state]}).run(),{target:state.target,gestureId:7,kind:'castle'});
 assert.equal(await harness({baseline:{...before,source:'castle',target:state.target},states:[state]}).run(),null);
});
