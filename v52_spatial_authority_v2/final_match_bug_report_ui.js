(function(){
'use strict';
const $=id=>document.getElementById(id);
const endpoint=()=>String(window.FLR_BUG_REPORT_ENDPOINT||'').trim();
const forcedReport=()=>window.FLR_FINAL_MATCH_FORCED_REPORT&&typeof window.FLR_FINAL_MATCH_FORCED_REPORT==='object'?window.FLR_FINAL_MATCH_FORCED_REPORT:null;
let lastMetadataFallback=null;
function fallbackUrl(desc,category,priority){
  const short=String(desc||'').replace(/\s+/g,' ').trim().slice(0,64)||'bug report';
  const title=`[FINAL-MATCH][P${priority}][${category}] ${short}`;
  const body=`### 사용자 설명\n${desc}\n\n### 자동 첨부\n- 단계: FINAL MATCH USER CONFIRMATION\n- 분류: ${category}\n- 중요도: P${priority}\n- 경기 상황 JSON: 첨부 없음 또는 자동 전송 실패\n\n> 익명 자동 등록이 실패했을 때 사용하는 수동 fallback입니다.`;
  return `https://github.com/1Lisam/FLR_TEST/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
function metadataSummary(summary,error='FULL_DEBUG_REJECTED_413'){
  const out=summary&&typeof summary==='object'&&!Array.isArray(summary)?{...summary}:{value:summary??null};
  out.captureStatus='METADATA_ONLY';out.captureError=error;out.fullDebugAvailable=false;return out;
}
function installTransportFallback(){
  if(window.__FLR_BUG_REPORT_METADATA_FALLBACK__)return;
  window.__FLR_BUG_REPORT_METADATA_FALLBACK__=true;
  const prior=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    const target=typeof input==='string'?input:input?.url,ep=endpoint(),method=String(init?.method||'GET').toUpperCase();
    if(!ep||target!==ep||method!=='POST'||typeof init?.body!=='string')return prior(input,init);
    let payload;try{payload=JSON.parse(init.body)}catch{return prior(input,init)}
    if(!payload||!payload.reportId||!payload.description||payload.debug==null)return prior(input,init);
    const first=await prior(input,init);if(first.status!==413)return first;
    const retryPayload={...payload,debug:null,summary:metadataSummary(payload.summary)};
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
async function reportSourceIdentity(forced,summary){const api=window.FLR_REPORTER_SOURCE_IDENTITY;if(!api?.capture)return{schemaVersion:'FLR_V42_REPORTER_SOURCE_IDENTITY_1.0',buildId:'LEGACY_NOT_LOADED',validation:{classification:'LEGACY_NOT_LOADED',evidence:['IDENTITY_HELPER_NOT_LOADED']}};const boundary=forced?.boundary||{},state=forced?.snapshot||forced?.entrySnapshot||boundary.stateSnapshot||{},pending=forced?.pending||null,selected=forced?.selectedChoice||null;return api.capture({matchSecond:summary?.matchSecond??state.time??state.second??boundary.atSecond??null,boundaryIdOrSceneId:boundary.id||boundary.sceneId||boundary.type||null,heroPlayerId:boundary.heroPlayerId||pending?.heroPlayerId||pending?.playerId||null,heroRole:boundary.heroRole||null,pendingChoice:pending?{choiceIds:(pending.options||[]).map(o=>o.id||null),targetIds:(pending.options||[]).map(o=>o.targetId||null)}:null,committedChoice:selected?{choiceId:selected.id||null,targetId:selected.targetId||null}:null,currentStateMarkers:{phase:summary?.phase||state.phase||null,possession:summary?.possession||state.possession||null,ball:summary?.ball||state.ball||null,boundaryReason:boundary.reason||null,forcedScenario:forced?.scenarioKey||forced?.key||null},futureOutcomePrecomputed:false});}
async function postPayload(url,payload){
  let body;
  try{body=JSON.stringify(payload)}catch(err){const fallback={...payload,debug:null,summary:metadataSummary(payload.summary,'FULL_DEBUG_SERIALIZE_FAILED')};body=JSON.stringify(fallback);lastMetadataFallback={reportId:payload.reportId,at:Date.now()}}
  return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body});
}
function install(){
  installTransportFallback();
  const report=$('heroBugReport'),submit=$('heroBugOpenIssue')||$('heroBugSubmit'),modal=$('heroBugModal'),desc=$('heroBugDescription'),attach=$('heroBugAttachJson'),playback=$('heroPlayback');
  if(!report||!submit||!modal||!desc)return;
  const originalReport=report.onclick,originalSubmit=submit.onclick;
  let uiOnly=false,forcedMode=false;
  function hasSceneDebug(){const download=$('heroDownloadScene'),copy=$('heroCopyDebug');return !!((download&&!download.disabled)||(copy&&!copy.disabled))}
  function clearForced(){forcedMode=false;try{delete window.FLR_FINAL_MATCH_FORCED_REPORT}catch(_){window.FLR_FINAL_MATCH_FORCED_REPORT=null}}
  function fallbackLink(){let link=$('heroBugFallbackLink');if(link)return link;link=document.createElement('a');link.id='heroBugFallbackLink';link.className='secondary';link.target='_blank';link.rel='noopener';link.hidden=true;link.textContent='GitHub 수동 등록 열기';link.style.display='inline-flex';link.style.alignItems='center';link.style.textDecoration='none';const actions=modal.querySelector('.bug-actions');actions?.insertBefore(link,actions.firstChild);return link}
  function hideFallback(){const link=fallbackLink();link.hidden=true;link.removeAttribute('href')}
  function showFallback(){const category=$('heroBugCategory')?.value||'기타',priority=$('heroBugPriority')?.value||'3',link=fallbackLink();link.href=fallbackUrl(desc.value.trim(),category,priority);link.hidden=false}
  function prepareUiOnly(){uiOnly=true;forcedMode=false;hideFallback();desc.value='';if(attach){attach.checked=false;attach.disabled=true}modal.hidden=false;setTimeout(()=>desc.focus(),0)}
  function prepareForced(){uiOnly=true;forcedMode=true;hideFallback();desc.value='';if(attach){attach.checked=true;attach.disabled=false}modal.hidden=false;setTimeout(()=>desc.focus(),0)}
  function keepButtonAvailable(){if(report.disabled)report.disabled=false}
  keepButtonAvailable();new MutationObserver(keepButtonAvailable).observe(report,{attributes:true,attributeFilter:['disabled']});
  report.onclick=function(ev){hideFallback();if(forcedReport()){prepareForced();return}if(hasSceneDebug()){uiOnly=false;forcedMode=false;if(attach)attach.disabled=false;return originalReport?.call(this,ev)}prepareUiOnly()};
  submit.onclick=async function(ev){
    if(!uiOnly){if(attach)attach.disabled=false;const result=originalSubmit?.call(this,ev);if(result&&typeof result.then==='function')await result;const fallback=lastMetadataFallback;if(fallback&&Date.now()-fallback.at<5000&&modal.hidden){if(playback)playback.textContent=`버그 등록 완료 · ${fallback.reportId} · 전체 JSON 용량 초과로 상황 요약 저장됨 · GitHub 로그인 불필요`;lastMetadataFallback=null}if(!modal.hidden&&String(playback?.textContent||'').startsWith('자동 등록 실패'))showFallback();return}
    const description=desc.value.trim();if(!description){desc.focus();return}
    const category=$('heroBugCategory')?.value||'기타',priority=Number($('heroBugPriority')?.value||3),url=endpoint(),forced=forcedMode?forcedReport():null,attachJson=!!forced&&attach?.checked!==false;
    const ridPrefix=forced?'umt-final-forced':'umt-final-ui',rid=`${ridPrefix}-${crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    submit.disabled=true;submit.textContent=url?'버그 등록 중…':'등록 서버 확인 중…';
    try{if(!url)throw new Error('BUG_REPORT_ENDPOINT_MISSING');const summary=forcedSummary(forced,attachJson),sourceIdentity=await reportSourceIdentity(forced,summary),payload={reportId:rid,build:sourceIdentity.buildId,step:78,category,priority,description,summary,debug:attachJson?forced:null,sourceIdentity,client:{userAgent:navigator.userAgent,href:location.href,uiOnly:!forced,forcedScenario:!!forced}},response=await postPayload(url,payload),json=await response.json().catch(()=>({}));if(!response.ok||!json.ok)throw new Error(json.error||`HTTP ${response.status}`);modal.hidden=true;uiOnly=false;const fullSaved=!!json.hasDebug,modeText=forced?(fullSaved?'강제 시나리오 JSON 저장됨':attachJson?'전체 JSON 대신 상황 요약 저장됨':'강제 시나리오 상황 요약 저장됨'):'UI 리포트 저장됨';clearForced();if(attach){attach.disabled=false;attach.checked=true}if(playback)playback.textContent=`버그 등록 완료 · ${json.reportId||rid} · ${modeText} · GitHub 로그인 불필요`;if(lastMetadataFallback?.reportId===rid)lastMetadataFallback=null}
    catch(err){console.warn('FLR final-match bug report failed',err);showFallback();if(playback)playback.textContent='자동 등록 실패 · 아래 GitHub 수동 등록 링크를 눌러주세요.'}
    finally{submit.disabled=false;submit.textContent='버그 등록'}
  };
  const cancel=$('heroBugClose')||$('heroBugCancel');cancel?.addEventListener('click',()=>{uiOnly=false;clearForced();hideFallback();if(attach){attach.disabled=false;attach.checked=true}});
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});else setTimeout(install,0);
})();
