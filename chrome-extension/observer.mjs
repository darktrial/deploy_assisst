// Passive CDP observer: no input injection, request interception or message replay.
export const LIMITS = {events: 8000, bytes: 6 * 1024 * 1024, payloadChars: 256 * 1024, durationMs: 10 * 60 * 1000};
const SECRET = /password|passwd|token|secret|authorization|cookie|session|credential|login.?email/i;
export function safeUrl(value) {
  try { const u = new URL(value); return `${u.protocol}//${u.host}${u.pathname}`; }
  catch { return '[unavailable]'; }
}
function scrubText(value) {
  return value.replace(/((?:[\w-]*(?:token|password|secret|session)[\w-]*|authorization|cookie)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi, '$1[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/(?:https?|wss?):\/\/[^\s"<>]+/g, url => safeUrl(url));
}
export function safeText(value) {
  const text = String(value ?? '');
  try {
    return JSON.stringify(JSON.parse(text), (key, v) => SECRET.test(key) ? '[REDACTED]' : typeof v === 'string' ? scrubText(v) : v);
  } catch { return scrubText(text); }
}
export function payload(value, base64, includeBinary, max = LIMITS.payloadChars) {
  const original = String(value ?? '');
  const encoding = base64 ? 'base64' : 'utf8';
  if (base64 && !includeBinary) return {encoding, originalChars: original.length, omitted: true};
  // Base64 is intentionally opaque: do not claim secrets inside it are redacted.
  const clean = base64 ? original : safeText(original);
  const length = base64 ? Math.floor(max / 4) * 4 : max;
  return {encoding, originalChars: original.length, data: clean.slice(0, length), truncated: clean.length > length};
}
const autoAttach = {autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
  filter: [{type:'iframe'}, {type:'worker'}, {type:'shared_worker'}, {exclude:true}]};
const httpType = type => type === 'XHR' || type === 'Fetch';

export class TrafficObserver {
  constructor({command, attach, detach, persist, onEnd = () => {}, now = Date.now, limits = LIMITS}) {
    Object.assign(this, {command, attach, detach, persist, onEnd, now, limits});
    this.phase = 'idle'; this.record = null; this.tabId = null; this.pending = new Set();
    this.requests = new Map(); this.sockets = new Map(); this.targets = new Map();
    this.stopTask = null; this.attached = false;
  }
  status() {
    return {phase:this.phase, active:['starting','recording','stopping'].includes(this.phase), tabId:this.tabId,
      startedAt:this.record?.startedAt, elapsedMs:this.record ? this.now() - this.startMs : 0,
      count:this.record?.events.length || 0, bytes:this.bytes || 0,
      stage:this.stage || 'baseline', counts:this.counts || {},
      markers:this.record?.events.filter(e=>e.kind==='marker').slice(-12) || [],
      reason:this.record?.stopReason, error:this.persistError || '', hasRecord:!!this.record,
      warnings:this.record?.warnings || []};
  }
  async start(tabId, includeBinary) {
    if (['starting','recording','stopping'].includes(this.phase)) throw new Error('通訊觀察已在進行中。');
    this.phase='starting'; this.tabId=tabId; this.startMs=this.now(); this.bytes=0; this.stage='baseline'; this.persistError=''; this.stopTask=null;
    this.requests.clear(); this.sockets.clear(); this.targets.clear(); this.pending.clear();
    this.counts={wsSent:0,wsReceived:0,httpRequests:0,httpResponses:0};
    this.record={format:'gt-traffic-v1', version:1, startedAt:new Date(this.startMs).toISOString(),
      includeBinary:includeBinary===true, limits:this.limits,
      privacy:'Headers/cookies and URL query/fragment are omitted. Recognized text secrets are redacted. Binary/opaque payloads may still contain credentials or account data.',
      warnings:[], events:[]};
    try {
      await this.attach(tabId); this.attached=true;
      if (this.phase !== 'starting') throw new Error('觀察連線已中斷。');
      await this.enable({tabId});
      if (this.phase !== 'starting') throw new Error('觀察連線已中斷。');
      this.phase='recording'; this.mark('baseline','開始後先等待約 3 秒，再標記並操作。');
      if (this.phase==='recording') this.timer=setTimeout(()=>{ this.stop('time_limit'); },this.limits.durationMs);
      return this.status();
    } catch (error) { await this.stop('start_failed'); throw error; }
  }
  async enable(source) {
    await this.command(source,'Network.enable',{maxTotalBufferSize:8*1024*1024,maxResourceBufferSize:1024*1024,maxPostDataSize:this.limits.payloadChars});
    await this.command(source,'Target.setAutoAttach',autoAttach);
  }
  accepting() { return this.phase==='recording' || this.phase==='starting'; }
  add(event, observed = this.now(), draining = false) {
    if (!this.accepting() && !(draining && this.phase==='stopping')) return;
    const row={seq:this.record.events.length+1, elapsedMs:observed-this.startMs, stage:this.stage,...event};
    const bytes=new TextEncoder().encode(JSON.stringify(row)).length;
    if (this.record.events.length >= this.limits.events || this.bytes+bytes > this.limits.bytes) {
      if (this.accepting()) this.stop('capture_limit');
      return;
    }
    this.record.events.push(row); this.bytes+=bytes;
  }
  warn(message) {
    if (this.record && !this.record.warnings.includes(message)) this.record.warnings.push(message);
  }
  mark(stage, note='') {
    if (this.phase !== 'recording') throw new Error('請先開始通訊觀察。');
    if (!['baseline','preset','march','boost','done','custom'].includes(stage)) throw new Error('未知標記。');
    this.stage=stage;
    this.add({kind:'marker',label:stage,note:safeText(note).slice(0,300)});
    return this.status();
  }
  track(promise) {
    const record=this.record;
    const task=Promise.resolve(promise).catch(()=>{ if (record===this.record) this.warn('部分子目標或回應內容無法擷取；請檢查事件中的 capture_error。'); }).finally(()=>this.pending.delete(task));
    this.pending.add(task);
  }
  onEvent(source, method, p) {
    if (source.tabId !== this.tabId || !this.accepting()) return;
    const observed=this.now();
    const session=source.sessionId || 'root';
    const key=`${session}:${p.requestId}`;
    const context={session,requestId:p.requestId,cdpTimestamp:p.timestamp};
    if (method==='Target.attachedToTarget') {
      const record=this.record;
      const child={tabId:this.tabId,sessionId:p.sessionId};
      this.targets.set(p.sessionId,{type:p.targetInfo.type,url:safeUrl(p.targetInfo.url)});
      this.add({kind:'target_attached',session:p.sessionId,...this.targets.get(p.sessionId)},observed);
      this.track(this.enable(child).catch(()=>{ if (record===this.record) this.add({kind:'capture_error',session:p.sessionId,message:'子目標 Network.enable / autoAttach 失敗。'}); throw new Error('target'); }));
      return;
    }
    if (method==='Target.detachedFromTarget') {
      this.add({kind:'target_detached',session:p.sessionId},observed); return;
    }
    if (method==='Network.webSocketCreated') {
      this.sockets.set(key,safeUrl(p.url));
      this.add({kind:'ws_open',...context,url:safeUrl(p.url)},observed); return;
    }
    if (method==='Network.webSocketFrameSent' || method==='Network.webSocketFrameReceived') {
      const sent=method.endsWith('Sent'); const r=p.response;
      this.counts[sent?'wsSent':'wsReceived']++;
      this.add({kind:sent?'ws_send':'ws_receive',...context,url:this.sockets.get(key)||null,
        opcode:r.opcode, payload:payload(r.payloadData,r.opcode!==1,this.record.includeBinary,this.limits.payloadChars)},observed);
      return;
    }
    if (method==='Network.webSocketClosed' || method==='Network.webSocketFrameError') {
      this.add({kind:method.endsWith('Closed')?'ws_close':'ws_error',...context},observed);
      if (method.endsWith('Closed')) this.sockets.delete(key);
      return;
    }
    if (method==='Network.requestWillBeSent' && httpType(p.type)) {
      const r=p.request; this.counts.httpRequests++;
      // Never retain the complete request object (contains headers/auth data).
      const meta={url:safeUrl(r.url),method:r.method,type:p.type};
      this.requests.set(key,meta);
      this.add({kind:'http_request',...context,...meta,postData:r.postData===undefined ? undefined : payload(r.postData,false,false,this.limits.payloadChars),hasPostData:!!r.hasPostData},observed);
      // Avoid fetching missing bodies: CDP's fallback can include upload data.
      return;
    }
    if (method==='Network.responseReceived' && httpType(p.type)) {
      const r=p.response; this.counts.httpResponses++;
      const meta=this.requests.get(key)||{url:safeUrl(r.url),type:p.type};
      Object.assign(meta,{mimeType:r.mimeType,status:r.status}); this.requests.set(key,meta);
      this.add({kind:'http_response',...context,...meta},observed); return;
    }
    if (method==='Network.loadingFailed' && this.requests.has(key)) {
      this.add({kind:'http_failed',...context,message:safeText(p.errorText)},observed); this.requests.delete(key); return;
    }
    if (method==='Network.loadingFinished' && this.requests.has(key)) {
      const meta=this.requests.get(key); this.requests.delete(key);
      if (p.encodedDataLength>1024*1024) { this.add({kind:'http_body_omitted',...context,...meta,reason:'response_over_1MiB'},observed); return; }
      // Start retrieval now; retain event time/stage even if the response arrives later.
      const stage=this.stage, record=this.record;
      this.track(this.command(source,'Network.getResponseBody',{requestId:p.requestId}).then(result=>{
        if (record!==this.record) return;
        this.add({kind:'http_body',...context,...meta,stage,payload:payload(result.body,result.base64Encoded,this.record.includeBinary,this.limits.payloadChars)},observed,true);
      },()=>{ if (record===this.record) this.add({kind:'capture_error',...context,stage,message:'HTTP 回應內容已不可用。'},observed,true); }));
    }
  }
  onDetach(source, reason) {
    if (source.tabId!==this.tabId || source.sessionId || !this.accepting()) return;
    this.attached=false;
    this.stop(`debugger_detached:${reason||'unknown'}`);
  }
  stop(reason='user') {
    if (this.stopTask) return this.stopTask;
    if (!this.record || this.phase==='stopped' || this.phase==='idle') return Promise.resolve(this.status());
    this.phase='stopping'; clearTimeout(this.timer);
    this.record.stopReason=reason; this.record.endedAt=new Date(this.now()).toISOString();
    this.stopTask=(async()=>{
      // Drain already-requested HTTP bodies before detaching; accept no new events.
      if (this.pending.size) {
        let deadline;
        await Promise.race([Promise.allSettled([...this.pending]),new Promise(resolve=>{ deadline=setTimeout(resolve,2000); })]);
        clearTimeout(deadline);
        if (this.pending.size) this.warn('停止時仍有擷取未完成，部分回應可能缺少內容。');
      }
      if (this.attached) await this.detach(this.tabId).catch(()=>{});
      this.attached=false;
      this.record.counts={...this.counts};
      this.record.byteCount=this.bytes;
      try { await this.persist(this.record); }
      catch { this.persistError='無法暫存紀錄，請在重新載入擴充功能前直接匯出。'; }
      this.phase='stopped'; this.onEnd();
      return this.status();
    })();
    return this.stopTask;
  }
  async clear() {
    if (['starting','recording','stopping'].includes(this.phase)) throw new Error('先停止觀察再清除紀錄。');
    await this.persist(null); this.record=null; this.phase='idle'; this.bytes=0; this.counts={};
    this.stage='baseline'; this.persistError=''; this.stopTask=null; this.tabId=null;
    this.requests.clear(); this.sockets.clear(); this.targets.clear();
    return this.status();
  }
}
