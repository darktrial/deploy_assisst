export function validateNativeOptions(options) {
  if(!Number.isInteger(options.preset)||options.preset<1||options.preset>100)throw new Error('Select a valid army preset.');
  if(!Number.isInteger(options.target)||options.target<=0)throw new Error('Select a building and read its state first.');
  if(options.remainingSeconds!==undefined && (options.remainingSeconds!==1 || options.boosts!==undefined))throw new Error('The automatic speedup threshold must be 1 second and cannot be combined with a fixed count.');
  if(options.remainingSeconds===undefined && (!Number.isInteger(options.boosts)||options.boosts<0||options.boosts>2))throw new Error('The speedup count must be 0–2.');
  return {preset:options.preset,target:options.target,boosts:options.boosts,remainingSeconds:options.remainingSeconds};
}

// Every mutation is issued once. Missing acknowledgements never cause a replay.
export async function runNative(client, options, {check,sleep,note,now=()=>performance.now()}) {
  const {preset,target,boosts,remainingSeconds}=validateNativeOptions(options);
  const inspect=async(command='inspect')=>{
    check();const s=await client.call(command);check();
    if(s.blockingWindows?.length)throw new Error(`Resolve the blocking game dialogs first (${s.blockingWindows.join(', ')}).`);
    return s;
  };
  const waitFor=async(predicate,description,command='inspect')=>{
    const deadline=now()+8000;
    while(now()<deadline){
      const s=await inspect(command);const result=predicate(s);if(result)return result;
      await sleep(150);
    }
    throw new Error(`${description} timed out. Check the game dialogs; the command was not resent.`);
  };
  let s=await inspect();
  if(s.target!==target||s.source==='none'||s.occupied)throw new Error('The target changed, is not selected, or is occupied. Read the state again.');
  if(!s.presets.some(p=>p.pos===preset))throw new Error('The selected preset is not loaded.');
  if(boosts>s.boostInventory)throw new Error('Insufficient speedup items.');
  const existing=new Set(s.queues.map(q=>q.uid));
  note('State checks passed. Starting native workflow; Alt+Shift+X to stop.');
  s=await inspect();if(s.target!==target)throw new Error('The target changed before execution.');
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
  },'Waiting for new march','progress');
  note(`Dispatch confirmed: march ${queue.marchId}, queue ${queue.uid}.`);
  const observedAt=now();
  let boostsUsed=0;
  for(let i=0;remainingSeconds!==undefined || i<boosts;i++) {
    s=await inspect('progress');
    const q=s.queues.find(q=>q.uid===queue.uid&&q.marchId===queue.marchId&&q.target===String(target));
    if(!q||q.subType!==1){note('The march ended or gathering started. Speedups stopped.');break;}
    if(remainingSeconds!==undefined) {
      // Anchor the server-provided full duration to first observation. This
      // conservatively overestimates remaining time without trusting PC clock/timezone.
      if(![q.start,q.finish,q.speedupSeconds].every(Number.isSafeInteger) || q.finish<q.start || q.speedupSeconds<0 || q.start!==queue.start || q.finish!==queue.finish)
        throw new Error('March timing data is invalid or changed. Speedups stopped.');
      const remaining=Math.max(0,q.finish-q.start-q.speedupSeconds-Math.max(0,now()-observedAt)/1000);
      note(`Conservative remaining-time estimate: ${remaining.toFixed(2)} seconds.`);
      if(remaining<=remainingSeconds){note('Remaining time is ≤ 1 second. Stopping speedups and waiting for arrival.');break;}
    }
    const beforeSpeed=q.speedupSeconds,beforeInventory=s.boostInventory;
    if(remainingSeconds!==undefined && beforeInventory===0){note('No speedup items remain. Waiting for arrival.');break;}
    if(!Number.isSafeInteger(beforeInventory)||beforeInventory<0)throw new Error('Invalid speedup inventory.');
    if(beforeInventory<1)throw new Error('Insufficient speedup items.');
    note(`Using speedup #${i+1} (item 10303 × 1).`);
    check();await client.call('boost',{target,queueId:q.uid,marchId:q.marchId,itemId:10303,count:1});
    await waitFor(s=>{
      const current=s.queues.find(x=>x.uid===q.uid&&x.marchId===q.marchId);
      return s.boostInventory<beforeInventory&&(!current||current.subType!==1||current.speedupSeconds>beforeSpeed);
    },'Waiting for speedup acknowledgement','progress');
    boostsUsed++;
    note('Speedup inventory and march state updates confirmed.');
  }
  note('Native workflow completed.');return {marchId:queue.marchId,queueId:queue.uid,target,preset,boostsUsed};
}
