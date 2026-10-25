import test from 'node:test';
import assert from 'node:assert/strict';
import {TrafficObserver, safeUrl, safeText, payload, LIMITS} from './observer.mjs';

function harness(options={}) {
  let clock=1000, saved, detached=0, ended=0;
  const commands=[];
  const observer=new TrafficObserver({
    command:async(source,method,params)=>{
      commands.push({source,method,params});
      if (options.command) return options.command(source,method,params);
      if (method==='Network.getResponseBody') return {body:'{"marchId":42,"token":"private"}',base64Encoded:false};
      return {};
    },
    attach:async()=>{},detach:async()=>{detached++;},persist:async data=>{saved=structuredClone(data);},onEnd:()=>{ended++;},now:()=>clock,
    limits:{...LIMITS,...options.limits}
  });
  return {observer,commands,tick:ms=>{clock+=ms;},saved:()=>saved,detached:()=>detached,ended:()=>ended};
}
const root={tabId:7};
const frame=(observer,method='Network.webSocketFrameSent',sessionId)=>observer.onEvent({...root,...(sessionId?{sessionId}:{})},method,{requestId:'socket-1',timestamp:10,response:{opcode:2,payloadData:'AQIDBA=='}});

test('URLs and recognized text credentials are removed while gameplay IDs remain',()=>{
  assert.equal(safeUrl('wss://user:pass@game.example/socket?user_token=secret#hidden'),'wss://game.example/socket');
  const clean=JSON.parse(safeText(JSON.stringify({marchId:42,presetId:2,token:'private',nested:{password:'hidden'},url:'https://game.example/x?key=hidden',authorization:'Bearer private'})));
  assert.deepEqual(clean,{marchId:42,presetId:2,token:'[REDACTED]',nested:{password:'[REDACTED]'},url:'https://game.example/x',authorization:'[REDACTED]'});
  assert.equal(safeText('user_token=secret&marchId=42'),'user_token=[REDACTED]&marchId=42');
});
test('binary capture is optional, base64 is preserved and truncation is explicit',()=>{
  assert.equal(payload('AQIDBA==',true,false).omitted,true);
  assert.equal(payload('AQIDBA==',true,true).data,'AQIDBA==');
  const cut=payload('AQIDBA==',true,true,5);
  assert.equal(cut.data,'AQID'); assert.equal(cut.truncated,true); assert.equal(cut.originalChars,8);
});
test('manual phases correlate outbound and inbound frames and child sessions',async()=>{
  const h=harness(), o=h.observer; await o.start(7,true);
  o.onEvent(root,'Network.webSocketCreated',{requestId:'socket-1',url:'wss://game.example/x?token=private'});
  h.tick(3000); o.mark('preset','army preset 2'); frame(o);
  h.tick(80); frame(o,'Network.webSocketFrameReceived');
  o.mark('march'); frame(o,'Network.webSocketFrameSent','child');
  o.onEvent({tabId:99},'Network.webSocketFrameSent',{response:{opcode:2,payloadData:'ignored'}});
  await o.stop();
  const events=h.saved().events;
  assert.equal(events.find(e=>e.kind==='ws_send').stage,'preset');
  assert.equal(events.find(e=>e.kind==='ws_receive').elapsedMs,3080);
  assert.equal(events.filter(e=>e.kind==='ws_send').length,2);
  assert.equal(events.find(e=>e.session==='child').url,null);
  assert.equal(JSON.stringify(h.saved()).includes('private'),false);
  assert.equal(h.detached(),1); assert.equal(h.ended(),1);
  assert.equal(h.commands.some(c=>/Input\.|Fetch\.|Runtime\.|replay|setExtraHTTPHeaders/i.test(c.method)),false);
});
test('HTTP bodies are retrieved after loading, stripped of secrets and ignore static assets',async()=>{
  const h=harness(),o=h.observer; await o.start(7,false);
  o.mark('march');
  o.onEvent(root,'Network.requestWillBeSent',{requestId:'r1',type:'Fetch',timestamp:10,request:{url:'https://game.example/api?token=hidden',method:'POST',headers:{Authorization:'private'},postData:'{"preset":2,"token":"hidden"}',hasPostData:true}});
  o.onEvent(root,'Network.responseReceived',{requestId:'r1',type:'Fetch',response:{url:'https://game.example/api?token=hidden',status:200,mimeType:'application/json',headers:{'set-cookie':'private'}}});
  o.onEvent(root,'Network.loadingFinished',{requestId:'r1',timestamp:11,encodedDataLength:100});
  o.onEvent(root,'Network.requestWillBeSent',{requestId:'image',type:'Image',request:{url:'https://game.example/x.png'}});
  await o.stop();
  const data=h.saved();
  assert.equal(data.events.find(e=>e.kind==='http_body').payload.data,'{"marchId":42,"token":"[REDACTED]"}');
  assert.equal(data.events.find(e=>e.kind==='http_request').postData.data,'{"preset":2,"token":"[REDACTED]"}');
  assert.equal(JSON.stringify(data).includes('hidden'),false);
  assert.equal(JSON.stringify(data).includes('private'),false);
  assert.equal(h.commands.filter(c=>c.method==='Network.getResponseBody').length,1);
});
test('nested iframe and worker targets enable Network in the correct flat session',async()=>{
  const h=harness(),o=h.observer; await o.start(7,true);
  o.onEvent(root,'Target.attachedToTarget',{sessionId:'iframe',targetInfo:{type:'iframe',url:'https://game.example/game?token=hidden'}});
  o.onEvent({tabId:7,sessionId:'iframe'},'Target.attachedToTarget',{sessionId:'worker',targetInfo:{type:'worker',url:'https://game.example/worker.js'}});
  await Promise.all([...o.pending]);
  await o.stop();
  for (const session of ['iframe','worker']) {
    assert.ok(h.commands.some(c=>c.source.sessionId===session && c.method==='Network.enable'));
    assert.ok(h.commands.some(c=>c.source.sessionId===session && c.method==='Target.setAutoAttach' && c.params.flatten));
  }
});
test('capture cap automatically detaches and leaves the record exportable',async()=>{
  const h=harness({limits:{events:2}}),o=h.observer; await o.start(7,true);
  frame(o); frame(o); await o.stopTask;
  assert.equal(o.status().active,false); assert.equal(h.saved().stopReason,'capture_limit');
  assert.equal(h.saved().events.length,2); assert.equal(h.detached(),1);
  frame(o); assert.equal(o.record.events.length,2);
});
test('detach preserves data; clear removes it and repeated stop is idempotent',async()=>{
  const h=harness(),o=h.observer; await o.start(7,true); frame(o);
  o.onDetach(root,'canceled_by_user'); await o.stopTask; await o.stop();
  assert.equal(h.saved().stopReason,'debugger_detached:canceled_by_user');
  assert.equal(h.detached(),0); assert.equal(h.ended(),1);
  await o.clear(); assert.equal(h.saved(),null); assert.equal(o.status().hasRecord,false);
});
test('automatic timeout stops observation',async()=>{
  const h=harness({limits:{durationMs:10}}),o=h.observer; await o.start(7,false);
  await new Promise(resolve=>setTimeout(resolve,30)); await o.stopTask;
  assert.equal(h.saved().stopReason,'time_limit');
});
test('capture failures and persistence errors remain visible',async()=>{
  const h=harness({command:async(source,method)=>{if(method==='Network.getResponseBody')throw new Error('gone');return {};}}),o=h.observer;
  await o.start(7,false);
  o.onEvent(root,'Network.responseReceived',{requestId:'r1',type:'XHR',response:{url:'https://game.example/api',status:200,mimeType:'application/json'}});
  o.onEvent(root,'Network.loadingFinished',{requestId:'r1',encodedDataLength:100});
  o.persist=async()=>{throw new Error('quota');};
  await o.stop();
  assert.ok(o.record.events.some(e=>e.kind==='capture_error'));
  assert.match(o.status().error,/save the session record/); assert.equal(o.status().hasRecord,true);
});
