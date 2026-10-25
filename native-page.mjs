// Serialized into the game's default execution context. No memory writes,
// credential access, packet construction, or arbitrary caller-supplied pointers.
export async function nativeInPage(profile, command, args = {}, verifyHash = true, transportEnvelope = false) {
  try {
  const m=window.gameInstance?.Module;
  if (!m?.HEAPU8 || !m.HEAPU32 || !m.asm?.__indirect_function_table) throw new Error('Unity is not ready.');
  if (!m.wasmBinary || m.wasmBinary.byteLength!==profile.wasmBytes) throw new Error('Incompatible game version. Native operations stopped.');
  if (verifyHash) {
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',m.wasmBinary))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if (hash!==profile.wasmSha256) throw new Error('Game fingerprint mismatch. Native operations stopped.');
  }
  const bytes=()=>m.HEAPU8;
  const range=(p,size=4)=>{ if (!Number.isInteger(p)||p<4||p+size>bytes().byteLength) throw new Error('Invalid game data pointer.'); return p; };
  const u32=p=>new DataView(bytes().buffer).getUint32(range(p),true);
  const i32=p=>new DataView(bytes().buffer).getInt32(range(p),true);
  const u16=p=>new DataView(bytes().buffer).getUint16(range(p,2),true);
  const u8=p=>bytes()[range(p,1)];
  const i64=p=>new DataView(bytes().buffer).getBigInt64(range(p,8),true).toString();
  const cstr=p=>{
    range(p,1);let end=p;while(end<p+180&&end<bytes().length&&bytes()[end])end++;
    if(end===p+180)throw new Error('Class name is too long.');
    return new TextDecoder().decode(bytes().subarray(p,end));
  };
  const str=p=>{
    if(!p)return '';const length=i32(p+8);if(length<0||length>256)throw new Error('Invalid string length.');
    range(p+12,length*2);return new TextDecoder('utf-16le').decode(bytes().subarray(p+12,p+12+length*2));
  };
  const layout=profile.classLayout;
  const className=object=>cstr(u32(u32(object)+layout.name));
  const assertClass=(object,name)=>{
    if(!object)throw new Error(`Game object ${name} is not ready.`);
    const actual=className(object);
    if(actual!==name)throw new Error(`Game object ${name} class mismatch (got ${actual}).`);
    return object;
  };
  const staticFields=name=>{
    const klass=u32(profile.types[name]);
    if(cstr(u32(klass+layout.name))!==name||cstr(u32(klass+layout.namespace))!=='Yoozoo.Mars.Got' && name!=='WarHallPlugin')throw new Error('Game class version mismatch.');
    return u32(klass+layout.staticFields);
  };
  const singleton=name=>assertClass(u32(staticFields(name)),name);
  const list=p=>{
    if(!p)return [];const count=i32(p+12),array=u32(p+8);
    if(count<0||count>500)throw new Error('Invalid game list count.');
    if(!count)return []; if(count>u32(array+12))throw new Error('Invalid list capacity.');
    return Array.from({length:count},(_,i)=>u32(array+16+i*4));
  };
  const dictionary=(p,longKey=false)=>{
    if(!p)return [];const count=i32(p+16),entries=u32(p+12);
    if(count<0||count>12000)throw new Error('Invalid game dictionary count.');
    if(!count)return [];if(count>u32(entries+12))throw new Error('Invalid dictionary capacity.');
    const rows=[],stride=longKey?24:16;
    for(let i=0;i<count;i++){
      const e=entries+16+i*stride;if(i32(e)<0)continue;
      const value=u32(e+(longKey?16:12));if(value)rows.push({key:longKey?i64(e+8):i32(e+8),value});
    }
    return rows;
  };
  const gameStatics=staticFields('GotGame');
  const data=assertClass(u32(gameStatics+24),'Data');
  const gui=assertClass(u32(gameStatics+36),'GotGuiManager');
  const windows=()=>dictionary(u32(gui+32)).map(r=>r.value);
  const visible=name=>{
    const found=windows().filter(p=>className(p)===name&&u8(p+36));
    if(found.length>1)throw new Error('Multiple target windows are open.');return found[0]||0;
  };
  const method=(object,key)=>{
    const spec=profile.methods[key];assertClass(object,spec.class);
    const klass=u32(object),count=u16(klass+layout.methodCount),array=u32(klass+layout.methods);
    if(count>500)throw new Error('Invalid method count.');
    const found=[];
    for(let i=0;i<count;i++){
      const p=u32(array+i*4);
      if(cstr(u32(p+12))===spec.name&&u8(p+46)===spec.args)found.push(p);
    }
    if(found.length!==1||u32(found[0])!==spec.slot)throw new Error(`Native entry ${spec.name} version mismatch.`);
    const fn=m.asm.__indirect_function_table.get(spec.slot);
    if(typeof fn!=='function'||fn.length!==spec.arity)throw new Error('Native method parameter mismatch.');
    return {pointer:found[0],fn};
  };
  const invoke=(object,key,values)=>{const entry=method(object,key);return entry.fn(object,...values,entry.pointer);};
  const presets=()=>{
    const war=singleton('WarHallPlugin');
    const normal=dictionary(u32(war+16)).find(row=>row.key===0);
    if(!normal)return [];
    return dictionary(normal.value).map(({value:p})=>{
    assertClass(p,'ArmyFormationInfo');
    return {pos:i32(p+8),name:str(u32(p+12)),formationId:i32(p+24),
      soldiers:list(u32(p+20)).map(s=>({id:i32(s+8),count:i32(s+12)}))};
    }).filter(p=>p.pos>0&&(p.name||p.soldiers.some(s=>s.count>0))).sort((a,b)=>a.pos-b.pos);
  };
  const queues=()=>{
    const qd=assertClass(u32(data+52),'QueueData');
    return dictionary(u32(qd+8),true).map(({value:q})=>{
      assertClass(q,'QueueVo');return {uid:i64(q+8),mainType:i32(q+20),subType:i32(q+24),
        speedupSeconds:i32(q+40),start:i32(q+36),finish:i32(q+44),marchId:i64(q+72),target:i64(q+80),warType:i32(q+120)};
    }).filter(q=>q.mainType===11&&q.warType===0);
  };
  const inventory=itemId=>{
    const bag=assertClass(u32(data+100),'BagData');
    const row=dictionary(u32(bag+12)).find(r=>r.key===itemId);if(!row)return 0;
    assertClass(row.value,'ItemVO');const item=assertClass(u32(row.value+8),'DisplayItem');
    if(i32(item+12)!==itemId)throw new Error('Inconsistent item data.');return i32(item+16);
  };
  const panel=()=>{
    const p=visible('SendtrooppanelWindow');if(!p)return null;
    const s=assertClass(u32(p+52),'ShowViewParam');
    const kind=i32(s+24)===0&&i32(s+176)===2?'resource':i32(s+24)===2&&i32(s+176)===4?'castle':null;
    if(!kind||i32(s+192)!==0||u8(s+257)||u8(s+186))throw new Error('The current dispatch panel is not for ordinary resource gathering or castle attack.');
    return {object:p,kind,target:i32(s+156),preset:i32(p+184),soldiers:i64(p+112),show:s};
  };
  const resource=(allowPending=false)=>{
    const p=visible('ResourcesInfoWindow');if(!p)return null;
    const paramPointer=u32(p+60);
    if(!paramPointer && allowPending)return {pending:true};
    const param=assertClass(paramPointer,'ResourcesInfoParam');
    const serverPointer=u32(param+20);
    if(!serverPointer && allowPending)return {pending:true};
    const server=assertClass(serverPointer,'WorldMapObject');
    return {object:p,target:i32(server+8),occupied:i64(server+24)!=='0'};
  };
  const castle=(allowPending=false)=>{
    const p=visible('CastleInfoWindow');if(!p)return null;
    const paramPointer=u32(p+56);if(!paramPointer&&allowPending)return {pending:true};
    const param=assertClass(paramPointer,'CastleInfoParam');
    const serverPointer=u32(param+24);if(!serverPointer&&allowPending)return {pending:true};
    const server=assertClass(serverPointer,'WorldCastle');
    if(!u8(param+36)||i32(param+32)!==4||u8(p+64)||i32(p+100)!==0||u8(p+104))
      throw new Error('Only ordinary other-player castles are supported.');
    return {object:p,target:i32(server+8),occupied:false};
  };
  const selected=(allowPending=false)=>{
    const r=resource(allowPending),c=castle(allowPending);
    if(r&&c)throw new Error('Multiple target windows are open.');
    return r?{...r,kind:'resource'}:c?{...c,kind:'castle'}:null;
  };
  const blockingWindows=()=>windows().filter(p=>u8(p+36)).map(className).filter(name=>![
    'MainUiView','MiniMapWindow','ExitGuideWindow','ResourcesInfoWindow','CastleInfoWindow','SendtrooppanelWindow','WorldMarchInfo'
  ].includes(name));
  const snapshot=()=>{
    const p=panel(),r=p?null:selected();
    return {build:profile.build,source:p?'dispatch':r?r.kind:'none',target:p?.target||r?.target||null,
      kind:p?.kind||r?.kind||null,occupied:!!r?.occupied,panel:p?{preset:p.preset,soldiers:p.soldiers}:null,
      presets:presets(),queues:queues(),boostInventory:inventory(10303),blockingWindows:blockingWindows()};
  };
  if(command==='selection') {
    const dispatch=!!visible('SendtrooppanelWindow');
    const r=dispatch?null:selected(true);
    return {source:dispatch?'dispatch':r?.pending?'pending':r?r.kind:'none',
      target:r?.target||null,occupied:!!r?.occupied,blockingWindows:blockingWindows(),focused:document.hasFocus(),
      gestureId:window.__gtSelectionWatch?.gesture?.id||null};
  }
  if(command==='watchSelection') {
    window.__gtSelectionWatch?.dispose();
    let down=null,sequence=0;
    const watch={gesture:null,dispose:null};
    const valid=e=>e.isTrusted && e.button===0 && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey &&
      document.hasFocus() && e.target?.id==='unity-canvas';
    const pointerdown=e=>{
      if(!e.isTrusted)return;
      watch.gesture=null;down=null;
      if(!valid(e))return;
      // selection executes synchronously before its promise resolves, before Unity
      // processes the pointer event. Re-read roots each time; do not retain pointers.
      down={id:++sequence,pointerId:e.pointerId,x:e.clientX,y:e.clientY,moved:false,
        before:nativeInPage(profile,'selection',{},false).catch(()=>null)};
    };
    const pointermove=e=>{if(e.isTrusted && down && e.pointerId===down.pointerId &&
      Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)down.moved=true;};
    const pointerup=e=>{
      if(!e.isTrusted)return;
      const d=down;down=null;
      if(!d||!valid(e)||d.pointerId!==e.pointerId||d.moved||Math.hypot(e.clientX-d.x,e.clientY-d.y)>8)return;
      watch.gesture={id:d.id,before:d.before,at:performance.now(),claimed:false};
    };
    const reset=()=>{down=null;watch.gesture=null;};
    // Captured element blur also reaches window. Only leaving the window cancels the gesture.
    const blur=e=>{if(e.target===window)reset();};
    watch.dispose=()=>{
      for(const [name,fn] of [['pointerdown',pointerdown],['pointermove',pointermove],['pointerup',pointerup],['pointercancel',reset],['blur',blur]])
        window.removeEventListener(name,fn,true);
      reset();
    };
    for(const [name,fn] of [['pointerdown',pointerdown],['pointermove',pointermove],['pointerup',pointerup],['pointercancel',reset],['blur',blur]])
      window.addEventListener(name,fn,true);
    window.__gtSelectionWatch=watch;
    return {ready:true};
  }
  if(command==='selectionGesture') {
    const g=window.__gtSelectionWatch?.gesture;
    if(!g||g.claimed||performance.now()-g.at>2000)return {gesture:null};
    g.claimed=true;
    return {gesture:{id:g.id,before:await g.before}};
  }
  if(command==='verify') {method(singleton('QueuePlugin'),'boost');return {build:profile.build,verified:true};}
  if(command==='progress') {
    return {queues:queues(),boostInventory:inventory(10303),blockingWindows:blockingWindows()};
  }
  if(command==='inspect'){
    // Validate singleton entry now; window methods are checked when those windows exist.
    method(singleton('QueuePlugin'),'boost');
    const p=panel(),r=p?null:selected();if(p){method(p.object,'preset');method(p.object,'dispatch');}if(r)method(r.object,r.kind==='castle'?'attack':'collect');
    return snapshot();
  }
  const blockers=blockingWindows();
  if(blockers.length)throw new Error(`Resolve the blocking game dialogs first (${blockers.join(', ')}).`);
  if(command==='open'){
    const r=selected();if(!r||r.target!==args.target||(args.kind&&r.kind!==args.kind))throw new Error('Select a resource building and read the state again.');
    if(r.occupied)throw new Error('This resource point already has a march. Select an available resource point.');
    invoke(r.object,r.kind==='castle'?'attack':'collect',r.kind==='castle'?[]:[0]);return {sent:true};
  }
  if(command==='preset'){
    const p=panel();if(!p||(args.kind&&p.kind!==args.kind)||p.target!==args.target)throw new Error('The dispatch target changed or the panel is not open.');
    if(!Number.isInteger(args.preset)||!presets().some(x=>x.pos===args.preset))throw new Error('The selected army preset does not exist.');
    // Same ClearCommanderBtn -> setPerInfoShow path as onChangePerChooseCer.
    method(p.object,'clear');method(p.object,'preset');
    const heroes=u32(p.object+252),dragons=u32(p.object+256);
    invoke(p.object,'clear',[]);invoke(p.object,'preset',[args.preset,heroes,dragons]);
    const updated=panel();
    if(!updated||updated.preset!==args.preset)throw new Error('The game has not applied the selected preset. Stopped.');
    return snapshot();
  }
  if(command==='dispatch'){
    const p=panel();if(!p||(args.kind&&p.kind!==args.kind)||p.target!==args.target||p.preset!==args.preset||BigInt(p.soldiers)<=0n)throw new Error('Target, preset, or troop validation failed.');
    invoke(p.object,'dispatch',[0]);return {sent:true};
  }
  if(command==='boost'){
    if(!profile.allowedBoostItems.includes(args.itemId)||args.count!==1)throw new Error('Unsupported speedup item or quantity.');
    const q=queues().find(q=>q.uid===args.queueId&&q.marchId===args.marchId&&q.target===String(args.target)&&q.subType===1);
    if(!q||!/^\d+$/.test(q.uid)||Number(q.uid)>2147483647)throw new Error('The specified march has ended or does not match this gathering run.');
    if(inventory(args.itemId)<1)throw new Error('Insufficient speedup items.');
    invoke(singleton('QueuePlugin'),'boost',[Number(q.uid),args.itemId,1]);return {sent:true};
  }
  throw new Error('Unsupported native operation.');
  } catch (error) {
    // executeScript may omit uncaught exception details; return an explicit failure.
    if (transportEnvelope) return {__gtError: String(error.message || error)};
    throw error;
  }
}
