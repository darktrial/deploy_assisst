// Only a fresh, trusted canvas click that changes the selected resource can run.
export async function selectedResource(client,{check,sleep,now=()=>performance.now(),note=()=>{}}) {
  const {gesture}=await client.call('selectionGesture');
  const reject=message=>{note(message);return null;};
  if(!gesture?.before)return reject('No fresh completed canvas click. Select the resource again or repair the input listeners.');
  if(gesture.before.source==='pending')return reject('The previous resource window was still loading. Close it and select the target again.');
  if(!gesture.before.focused)return reject('The game was not focused when the click started.');
  if(gesture.before.blockingWindows?.length)return reject('Close blocking game dialogs before selecting a target.');
  if(gesture.before.source==='dispatch')return reject('Close the dispatch panel and select a resource on the map.');
  const before=gesture.before;
  const deadline=now()+5000;
  let previous=null;
  while(now()<deadline) {
    check();
    const s=await client.call('selection');
    check();
    if(!s.focused)return reject('The game lost focus. No dispatch sent.');
    if(s.gestureId!==gesture.id)return reject('A newer interaction replaced this selection. No dispatch sent.');
    if(s.blockingWindows?.length)return reject('A game dialog is blocking target selection. No dispatch sent.');
    if(s.source==='dispatch')return reject('A dispatch panel is already open. No automatic dispatch sent.');
    if(s.source==='resource' && s.occupied)return reject('The selected resource is occupied. No dispatch sent.');
    if(s.source==='pending'){previous=null;await sleep(75);continue;}
    const valid=['resource','castle'].includes(s.source) && Number.isInteger(s.target) && s.target>0 && !s.occupied &&
      (before.source!==s.source||s.target!==before.target);
    if(valid && previous===`${s.source}:${s.target}`)return {target:s.target,gestureId:gesture.id,...(s.source==='castle'?{kind:'castle'}:{})};
    previous=valid?`${s.source}:${s.target}`:null;
    await sleep(75);
  }
  return reject('No new target selection was confirmed. Close the resource window and select it again, or select a different point.');
}
