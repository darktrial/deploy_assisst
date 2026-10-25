// Serialized into the game's default execution context. No memory writes,
// credential access, packet construction, or arbitrary caller-supplied pointers.
export async function nativeInPage(profile, command, args = {}, verifyHash = true) {
  const m=window.gameInstance?.Module;
  if (!m?.HEAPU8 || !m.HEAPU32 || !m.asm?.__indirect_function_table) throw new Error('Unity 尚未就緒。');
  if (!m.wasmBinary || m.wasmBinary.byteLength!==profile.wasmBytes) throw new Error('遊戲版本不相容，停止原生操作。');
  if (verifyHash) {
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',m.wasmBinary))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if (hash!==profile.wasmSha256) throw new Error('遊戲程式指紋不符，停止原生操作。');
  }
  const bytes=()=>m.HEAPU8;
  const range=(p,size=4)=>{ if (!Number.isInteger(p)||p<4||p+size>bytes().byteLength) throw new Error('遊戲資料指標無效。'); return p; };
  const u32=p=>new DataView(bytes().buffer).getUint32(range(p),true);
  const i32=p=>new DataView(bytes().buffer).getInt32(range(p),true);
  const u16=p=>new DataView(bytes().buffer).getUint16(range(p,2),true);
  const u8=p=>bytes()[range(p,1)];
  const i64=p=>new DataView(bytes().buffer).getBigInt64(range(p,8),true).toString();
  const cstr=p=>{
    range(p,1);let end=p;while(end<p+180&&end<bytes().length&&bytes()[end])end++;
    if(end===p+180)throw new Error('類別名稱過長。');
    return new TextDecoder().decode(bytes().subarray(p,end));
  };
  const str=p=>{
    if(!p)return '';const length=i32(p+8);if(length<0||length>256)throw new Error('文字長度異常。');
    range(p+12,length*2);return new TextDecoder('utf-16le').decode(bytes().subarray(p+12,p+12+length*2));
  };
  const layout=profile.classLayout;
  const className=object=>cstr(u32(u32(object)+layout.name));
  const assertClass=(object,name)=>{if(!object||className(object)!==name)throw new Error(`遊戲物件 ${name} 未就緒。`);return object;};
  const staticFields=name=>{
    const klass=u32(profile.types[name]);
    if(cstr(u32(klass+layout.name))!==name||cstr(u32(klass+layout.namespace))!=='Yoozoo.Mars.Got' && name!=='WarHallPlugin')throw new Error('遊戲類別版本不符。');
    return u32(klass+layout.staticFields);
  };
  const singleton=name=>assertClass(u32(staticFields(name)),name);
  const list=p=>{
    if(!p)return [];const count=i32(p+12),array=u32(p+8);
    if(count<0||count>500)throw new Error('遊戲清單數量異常。');
    if(!count)return []; if(count>u32(array+12))throw new Error('清單容量異常。');
    return Array.from({length:count},(_,i)=>u32(array+16+i*4));
  };
  const dictionary=(p,longKey=false)=>{
    if(!p)return [];const count=i32(p+16),entries=u32(p+12);
    if(count<0||count>12000)throw new Error('遊戲資料表數量異常。');
    if(!count)return [];if(count>u32(entries+12))throw new Error('資料表容量異常。');
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
    if(found.length>1)throw new Error('同時存在多個目標視窗。');return found[0]||0;
  };
  const method=(object,key)=>{
    const spec=profile.methods[key];assertClass(object,spec.class);
    const klass=u32(object),count=u16(klass+layout.methodCount),array=u32(klass+layout.methods);
    if(count>500)throw new Error('方法數量異常。');
    const found=[];
    for(let i=0;i<count;i++){
      const p=u32(array+i*4);
      if(cstr(u32(p+12))===spec.name&&u8(p+46)===spec.args)found.push(p);
    }
    if(found.length!==1||u32(found[0])!==spec.slot)throw new Error(`原生入口 ${spec.name} 與版本不符。`);
    const fn=m.asm.__indirect_function_table.get(spec.slot);
    if(typeof fn!=='function'||fn.length!==spec.arity)throw new Error('原生方法參數不符。');
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
    if(i32(item+12)!==itemId)throw new Error('道具資料不一致。');return i32(item+16);
  };
  const panel=()=>{
    const p=visible('SendtrooppanelWindow');if(!p)return null;
    const s=assertClass(u32(p+52),'ShowViewParam');
    if(i32(s+24)!==0||i32(s+176)!==2||i32(s+192)!==0||u8(s+257)||u8(s+186))throw new Error('目前出征面板不是一般資源採集。');
    return {object:p,target:i32(s+156),preset:i32(p+184),soldiers:i64(p+112),show:s};
  };
  const resource=()=>{
    const p=visible('ResourcesInfoWindow');if(!p)return null;
    const param=assertClass(u32(p+60),'ResourcesInfoParam'),server=assertClass(u32(param+20),'WorldMapObject');
    return {object:p,target:i32(server+8),occupied:i64(server+24)!=='0'};
  };
  const blockingWindows=()=>windows().filter(p=>u8(p+36)).map(className).filter(name=>![
    'MainUiView','MiniMapWindow','ExitGuideWindow','ResourcesInfoWindow','SendtrooppanelWindow','WorldMarchInfo'
  ].includes(name));
  const snapshot=()=>{
    const p=panel(),r=resource();
    return {build:profile.build,source:p?'dispatch':r?'resource':'none',target:p?.target||r?.target||null,
      occupied:!!r?.occupied,panel:p?{preset:p.preset,soldiers:p.soldiers}:null,
      presets:presets(),queues:queues(),boostInventory:inventory(10303),blockingWindows:blockingWindows()};
  };
  if(command==='inspect'){
    // Validate singleton entry now; window methods are checked when those windows exist.
    method(singleton('QueuePlugin'),'boost');
    const p=panel(),r=resource();if(p){method(p.object,'preset');method(p.object,'dispatch');}if(r)method(r.object,'collect');
    return snapshot();
  }
  const blockers=blockingWindows();
  if(blockers.length)throw new Error(`遊戲有其他提示視窗（${blockers.join('、')}），請先處理。`);
  if(command==='open'){
    const r=resource();if(!r||r.target!==args.target)throw new Error('請先選好資源建築物，並重新讀取狀態。');
    if(r.occupied)throw new Error('此資源點已有行軍，請改選可採集的資源點。');
    invoke(r.object,'collect',[0]);return {sent:true};
  }
  if(command==='preset'){
    const p=panel();if(!p||p.target!==args.target)throw new Error('出征目標已改變或面板尚未開啟。');
    if(!Number.isInteger(args.preset)||!presets().some(x=>x.pos===args.preset))throw new Error('所選 army preset 不存在。');
    // Same ClearCommanderBtn -> setPerInfoShow path as onChangePerChooseCer.
    method(p.object,'clear');method(p.object,'preset');
    const heroes=u32(p.object+252),dragons=u32(p.object+256);
    invoke(p.object,'clear',[]);invoke(p.object,'preset',[args.preset,heroes,dragons]);
    const updated=panel();
    if(!updated||updated.preset!==args.preset)throw new Error('遊戲尚未套用指定 preset，已停止。');
    return snapshot();
  }
  if(command==='dispatch'){
    const p=panel();if(!p||p.target!==args.target||p.preset!==args.preset||BigInt(p.soldiers)<=0n)throw new Error('目標、preset 或兵力檢查未通過。');
    invoke(p.object,'dispatch',[0]);return {sent:true};
  }
  if(command==='boost'){
    if(!profile.allowedBoostItems.includes(args.itemId)||args.count!==1)throw new Error('不支援的加速道具或數量。');
    const q=queues().find(q=>q.uid===args.queueId&&q.marchId===args.marchId&&q.target===String(args.target)&&q.subType===1);
    if(!q||!/^\d+$/.test(q.uid)||Number(q.uid)>2147483647)throw new Error('指定行軍已結束或不是本次採集行軍。');
    if(inventory(args.itemId)<1)throw new Error('加速道具不足。');
    invoke(singleton('QueuePlugin'),'boost',[Number(q.uid),args.itemId,1]);return {sent:true};
  }
  throw new Error('不支援的原生操作。');
}
