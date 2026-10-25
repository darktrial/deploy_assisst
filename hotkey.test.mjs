import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext, runInContext} from 'node:vm';

const source = await readFile(new URL('./hotkey.js', import.meta.url), 'utf8');
function harness(reply = () => Promise.resolve({ok:true})) {
  const listeners = new Map(), messages = [], notices = [];
  const document = {hasFocus: () => true, activeElement: null,
    createElement: () => ({style:{},setAttribute(){},remove(){}}),
    documentElement:{appendChild:node=>notices.push(node.textContent)}};
  const context = createContext({document, setTimeout:()=>1,clearTimeout:()=>{},
    window:{addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
      removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)},
    chrome:{runtime:{sendMessage:message=>{messages.push(message);return reply();}}}});
  const install = () => runInContext(source,context);
  install();
  const fire = (name,overrides={}) => {
    const event={code:'F8',key:'F8',isTrusted:true,composedPath:()=>[],preventDefault(){},stopImmediatePropagation(){},...overrides};
    for(const fn of listeners.get(name)||[])fn(event);
  };
  return {document,listeners,messages,notices,fire,install};
}
const flush = () => new Promise(resolve=>setImmediate(resolve));

test('F8 down/up and long press trigger once; keyup fallback handles consumed keydown', async()=>{
  const h=harness();
  h.fire('keydown');h.fire('keydown',{repeat:true});h.fire('keyup',{isTrusted:false});h.fire('keyup');
  assert.equal(h.messages.length,1);
  h.fire('keyup');assert.equal(h.messages.length,2);
  h.fire('keydown',{code:'',key:'F8'});h.fire('keyup',{code:'',key:'F8'});
  assert.equal(h.messages.length,3);
  await flush();assert.ok(h.notices.some(text=>text.includes('F8 received')));
});

test('typing, modifiers, synthetic events and inactive document never dispatch',()=>{
  const h=harness();
  for(const patch of [{ctrlKey:true},{altKey:true},{shiftKey:true},{metaKey:true},{isComposing:true},
    {isTrusted:false},{composedPath:()=>[{isContentEditable:true}]},{composedPath:()=>[{tagName:'INPUT'}]}]){
    h.fire('keydown',patch);
    // Modifier release before F8 release must not turn a rejected shortcut into a run.
    h.fire('keyup',patch.isTrusted===false?patch:{});
  }
  h.document.activeElement={tagName:'TEXTAREA'};h.fire('keydown');h.fire('keyup');
  h.document.activeElement=null;h.document.hasFocus=()=>false;h.fire('keyup');
  assert.equal(h.messages.length,0);
});

test('repair replaces listeners and surfaces background rejection',async()=>{
  const h=harness(()=>Promise.resolve({ok:false,error:'The game tab is inactive'}));
  h.install();h.install();
  assert.equal(h.listeners.get('keydown').size,1);assert.equal(h.listeners.get('keyup').size,1);
  h.fire('keydown');h.fire('keyup');await flush();
  assert.equal(h.messages.length,1);assert.match(h.notices.at(-1),/inactive/);
});

test('invalidated extension and missing response are visible instead of silently ignored',async()=>{
  for(const reply of [()=>{throw new Error('invalidated');},()=>Promise.reject(new Error('closed')),()=>Promise.resolve(undefined)]){
    const h=harness(reply);h.fire('keyup');await flush();
    assert.equal(h.messages.length,1);assert.match(h.notices.at(-1),/refresh/i);
  }
});
