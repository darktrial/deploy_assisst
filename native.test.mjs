import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nativeInPage} from './native-page.mjs';
import {runNative,validateNativeOptions} from './native-runner.mjs';
import {NativeClient} from './native-client.mjs';

const profile=JSON.parse(await readFile(new URL('./native-profile.json',import.meta.url),'utf8'));
const clone=value=>structuredClone(value);
function queue(overrides={}){return {uid:'42',marchId:'4899549206363294',target:'349641',mainType:11,subType:1,speedupSeconds:0,warType:0,...overrides};}
function runnerHarness({boosts=0,timeout=false,ambiguous=false,cancel=false,arrived=false}={}){
  let clock=0,stopped=false;
  const calls=[],notes=[],sleeps=[];
  const s={build:profile.build,source:'resource',target:349641,occupied:false,presets:[{pos:1,name:'Spear'}],queues:[queue({uid:'old'})],boostInventory:5,panel:null};
  const client={call:async(command,args)=>{
    calls.push({command,args:clone(args)});
    if(command==='inspect'&&cancel)stopped=true;
    if(command==='open'){s.source='dispatch';s.panel={preset:13,soldiers:'20'};}
    if(command==='preset')s.panel={preset:1,soldiers:'1182345'};
    if(command==='dispatch'&&!timeout){s.queues.push(queue({subType:arrived?7:1}));if(ambiguous)s.queues.push(queue({uid:'43'}));}
    if(command==='boost'){s.queues.find(q=>q.uid===args.queueId).speedupSeconds+=21;s.boostInventory--;}
    return clone(s);
  }};
  const deps={check:()=>{if(stopped)throw new Error('stopped');},sleep:async ms=>{sleeps.push(ms);clock+=ms;},note:text=>notes.push(text),now:()=>clock};
  return {calls,notes,s,sleeps,run:()=>runNative(client,{preset:1,target:349641,boosts},deps)};
}
test('native sequence correlates only the newly created queue and acknowledges each speedup',async()=>{
  const h=runnerHarness({boosts:2}),result=await h.run();
  assert.equal(result.queueId,'42');
  assert.deepEqual(h.calls.filter(c=>!['inspect','progress'].includes(c.command)).map(c=>c.command),['open','preset','dispatch','boost','boost']);
  assert.ok(h.calls.filter(c=>c.command==='boost').every(c=>c.args.queueId==='42'&&c.args.itemId===10303&&c.args.count===1));
  assert.equal(h.s.boostInventory,3);
  assert.deepEqual(h.sleeps,[],'ready game replies should proceed without a fixed startup sleep');
});
test('native timeout never retries dispatch or sends speedups',async()=>{
  const h=runnerHarness({boosts:2,timeout:true});await assert.rejects(h.run(),/timed out/);
  assert.equal(h.calls.filter(c=>c.command==='dispatch').length,1);
  assert.equal(h.calls.filter(c=>c.command==='boost').length,0);
});
test('ambiguous new marches and cancellation stop before speedup',async()=>{
  const a=runnerHarness({boosts:1,ambiguous:true});await assert.rejects(a.run(),/Multiple new marches/);
  assert.equal(a.calls.some(c=>c.command==='boost'),false);
  const b=runnerHarness({boosts:1,cancel:true});await assert.rejects(b.run(),/stopped/);
  assert.equal(b.calls.some(c=>c.command==='open'),false);
});
test('a new march that has already arrived is confirmed without consuming speedups',async()=>{
  const h=runnerHarness({boosts:2,arrived:true});
  await h.run();assert.equal(h.calls.some(c=>c.command==='boost'),false);
});
test('stale target, unavailable inventory and invalid parameters fail before mutation',async()=>{
  const a=runnerHarness({boosts:1});a.s.target=9;await assert.rejects(a.run(),/[Tt]arget/);
  assert.equal(a.calls.filter(c=>c.command!=='inspect').length,0);
  const b=runnerHarness({boosts:2});b.s.boostInventory=1;await assert.rejects(b.run(),/Insufficient/);
  const c=runnerHarness();c.s.blockingWindows=['ConfirmWindow'];await assert.rejects(c.run(),/blocking game dialogs/);
  assert.equal(c.calls.some(x=>x.command!=='inspect'),false);
  for(const patch of [{boosts:3},{boosts:-1},{preset:0},{target:0}])assert.throws(()=>validateNativeOptions({preset:1,target:349641,boosts:0,...patch}));
});

