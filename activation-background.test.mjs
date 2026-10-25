import test from 'node:test';
import assert from 'node:assert/strict';

test('background saves modes, gates automatic senders, revalidates selection and shares the dispatch lock',async()=>{
  const handlers={},mutations=[],saved=[];
  let mode='manual',q=null,gestureId=7,foreign=false,block=false,verified=false;const order=[];
  const event=name=>({addListener:fn=>{handlers[name]=fn;}});
  const snapshot=()=>({source:'resource',target:349641,occupied:false,presets:[{pos:1}],panel:{preset:1,soldiers:'10'},
    queues:q?[q]:[],boostInventory:10,blockingWindows:[]});
  globalThis.chrome={
    storage:{local:{get:async()=>({activationMode:mode}),set:async value=>{mode=value.activationMode;handlers.storage?.({activationMode:{newValue:mode}},'local');}},
      session:{set:async value=>saved.push(structuredClone(value))},onChanged:event('storage')},
    runtime:{id:'test-extension',getURL:path=>'https://extension.invalid/'+path,onInstalled:event('installed'),onMessage:event('message')},
    action:{onClicked:event('click'),setTitle:async()=>{},setBadgeBackgroundColor:async()=>{},setBadgeText:async()=>{}},
    commands:{onCommand:event('command')},
    tabs:{onUpdated:event('updated'),onRemoved:event('removed'),get:async id=>({id,url:'https://game.gtarcade.com/game',active:true}),query:async()=>[]},
    scripting:{executeScript:async injection=>{
      if(injection.target.allFrames)return [{result:true,documentId:foreign?'other':'unity',frameId:1}];
      const command=injection.args?.[1];let result={};order.push(command);
      if(command==='inspect'&&injection.args[3]===true)verified=true;
      if(['open','preset','dispatch','boost'].includes(command))assert.equal(verified,true,'full hash verification must precede mutations');
      if(command==='inspect')result=snapshot();
      if(command==='selectionGesture')result={gesture:{id:7,before:{source:'none',focused:true,blockingWindows:[]}}};
      if(command==='selection')result={source:'resource',target:349641,occupied:false,gestureId,focused:true,blockingWindows:block?['CastleWindow']:[]};
      if(command==='open'){mutations.push(command);}
      if(command==='preset')mutations.push(command);
      if(command==='dispatch'){mutations.push(command);q={uid:'42',marchId:'1234567890123456',target:'349641',subType:7};}
      if(command==='progress')result=snapshot();
      // Opening normally changes the panel source for the runner.
      if(command==='inspect'&&mutations.includes('open'))result.source='dispatch';
      return [{documentId:injection.target.documentIds[0],result}];
    }}
  };
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>({})});
  const tab={id:2,url:'https://game.gtarcade.com/game',active:true};
  const sender={id:'test-extension',url:'https://logins-gotpc.gtarcade.com/login/game',documentId:'unity',tab};
  const options={id:'test-extension',url:'https://extension.invalid/status.html'};
  const message=(value,from)=>new Promise(resolve=>handlers.message(value,from,resolve));
  try {
    const {start}=await import('./background.js');
    assert.equal((await message({type:'autoRun'},sender)).ok,false);
    assert.equal((await message({type:'setActivationMode',mode:'invalid'},options)).ok,false);
    assert.equal(mode,'manual');
    assert.equal((await message({type:'setActivationMode',mode:'selection'},options)).ok,true);
    assert.equal(mode,'selection');assert.equal(mutations.length,0);
    assert.equal((await message({type:'autoPrepare'},sender)).ok,true);assert.equal(mutations.length,0);
    assert.equal((await message({type:'autoRun'},{...sender,url:'https://evil.test'})).ok,false);
    foreign=true;await start(tab,sender);assert.equal(mutations.length,0);foreign=false;
    block=true;await start(tab,sender);assert.equal(mutations.length,0);block=false;
    gestureId=8;await start(tab,sender);assert.equal(mutations.length,0);gestureId=7;
    verified=false;order.length=0;
    const running=start(tab,sender);await start(tab,sender);await running;
    assert.ok(order.indexOf('selectionGesture')<order.indexOf('inspect'),'claim click before full inspection/hash');
    assert.deepEqual(mutations,['open','preset','dispatch']);
    assert.equal(saved.at(-1).state.result.arrived,true);
    assert.equal((await message({type:'stop'},options)).ok,true);assert.equal(mode,'manual');
    await start(tab,sender);assert.equal(mutations.length,3);
  } finally {globalThis.fetch=originalFetch;delete globalThis.chrome;}
});
