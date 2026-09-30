(function(){
'use strict';
const $=id=>document.getElementById(id);
const endpoint=()=>String(window.FLR_BUG_REPORT_ENDPOINT||'').trim();
const forcedReport=()=>window.FLR_FINAL_MATCH_FORCED_REPORT&&typeof window.FLR_FINAL_MATCH_FORCED_REPORT==='object'?window.FLR_FINAL_MATCH_FORCED_REPORT:null;
let lastMetadataFallback=null;
function metadataSummary(summary,error='FULL_DEBUG_REJECTED_413'){
  const out=summary&&typeof summary==='object'&&!Array.isArray(summary)?{...summary}:{value:summary??null};
  out.captureStatus='METADATA_ONLY';out.captureError=error;out.fullDebugAvailable=false;return out;
}
function utf8Size(text){return new TextEncoder().encode(String(text)).byteLength}
function bytesToBase64(bytes){let out='';const step=0x8000;for(let i=0;i<bytes.length;i+=step)out+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+step)));return btoa(out)}
async function gzipBase64(raw){const source=new Response(new TextEncoder().encode(raw)).body,buffer=await new Response(source.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();return bytesToBase64(new Uint8Array(buffer))}
async function compressedTransport(payload){
  if(payload?.debug==null||typeof CompressionStream!=='function'||typeof Response!=='function'||typeof btoa!=='function')return payload;
  const raw=JSON.stringify(payload.debug);
  try{return{...payload,debug:null,debugTransport:{encoding:'gzip-base64-v1',data:await gzipBase64(raw),rawSizeBytes:utf8Size(raw)}}}catch(_){return payload}
}
function installTransportFallback(){
  if(window.__FLR_BUG_REPORT_METADATA_FALLBACK__)return;
  window.__FLR_BUG_REPORT_METADATA_FALLBACK__=true;
  const prior=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    const target=typeof input==='string'?input:input?.url,ep=endpoint(),method=String(init?.method||'GET').toUpperCase();
    if(!ep||target!==ep||method!=='POST'||typeof init?.body!=='string')return prior(input,init);
    let payload;try{payload=JSON.parse(init.body)}catch{return prior(input,init)}
    const hasDebug=payload?.debug!=null||payload?.debugTransport?.encoding==='gzip-base64-v1';
    if(!payload||!payload.reportId||!payload.description||!hasDebug)return prior(input,init);
    const first=await prior(input,init);if(first.status!==413)return first;
    const retryPayload={...payload,debug:null,debugTransport:null,summary:metadataSummary(payload.summary)};
    const retry=await prior(input,{...init,body:JSON.stringify(retryPayload)});
    if(retry.ok)lastMetadataFallback={reportId:payload.reportId,at:Date.now()};
    return retry;
  };
}
function forcedSummary(forced,attachJson){
  if(!forced)return{captureStatus:'METADATA_ONLY_UI',fullDebugAvailable:false};
  const boundary=forced.boundary||{},state=forced.snapshot||forced.entrySnapshot||boundary.stateSnapshot||{},ball=state.ball||boundary.stateSnapshot?.ball||{},pending=forced.pending||null;
  const events=(forced.actualEvents||[]).slice(-8).map(e=>({t:Number.isFinite(e?.t)?Number(e.t.toFixed(1)):null,type:e?.type||null,actorId:e?.actorId||null,targetId:e?.targetId||null,text:e?.text||null}));
  return{sv:'FLR_FORCED_SUMMARY_0.1',scenarioKey:forced.scenarioKey||forced.key||null,label:forced.label||null,seed:forced.seed||null,boundaryType:boundary.type||null,boundaryReason:boundary.reason||null,heroPlayerId:boundary.heroPlayerId||null,heroRole:boundary.heroRole||null,forcedSetup:forced.forcedSetup||null,stopReason:forced.stopReason||null,matchSecond:Number.isFinite(state.time)?Number(state.time.toFixed(1)):(Number.isFinite(state.second)?Number(state.second.toFixed(1)):(Number.isFinite(boundary.atSecond)?Number(boundary.atSecond.toFixed(1)):null)),score:state.score||boundary.stateSnapshot?.score||null,possession:state.possession||boundary.stateSnapshot?.possession||null,phase:state.phase||boundary.stateSnapshot?.phase||null,ball:{mode:ball.mode||null,team:ball.team||null,lane:ball.lane||null,progress:Number.isFinite(ball.progress)?Number(ball.progress.toFixed(3)):null,x:Number.isFinite(ball.x)?Number(ball.x.toFixed(1)):null,y:Number.isFinite(ball.y)?Number(ball.y.toFixed(1)):null,ownerId:ball.ownerId||null},pendingChoice:pending?{type:pending.type||null,playerId:pending.playerId||pending.heroPlayerId||null,options:(pending.options||[]).map(o=>({id:o.id||null,targetId:o.targetId||null,label:o.label||null}))}:null,recentEvents:events,futureOutcomePrecomputed:forced.futureOutcomePrecomputed===false?false:null,captureStatus:attachJson?'FULL_DEBUG_REQUESTED':'METADATA_ONLY_USER',fullDebugAvailable:!!attachJson};
}
function currentStateCapture(){const capture=window.FLR_CURRENT_BUG_STATE;const state=typeof capture==='function'?capture():null;return state&&typeof state==='object'&&!Array.isArray(state)?state:null;}
function recentHistorySummary(history){const scenes=Array.isArray(history?.scenes)?history.scenes:[];return{schemaVersion:history?.schemaVersion||null,sceneCount:scenes.length,scenes:scenes.map(s=>({kind:s?.kind||null,scene:s?.scene||null,events:s?.events||[],frames:(s?.frames||[]).map(f=>({time:f?.time??null,score:f?.score||null,phase:f?.phase||null,possession:f?.possession||null,ball:f?.ball||null,playerCount:Array.isArray(f?.players)?f.players.length:0}))})),futureOutcomePrecomputed:history?.futureOutcomePrecomputed===true};}
function currentStateSummary(state,attachJson){const match=state?.match||{},ball=state?.ball||{};return{sv:'FLR_CURRENT_STATE_SUMMARY_0.2',captureStatus:state?(attachJson?'BOUNDED_CURRENT_STATE_JSON_REQUESTED':'METADATA_ONLY_USER'):'CURRENT_STATE_UNAVAILABLE',fullDebugAvailable:false,captureKind:state?.captureKind||null,matchSecond:match.second??null,score:match.score||null,possession:match.possession||null,phase:match.phase||null,heroPlayerId:match.heroPlayerId||null,heroRole:match.heroRole||null,activeBoundary:state?.activeBoundary||null,ball:{mode:ball.mode||null,x:ball.x??null,y:ball.y??null,ownerId:ball.ownerId||null,team:ball.team||null,lane:ball.lane||null,progress:ball.progress??null},players:(state?.players||[]).map(p=>[p.id||null,p.team||null,p.role||null,p.slot||null,p.x??null,p.y??null,p.vx??null,p.vy??null,p.action||null,p.tacticalTask||null,p.markTargetId||null]),recentHistory:recentHistorySummary(state?.recentHistory),futureOutcomePrecomputed:state?.futureOutcomePrecomputed===true};}
async function reportSourceIdentity(forced,summary){const api=window.FLR_REPORTER_SOURCE_IDENTITY;if(!api?.capture)return{schemaVersion:'FLR_V42_REPORTER_SOURCE_IDENTITY_1.0',buildId:'LEGACY_NOT_LOADED',validation:{classification:'LEGACY_NOT_LOADED',evidence:['IDENTITY_HELPER_NOT_LOADED']}};const boundary=forced?.boundary||{},state=forced?.snapshot||forced?.entrySnapshot||boundary.stateSnapshot||{},pending=forced?.pending||null,selected=forced?.selectedChoice||null;return api.capture({matchSecond:summary?.matchSecond??state.time??state.second??boundary.atSecond??null,boundaryIdOrSceneId:boundary.id||boundary.sceneId||boundary.type||null,heroPlayerId:boundary.heroPlayerId||pending?.heroPlayerId||pending?.playerId||null,heroRole:boundary.heroRole||null,pendingChoice:pending?{choiceIds:(pending.options||[]).map(o=>o.id||null),targetIds:(pending.options||[]).map(o=>o.targetId||null)}:null,committedChoice:selected?{choiceId:selected.id||null,targetId:selected.targetId||null}:null,currentStateMarkers:{phase:summary?.phase||state.phase||null,possession:summary?.possession||state.possession||null,ball:summary?.ball||state.ball||null,boundaryReason:boundary.reason||null,forcedScenario:forced?.scenarioKey||forced?.key||null},futureOutcomePrecomputed:false});}
async function postPayload(url,payload){
  let body;
  try{body=JSON.stringify(await compressedTransport(payload))}catch(err){const fallback={...payload,debug:null,debugTransport:null,summary:metadataSummary(payload.summary,'FULL_DEBUG_SERIALIZE_FAILED')};body=JSON.stringify(fallback);lastMetadataFallback={reportId:payload.reportId,at:Date.now()}}
  return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body});
}
function install(){
  if(window.__FLR_FINAL_ANONYMOUS_REPORTER_INSTALLED__)return;
  window.__FLR_FINAL_ANONYMOUS_REPORTER_INSTALLED__=true;
  installTransportFallback();
  const report=$('heroBugReport'),submit=$('heroBugOpenIssue')||$('heroBugSubmit'),modal=$('heroBugModal'),desc=$('heroBugDescription'),attach=$('heroBugAttachJson'),playback=$('heroPlayback');
  if(!report||!submit||!modal||!desc)return;
  let forcedMode=false,submitting=false;
  function clearForced(){forcedMode=false;try{delete window.FLR_FINAL_MATCH_FORCED_REPORT}catch(_){window.FLR_FINAL_MATCH_FORCED_REPORT=null}}
  function feedback(message,state){
    let node=$('heroBugReportStatus');
    if(!node){const dialog=modal.querySelector('.bug-dialog');if(dialog?.appendChild){node=document.createElement('p');node.id='heroBugReportStatus';node.setAttribute?.('role','status');node.setAttribute?.('aria-live','polite');node.className='muted';dialog.appendChild(node)}}
    if(node){node.textContent=message;if(node.dataset)node.dataset.state=state;}
    if(playback)playback.textContent=message;
  }
  function prepareAnonymous(forced){forcedMode=!!forced;desc.value='';if(attach){attach.checked=true;attach.disabled=false}modal.hidden=false;feedback('버그 설명을 입력한 뒤 등록하세요.','idle');setTimeout(()=>desc.focus(),0)}
  function keepButtonAvailable(){if(report.disabled)report.disabled=false}
  keepButtonAvailable();new MutationObserver(keepButtonAvailable).observe(report,{attributes:true,attributeFilter:['disabled']});
  // The final reporter exclusively owns both normal and forced submissions.
  // Do not delegate to the earlier UI handler: this is the only submission authority.
  report.onclick=function(ev){ev?.preventDefault?.();prepareAnonymous(forcedReport())};
  submit.onclick=async function(ev){
    ev?.preventDefault?.();
    if(submitting)return;
    const description=desc.value.trim();if(!description){feedback('버그 설명을 입력해야 등록할 수 있습니다.','failure');desc.focus();return}
    submitting=true;
    const category=$('heroBugCategory')?.value||'기타',priority=Number($('heroBugPriority')?.value||3),url=endpoint(),forced=forcedMode?forcedReport():null,currentState=forced?null:currentStateCapture(),attachJson=attach?.checked!==false;
    const ridPrefix=forced?'umt-final-forced':'umt-final-ui',rid=`${ridPrefix}-${crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    submit.disabled=true;submit.textContent=url?'버그 등록 중…':'등록 서버 확인 중…';feedback(submit.textContent+' 전송이 끝날 때까지 기다려주세요.','pending');
    try{if(!url)throw new Error('BUG_REPORT_ENDPOINT_MISSING');const summary=forced?forcedSummary(forced,attachJson):currentStateSummary(currentState,attachJson),sourceIdentity=await reportSourceIdentity(forced,summary),payload={reportId:rid,build:sourceIdentity.buildId,step:78,category,priority,description,summary,debug:attachJson?(forced||currentState):null,sourceIdentity,client:{userAgent:navigator.userAgent,href:location.href,uiOnly:!forced,forcedScenario:!!forced}},response=await postPayload(url,payload);let json;try{json=await response.json()}catch(_){throw new Error('INVALID_REPORT_RESPONSE')}if(response.ok!==true||json?.ok!==true)throw new Error(json?.error||`HTTP ${response.status}`);const fullSaved=!!json.hasDebug,metadataFallback=lastMetadataFallback?.reportId===rid,modeText=forced?(fullSaved?'강제 시나리오 JSON 저장됨':attachJson?'전체 JSON 대신 상황 요약 저장됨':'강제 시나리오 상황 요약 저장됨'):(attachJson?(metadataFallback?'현재 상태 요약 저장됨':'현재 상태 JSON 저장됨'):'경기 상황 JSON 미첨부');clearForced();if(attach){attach.disabled=false;attach.checked=true}feedback(`버그 등록 완료 · ${json.reportId||rid} · ${modeText} · GitHub 로그인 불필요`,'success');modal.hidden=true;if(lastMetadataFallback?.reportId===rid)lastMetadataFallback=null}
    catch(err){console.warn('FLR final-match bug report failed',err);feedback('자동 등록 실패 · 저장되지 않았습니다. 잠시 후 다시 시도해주세요.','failure')}
    finally{submitting=false;submit.disabled=false;submit.textContent='버그 등록'}
  };
  const cancel=$('heroBugClose')||$('heroBugCancel');cancel?.addEventListener('click',()=>{if(submitting)return;clearForced();if(attach){attach.disabled=false;attach.checked=true}});
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});else setTimeout(install,0);
})();