function memoryFixture(){
  const buffer=new ArrayBuffer(2*1024*1024),heap=new Uint8Array(buffer),view=new DataView(buffer);let next=1000;
  const allocate=size=>{const p=next;next=(next+size+7)&~7;return p;};
  const put=(p,v)=>view.setUint32(p,v,true),long=(p,v)=>view.setBigInt64(p,BigInt(v),true);
  const cstr=s=>{const p=allocate(s.length+1);heap.set(new TextEncoder().encode(s),p);return p;};
  const text=s=>{const p=allocate(12+s.length*2);put(p+8,s.length);for(let i=0;i<s.length;i++)view.setUint16(p+12+i*2,s.charCodeAt(i),true);return p;};
  const table=new Map(),methods={},classes=new Map(),calls=[];
  const klass=(name,namespace='Yoozoo.Mars.Got')=>{
    if(classes.has(name))return classes.get(name);
    const k=allocate(220);put(k+8,cstr(name));put(k+12,cstr(namespace));put(k+92,allocate(128));
    classes.set(name,k);return k;
  };
  const object=(name,size=512)=>{const p=allocate(size);put(p,klass(name));return p;};
  const array=items=>{const p=object('Array',16+items.length*4);put(p+12,items.length);items.forEach((x,i)=>put(p+16+i*4,x));return p;};
  const list=items=>{const p=object('List`1');put(p+8,array(items));put(p+12,items.length);return p;};
  const dict=(rows,wide=false)=>{
    const p=object('Dictionary`2'),a=object('Array',16+rows.length*(wide?24:16));put(a+12,rows.length);put(p+12,a);put(p+16,rows.length);
    rows.forEach(([key,value],i)=>{const e=a+16+i*(wide?24:16);put(e,1);if(wide)long(e+8,key);else put(e+8,key);put(e+(wide?16:12),value);});return p;
  };
  const setMethods=(name,keys)=>{
    const k=klass(name),entries=[];
    for(const key of keys){const spec=profile.methods[key],p=allocate(48);put(p,spec.slot);put(p+12,cstr(spec.name));heap[p+46]=spec.args;entries.push(p);methods[key]=p;
      const fn=(...args)=>{calls.push({key,args});};Object.defineProperty(fn,'length',{value:spec.arity});table.set(spec.slot,fn);
    }
    const a=allocate(entries.length*4);entries.forEach((p,i)=>put(a+i*4,p));put(k+76,a);view.setUint16(k+168,entries.length,true);
  };
  const local=clone(profile);let meta=100;
  for(const name of Object.keys(local.types)){local.types[name]=meta;put(meta,klass(name));meta+=4;}
  const gameStatics=view.getUint32(klass('GotGame')+92,true),data=object('Data'),gui=object('GotGuiManager'),war=object('WarHallPlugin'),qp=object('QueuePlugin');
  put(gameStatics+24,data);put(gameStatics+36,gui);put(view.getUint32(klass('WarHallPlugin')+92,true),war);put(view.getUint32(klass('QueuePlugin')+92,true),qp);
  const resource=object('ResourcesInfoWindow'),param=object('ResourcesInfoParam'),server=object('WorldMapObject');heap[resource+36]=1;put(resource+60,param);put(param+20,server);put(server+8,349641);
  const panel=object('SendtrooppanelWindow'),show=object('ShowViewParam');put(panel+52,show);put(show+156,349641);put(show+176,2);put(panel+184,13);long(panel+112,29547);put(panel+252,list([]));put(panel+256,list([]));
  put(gui+32,dict([[1,resource],[2,panel]]));
  const preset=object('ArmyFormationInfo'),soldier=object('WorldMarchSoilder');put(preset+8,1);put(preset+12,text('Spear'));put(preset+24,3);put(soldier+8,3005);put(soldier+12,1182345);put(preset+20,list([soldier]));put(war+16,dict([[0,dict([[1,preset]])]]));
  const qd=object('QueueData'),q=object('QueueVo');put(data+52,qd);put(qd+8,dict([[42,q]],true));long(q+8,42);put(q+20,11);put(q+24,1);long(q+72,'4899549206363294');long(q+80,349641);
  const bag=object('BagData'),item=object('ItemVO'),display=object('DisplayItem');put(data+100,bag);put(bag+12,dict([[10303,item]]));put(item+8,display);put(display+12,10303);put(display+16,9);
  setMethods('QueuePlugin',['boost']);setMethods('ResourcesInfoWindow',['collect']);setMethods('SendtrooppanelWindow',['clear','preset','dispatch']);
  const setter=(...args)=>{calls.push({key:'preset',args});put(panel+184,args[1]);long(panel+112,1182345);};Object.defineProperty(setter,'length',{value:5});table.set(profile.methods.preset.slot,setter);
  const module={HEAPU8:heap,HEAPU32:new Uint32Array(buffer),wasmBinary:new Uint8Array(8),asm:{__indirect_function_table:{get:i=>table.get(i)}}};
  local.wasmBytes=8;
  globalThis.window={gameInstance:{Module:module}};
  return {profile:local,calls,module,put,view,klass,object,dict,gui,resource,server,qp,methods,panel,show,heap};
}
test('page bridge reads typed presets, queues and inventory without invoking a native method',async()=>{
  const h=memoryFixture(),s=await nativeInPage(h.profile,'inspect',{},false);
  assert.equal(s.target,349641);assert.equal(s.presets[0].name,'Spear');assert.equal(s.presets[0].soldiers[0].count,1182345);
  assert.equal(s.boostInventory,9);assert.equal(s.queues[0].marchId,'4899549206363294');assert.equal(h.calls.length,0);
});
test('page bridge invokes only matched original collection and boost methods',async()=>{
  const h=memoryFixture();
  await nativeInPage(h.profile,'open',{target:349641},false);
  await nativeInPage(h.profile,'boost',{target:349641,queueId:'42',marchId:'4899549206363294',itemId:10303,count:1},false);
  assert.deepEqual(h.calls.map(c=>c.key),['collect','boost']);
  assert.deepEqual(h.calls[1].args,[h.qp,42,10303,1,h.methods.boost]);
  await assert.rejects(nativeInPage(h.profile,'boost',{target:349641,queueId:'old',marchId:'4899549206363294',itemId:10303,count:1},false),/specified march/);
  await assert.rejects(nativeInPage(h.profile,'boost',{target:349641,queueId:'42',marchId:'4899549206363294',itemId:10303,count:2},false),/quantity/);
});
test('page bridge refuses incorrect fingerprints, method pointers and occupied resource points',async()=>{
  const h=memoryFixture();
  await assert.rejects(nativeInPage(h.profile,'inspect',{},true),/fingerprint/);assert.equal(h.calls.length,0);
  h.put(h.methods.collect,42);
  await assert.rejects(nativeInPage(h.profile,'open',{target:349641},false),/version mismatch/);assert.equal(h.calls.length,0);
  h.view.setBigInt64(h.server+24,10n,true);
  await assert.rejects(nativeInPage(h.profile,'open',{target:349641},false),/already has a march/);
});
test('page bridge applies a preset and uses the original Go handler with target checks',async()=>{
  const h=memoryFixture();h.heap[h.resource+36]=0;h.heap[h.panel+36]=1;
  const s=await nativeInPage(h.profile,'preset',{target:349641,preset:1},false);
  assert.equal(s.panel.preset,1);assert.equal(s.panel.soldiers,'1182345');
  await nativeInPage(h.profile,'dispatch',{target:349641,preset:1},false);
  assert.deepEqual(h.calls.map(c=>c.key),['clear','preset','dispatch']);
  assert.deepEqual(h.calls[2].args,[h.panel,0,h.methods.dispatch]);
  await assert.rejects(nativeInPage(h.profile,'dispatch',{target:349640,preset:1},false),/[Tt]arget/);
  h.put(h.show+192,1);
  await assert.rejects(nativeInPage(h.profile,'dispatch',{target:349641,preset:1},false),/ordinary resource gathering/);
});
test('scripting client pins the unique Unity document in MAIN and verifies the initial hash',async()=>{
  const calls=[];
  const client=new NativeClient(1,async injection=>{
    calls.push(injection);
    if(injection.target.allFrames)return [{frameId:0,documentId:'top',result:false},{frameId:8,documentId:'unity',result:true}];
    return [{frameId:8,documentId:'unity',result:{build:profile.build}}];
  });
  assert.equal((await client.connect(profile)).build,profile.build);
  await client.call('progress');
  assert.ok(calls.every(c=>c.world==='MAIN'));
  assert.deepEqual(calls[1].target,{tabId:1,documentIds:['unity']});
  assert.equal(calls[1].args[3],true);
  assert.equal(calls[1].args[4],true);
  assert.equal(calls[2].args[3],false);
});

