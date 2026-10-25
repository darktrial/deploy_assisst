import test from 'node:test';
import assert from 'node:assert/strict';
import {importRecording, validateSteps, sameViewport, gamePage} from './core.mjs';
const viewport = {width:1265,height:1041,pageX:0,pageY:0,scale:1,zoom:1};
const step = () => ({name:'Dispatch',enabled:true,kind:'normal',type:'click',delay:0,x:100,y:200,viewport:{...viewport}});
test('Recorder import removes secrets and requires calibration', () => {
  const imported = importRecording({title:'secret', steps:[{type:'navigate',url:'https://example.com/?user_token=secret'},{type:'click',offsetX:281,offsetY:209},{type:'doubleClick',offsetX:906,offsetY:656}]});
  assert.equal(imported.length,2);
  assert.equal(imported[0].enabled,false);
  assert.equal(imported[1].kind,'boost');
  assert.equal(JSON.stringify(imported).includes('secret'),false);
  assert.throws(() => validateSteps(imported,true),/not calibrated/);
});
test('boost clicks require explicit opt-in; duplicate clicks are not collapsed', () => {
  const boost = {...step(),kind:'boost',type:'doubleClick'};
  assert.equal(validateSteps([step(),boost,boost],false).length,1);
  assert.equal(validateSteps([step(),boost,boost],true).length,3);
});
test('invalid coordinates, delays and viewport metadata fail closed', () => {
  for (const patch of [{x:NaN},{y:1041},{x:-1},{delay:30001},{delay:-1},{delay:0.5},{viewport:null},{viewport:{...viewport,width:0}}]) {
    assert.throws(() => validateSteps([{...step(),...patch}],false));
  }
});
test('viewport changes and non-game pages are rejected', () => {
  assert.equal(sameViewport(viewport,{...viewport}),true);
  for (const key of Object.keys(viewport)) assert.equal(sameViewport(viewport,{...viewport,[key]:viewport[key]+1}),false);
  assert.equal(gamePage('https://game.gtarcade.com/game?user_token=secret'),'https://game.gtarcade.com/game');
  for (const url of ['https://evil.example/game','https://game.gtarcade.com.evil.example/game','https://game.gtarcade.com/','http://game.gtarcade.com/game']) assert.throws(() => gamePage(url));
});

test('background sends clicks, stops on focus loss, and releases mouse on cancellation', async t => {
  const handlers = {};
  const event = name => ({addListener: fn => { handlers[name] = fn; }});
  const stored = {};
  let focused = true, commands = [], cancelOnPress = false, loseFocusOnRelease = false, attached = 0, detached = 0;
  globalThis.chrome = {
    storage:{session:{get:async key=>({[key]:stored[key]}),set:async value=>Object.assign(stored,value),remove:async key=>{delete stored[key];}}},
    runtime:{id:'test',getURL:p=>`chrome-extension://test/${p}`,onMessage:event('message')},
    action:{onClicked:event('action')}, commands:{onCommand:event('command')},
    debugger:{onEvent:event('event'),onDetach:event('detach'),attach:async()=>{attached++;},detach:async()=>{detached++;},sendCommand:async(target,method,params)=>{
      commands.push({method,params});
      if (method === 'Page.getLayoutMetrics') return {cssVisualViewport:{clientWidth:1265,clientHeight:1041,pageX:0,pageY:0,offsetX:0,offsetY:0,scale:1}};
      if (method === 'Page.captureScreenshot') return {data:'test-png'};
      if (method === 'Input.dispatchMouseEvent' && params.type === 'mousePressed' && cancelOnPress) handlers.command('stop');
      if (method === 'Input.dispatchMouseEvent' && params.type === 'mouseReleased' && loseFocusOnRelease) focused=false;
      return {};
    }},
    tabs:{onUpdated:event('updated'),get:async()=>({id:1,windowId:1,url:'https://game.gtarcade.com/game',active:true,status:'complete'}),getZoom:async()=>1,update:async()=>{}},
    windows:{get:async()=>({focused}),update:async()=>{focused=true;}}
  };
  await import('./background.js');
  const request = data => new Promise(resolve => handlers.message(data,{id:'test',url:'chrome-extension://test/controller.html'},resolve));
  await t.test('observer API locks automation, accepts shortcuts and exports on stop',async()=>{
    commands=[];
    assert.equal((await request({type:'observeStart',tabId:1,includeBinary:true})).ok,true);
    assert.equal((await request({type:'capture',tabId:1})).ok,false);
    assert.equal((await request({type:'run',tabId:1,steps:[step()],allowBoost:false})).ok,false);
    handlers.command('mark-preset');
    handlers.event({tabId:1},'Network.webSocketFrameSent',{requestId:'s',response:{opcode:2,payloadData:'AQID'}});
    assert.equal((await request({type:'observeExport'})).ok,false);
    assert.equal((await request({type:'observeStop'})).ok,true);
    const record=(await request({type:'observeExport'})).data;
    assert.equal(record.events.find(e=>e.kind==='ws_send').stage,'preset');
    assert.equal(stored.trafficRecord.format,'gt-traffic-v1');
    assert.equal(commands.some(c=>c.method.startsWith('Input.')),false);
    assert.equal(attached,detached);
    assert.equal((await request({type:'observeClear'})).ok,true);
    assert.equal(stored.trafficRecord,undefined);
  });
  await t.test('calibration captures the exact viewport without sending input',async()=>{
    commands=[];
    const result = await request({type:'capture',tabId:1});
    assert.equal(result.ok,true);
    assert.equal(result.data.viewport.width,1265);
    assert.deepEqual(commands.find(c=>c.method==='Page.captureScreenshot').params.clip,{x:0,y:0,width:1265,height:1041,scale:1});
    assert.equal(commands.some(c=>c.method.startsWith('Input.')),false);
    assert.equal(attached,detached);
  });
  await t.test('focus loss prevents the next step',async()=>{
    loseFocusOnRelease=true; commands=[];
    const result = await request({type:'run',tabId:1,steps:[step(),step()],allowBoost:false});
    assert.equal(result.ok,false); assert.match(result.error,/lost focus/);
    assert.equal(commands.filter(c=>c.params?.type==='mousePressed').length,1);
    assert.equal(attached,detached);
  });
  await t.test('stop during mouse press still releases and prevents second double click',async()=>{
    loseFocusOnRelease=false; cancelOnPress=true; commands=[];
    const result = await request({type:'run',tabId:1,steps:[{...step(),type:'doubleClick'}],allowBoost:false});
    assert.equal(result.ok,false); assert.match(result.error,/stopped/);
    assert.deepEqual(commands.filter(c=>c.method==='Input.dispatchMouseEvent').map(c=>c.params.type),['mouseMoved','mousePressed','mouseReleased']);
    assert.equal(attached,detached);
    assert.equal((await request({type:'status'})).data.running,false);
  });
});
