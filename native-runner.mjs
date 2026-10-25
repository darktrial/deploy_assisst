export function validateNativeOptions(options) {
  if(!Number.isInteger(options.preset)||options.preset<1||options.preset>100)throw new Error('請選擇有效的 army preset。');
  if(!Number.isInteger(options.target)||options.target<=0)throw new Error('請先選好建築物並讀取狀態。');
  if(!Number.isInteger(options.boosts)||options.boosts<0||options.boosts>2)throw new Error('加速次數必須為 0–2。');
  return {preset:options.preset,target:options.target,boosts:options.boosts};
}

// Every mutation is issued once. Missing acknowledgements never cause a replay.
export async function runNative(client, options, {check,sleep,note,now=Date.now}) {
  const {preset,target,boosts}=validateNativeOptions(options);
  const inspect=async()=>{
    check();const s=await client.call('inspect');check();
    if(s.blockingWindows?.length)throw new Error(`遊戲有其他提示視窗（${s.blockingWindows.join('、')}），請先處理。`);
    return s;
  };
  const waitFor=async(predicate,description)=>{
    const deadline=now()+8000;
    while(now()<deadline){
      const s=await inspect();const result=predicate(s);if(result)return result;
      await sleep(150);
    }
    throw new Error(`${description}逾時；請檢查遊戲提示，沒有重送指令。`);
  };
  let s=await inspect();
  if(s.target!==target||s.source==='none'||s.occupied)throw new Error('目標已改變、未選取或被佔用，請重新讀取狀態。');
  if(!s.presets.some(p=>p.pos===preset))throw new Error('所選 preset 尚未載入。');
  if(boosts>s.boostInventory)throw new Error('加速道具不足。');
  const existing=new Set(s.queues.map(q=>q.uid));
  note('狀態檢查完成，開始原生流程；Alt+Shift+X 停止。');
  s=await inspect();if(s.target!==target)throw new Error('操作前目標已改變。');
  if(s.source==='resource') {
    note('沿用遊戲採集入口開啟出征面板。');
    check();await client.call('open',{target});
    await waitFor(s=>s.source==='dispatch'&&s.target===target,'開啟出征面板');
  }
  note(`套用 army preset ${preset}。`);
  check();await client.call('preset',{target,preset});
  await waitFor(s=>s.panel?.preset===preset&&s.target===target&&BigInt(s.panel.soldiers)>0n,'套用 preset');
  // Refresh the queue baseline immediately before dispatch, after preset work.
  s=await inspect();for(const q of s.queues)existing.add(q.uid);
  note('呼叫遊戲原有出征處理函式。');
  check();await client.call('dispatch',{target,preset});
  const queue=await waitFor(s=>{
    const found=s.queues.filter(q=>!existing.has(q.uid)&&q.target===String(target)&&[1,7].includes(q.subType));
    if(found.length>1)throw new Error('同時出現多支新行軍，停止自動加速。');return found[0];
  },'等待新行軍');
  note(`出征已確認：行軍 ${queue.marchId}，queue ${queue.uid}。`);
  for(let i=0;i<boosts;i++) {
    s=await inspect();
    const q=s.queues.find(q=>q.uid===queue.uid&&q.marchId===queue.marchId&&q.target===String(target));
    if(!q||q.subType!==1){note('行軍已結束或已開始採集，停止使用加速。');break;}
    const beforeSpeed=q.speedupSeconds,beforeInventory=s.boostInventory;
    if(beforeInventory<1)throw new Error('加速道具不足。');
    note(`使用加速 ${i+1}/${boosts}（道具 10303 × 1）。`);
    check();await client.call('boost',{target,queueId:q.uid,marchId:q.marchId,itemId:10303,count:1});
    await waitFor(s=>{
      const current=s.queues.find(x=>x.uid===q.uid&&x.marchId===q.marchId);
      return s.boostInventory<beforeInventory&&(!current||current.subType!==1||current.speedupSeconds>beforeSpeed);
    },'等待加速回應');
    note('已確認加速後的道具數量與行軍狀態更新。');
  }
  note('原生流程完成。');return {marchId:queue.marchId,queueId:queue.uid,target,preset};
}