test('scripting client refuses ambiguity, changed documents and page errors without retry',async()=>{
  const ambiguous=new NativeClient(1,async()=>[{documentId:'a',result:true},{documentId:'b',result:true}]);
  await assert.rejects(ambiguous.connect(profile),/unique/);
  for(const result of [{documentId:'new',result:{}},{documentId:'unity',result:{__gtError:'version failed'}},{documentId:'unity'}]){
    let calls=0;
    const client=new NativeClient(1,async()=>{calls++;return [result];});
    client.selected={documentId:'unity'};client.profile=profile;
    await assert.rejects(client.call('dispatch',{target:349641,preset:1}));
    assert.equal(calls,1);
  }
});

test('progress omits army enumeration and transport errors are explicit',async()=>{
  const h=memoryFixture();
  // Simulate unavailable preset data after dispatch; progress must not touch it.
  h.put(h.profile.types.WarHallPlugin,0);
  const s=await nativeInPage(h.profile,'progress',{},false);
  assert.equal(s.boostInventory,9);assert.equal(s.queues[0].uid,'42');
  assert.equal('presets' in s,false);assert.equal(h.calls.length,0);
  const error=await nativeInPage(h.profile,'inspect',{},true,true);
  assert.match(error.__gtError,/fingerprint/);
});
