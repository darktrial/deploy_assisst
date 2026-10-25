export function validateNativeOptions(options) {
  if(!Number.isInteger(options.preset)||options.preset<1||options.preset>100)throw new Error('Select a valid army preset.');
  if(!Number.isInteger(options.target)||options.target<=0)throw new Error('Select a building and read its state first.');
  if(!Number.isInteger(options.boosts)||options.boosts<0||options.boosts>2)throw new Error('The speedup count must be 0–2.');
  return {preset:options.preset,target:options.target,boosts:options.boosts};
}

// Every mutation is issued once. Missing acknowledgements never cause a replay.
export async function runNative(client, options, {check,sleep,note,now=Date.now}) {
  const {preset,target,boosts}=validateNativeOptions(options);
  const inspect=async()=>{
    check();const s=await client.call('inspect');check();
    if(s.blockingWindows?.length)throw new Error(`Resolve the blocking game dialogs first (${s.blockingWindows.join(', ')}).`);
    return s;
  };
  const waitFor=async(predicate,description)=>{
    const deadline=now()+8000;
    while(now()<deadline){
      const s=await inspect();const result=predicate(s);if(result)return result;
      await sleep(150);
    }
    throw new Error(`${description} timed out. Check the game dialogs; the command was not resent.`);
  };
  let s=await inspect();
  if(s.target!==target||s.source==='none'||s.occupied)throw new Error('The target changed, is not selected, or is occupied. Read the state again.');
  if(!s.presets.some(p=>p.pos===preset))throw new Error('The selected preset is not loaded.');
  if(boosts>s.boostInventory)throw new Error('Insufficient speedup items.');
  const existing=new Set(s.queues.map(q=>q.uid));
  note('Starting native workflow in 3 seconds; Alt+Shift+S to stop.');await sleep(3000);
  s=await inspect();if(s.target!==target)throw new Error('The target changed during the countdown.');
  if(s.source==='resource') {
    note('Opening the dispatch panel through the native gathering entry.');
    check();await client.call('open',{target});
    await waitFor(s=>s.source==='dispatch'&&s.target===target,'Opening dispatch panel');
  }
  note(`Applying army preset ${preset}.`);
  check();await client.call('preset',{target,preset});
  await waitFor(s=>s.panel?.preset===preset&&s.target===target&&BigInt(s.panel.soldiers)>0n,'Applying preset');
  // Refresh the queue baseline immediately before dispatch, after preset work.
  s=await inspect();for(const q of s.queues)existing.add(q.uid);
  note('Calling the native dispatch handler.');
  check();await client.call('dispatch',{target,preset});
  const queue=await waitFor(s=>{
    const found=s.queues.filter(q=>!existing.has(q.uid)&&q.target===String(target)&&[1,7].includes(q.subType));
    if(found.length>1)throw new Error('Multiple new marches appeared. Automatic speedups stopped.');return found[0];
  },'Waiting for new march');
  note(`Dispatch confirmed: march ${queue.marchId}, queue ${queue.uid}.`);
  for(let i=0;i<boosts;i++) {
    s=await inspect();
    const q=s.queues.find(q=>q.uid===queue.uid&&q.marchId===queue.marchId&&q.target===String(target));
    if(!q||q.subType!==1){note('The march ended or gathering started. Speedups stopped.');break;}
    const beforeSpeed=q.speedupSeconds,beforeInventory=s.boostInventory;
    if(beforeInventory<1)throw new Error('Insufficient speedup items.');
    note(`Using speedup ${i+1}/${boosts} (item 10303 × 1).`);
    check();await client.call('boost',{target,queueId:q.uid,marchId:q.marchId,itemId:10303,count:1});
    await waitFor(s=>{
      const current=s.queues.find(x=>x.uid===q.uid&&x.marchId===q.marchId);
      return s.boostInventory<beforeInventory&&(!current||current.subType!==1||current.speedupSeconds>beforeSpeed);
    },'Waiting for speedup acknowledgement');
    note('Speedup inventory and march state updates confirmed.');
  }
  note('Native workflow completed.');return {marchId:queue.marchId,queueId:queue.uid,target,preset};
}
