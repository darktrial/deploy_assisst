(() => {
  globalThis.__gtAutoTrigger?.dispose();
  let enabled=false,ready=false,disposed=false,epoch=0,timer,attempts=0,preparing=false,inFlight=false;
  let notice=null,noticeTimer;
  function show(message) {
    if(disposed)return;
    notice?.remove();clearTimeout(noticeTimer);
    notice=document.createElement('div');notice.setAttribute('role','status');
    notice.textContent=`GT One-Click Dispatch: ${String(message).slice(0,500)}`;
    notice.style.cssText='position:fixed;top:60px;right:12px;z-index:2147483647;background:#182538;color:white;padding:10px 14px;border-radius:8px;font:14px/1.5 sans-serif;max-width:440px;pointer-events:none';
    document.documentElement.appendChild(notice);
    noticeTimer=setTimeout(()=>{notice?.remove();notice=null;},6500);
  }
  function schedule() {
    clearTimeout(timer);
    timer=setTimeout(prepare,Math.min(10000,2000*(1+attempts)));
  }
  async function prepare() {
    if(disposed||!enabled||preparing)return;
    if(!document.querySelector('#unity-canvas')){schedule();return;}
    const generation=epoch;preparing=true;
    try {
      const result=await chrome.runtime.sendMessage({type:'autoPrepare'});
      if(disposed||generation!==epoch)return;
      ready=!!result?.ok;
      if(ready){attempts=0;show('Click-to-run ready. Select a new, empty resource point or ordinary player castle.');}
      else {attempts++;show(result?.error||'Waiting for the game. Initialization will retry automatically.');schedule();}
    } catch {
      if(!disposed&&generation===epoch){attempts++;show('Automatic activation could not connect. Refresh the game if the extension was reloaded.');schedule();}
    } finally {
      preparing=false;
      if(!disposed&&enabled&&generation!==epoch)schedule();
    }
  }
  function update(mode) {
    epoch++;enabled=mode==='selection';ready=false;attempts=0;clearTimeout(timer);
    if(enabled)void prepare();
    else {notice?.remove();void chrome.runtime.sendMessage({type:'autoDisable'}).catch(()=>{});}
  }
  async function click(event) {
    if(!enabled||disposed||!event.isTrusted||event.button!==0||event.detail>1||
      event.ctrlKey||event.altKey||event.shiftKey||event.metaKey||!document.hasFocus()||event.target?.id!=='unity-canvas')return;
    if(!ready){show('Preparing click-to-run. Wait for Ready, then select the target again.');void prepare();return;}
    if(inFlight)return;
    const generation=epoch;inFlight=true;
    show('Selection received. Checking the target; see the execution log for progress.');
    try {
      const result=await chrome.runtime.sendMessage({type:'autoRun'});
      if(disposed||generation!==epoch)return;
      show(result?.ok ? result.message||'Check the execution log for the result.' : result?.error||'Automatic activation returned no result. Refresh the game.');
      if(result?.status==='ignored'&&result.message?.includes('No fresh completed canvas click')){ready=false;void prepare();}
    } catch {if(!disposed&&generation===epoch){ready=false;show('Automatic activation disconnected. Refresh the game.');schedule();}}
    finally {inFlight=false;}
  }
  function changed(changes,area) {if(area==='local'&&changes.activationMode)update(changes.activationMode.newValue);}
  window.addEventListener('click',click,true);
  chrome.storage.onChanged.addListener(changed);
  const generation=epoch;
  void chrome.storage.local.get('activationMode').then(value=>{
    if(!disposed&&epoch===generation)update(value.activationMode);
  }).catch(()=>{});
  globalThis.__gtAutoTrigger={dispose() {
    disposed=true;epoch++;clearTimeout(timer);clearTimeout(noticeTimer);notice?.remove();
    window.removeEventListener('click',click,true);chrome.storage.onChanged.removeListener(changed);
  }};
})();
