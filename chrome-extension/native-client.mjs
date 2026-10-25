import {nativeInPage} from './native-page.mjs';

export class NativeClient {
  constructor(tabId, command) { this.tabId=tabId;this.command=command;this.contexts=[];this.pending=new Set();this.selected=null; }
  async enable(source) {
    await this.command(source,'Runtime.enable',{});
    await this.command(source,'Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true,filter:[{type:'iframe'},{exclude:true}]});
  }
  onEvent(source,method,params) {
    if(source.tabId!==this.tabId)return;
    if(method==='Runtime.executionContextCreated'&&params.context?.auxData?.isDefault) {
      this.contexts.push({source:{...source},id:params.context.id});
    }
    if(method==='Target.attachedToTarget') {
      const source={tabId:this.tabId,sessionId:params.sessionId};
      const task=this.enable(source).catch(()=>{}).finally(()=>this.pending.delete(task));this.pending.add(task);
    }
    if(method==='Runtime.executionContextDestroyed')this.contexts=this.contexts.filter(c=>!(c.id===params.executionContextId&&c.source.sessionId===source.sessionId));
  }
  async connect(profile) {
    await this.enable({tabId:this.tabId});
    for(let i=0;i<4&&this.pending.size;i++)await Promise.allSettled([...this.pending]);
    const found=[];
    for(const context of this.contexts) {
      try {
        const result=await this.command(context.source,'Runtime.evaluate',{contextId:context.id,
          expression:'typeof window!=="undefined" && !!window.gameInstance?.Module?.HEAPU8 && !!document.querySelector("#unity-canvas")',returnByValue:true});
        if(result.result?.value===true)found.push(context);
      }catch { /* Contexts can disappear while a frame loads. */ }
    }
    if(found.length!==1)throw new Error('Cannot identify a unique Unity game context. Wait for the game to finish loading.');
    this.selected=found[0];this.profile=profile;
    return this.call('inspect',{},true);
  }
  async call(command,args={},verifyHash=false) {
    if(!this.selected)throw new Error('Not connected to Unity.');
    const result=await this.command(this.selected.source,'Runtime.evaluate',{
      contextId:this.selected.id,expression:`(${nativeInPage.toString()})(${JSON.stringify(this.profile)},${JSON.stringify(command)},${JSON.stringify(args)},${verifyHash})`,
      returnByValue:true,awaitPromise:true,timeout:10000});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description?.split('\n')[0]||'Native game call failed.');
    if(result.result?.value===undefined)throw new Error('Unity returned no valid result.');
    return result.result.value;
  }
}
