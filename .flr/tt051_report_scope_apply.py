from pathlib import Path
import re

p=Path('step71_hybrid_v06_ui.js')
s=p.read_text(encoding='utf-8')

def replace_once(old,new,label):
    global s
    n=s.count(old)
    if n!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {n}')
    s=s.replace(old,new,1)

replace_once(
    "lastFeedEventKey=null,bugDebugOverride=null;const STEP=.10,REPLAY_SPEED=2;",
    "lastFeedEventKey=null,bugDebugOverride=null,recentCompletedSituations=[];const STEP=.10,REPLAY_SPEED=2;",
    'state-ring'
)
replace_once(
    "phase='IDLE';latestIntegratedDebug=null;episodeHistory=[];",
    "phase='IDLE';latestIntegratedDebug=null;episodeHistory=[];recentCompletedSituations=[];",
    'setup-ring-reset'
)

helpers=r'''function debugSituationKey(d){const b=d?.hybridBefore?.boundary||{},h=d?.highResolution||{},t=b.atSecond??h.entrySnapshot?.time??null;return`${b.sceneId||b.id||'-'}|${Number.isFinite(Number(t))?Number(t).toFixed(3):'-'}`;}
function debugSituationRange(d){const h=d?.highResolution||{},b=d?.hybridBefore?.boundary||{},af=d?.hybridAfter?.state||{},first=a=>Array.isArray(a)&&a.length?Number(a[0]?.time):NaN,last=a=>Array.isArray(a)&&a.length?Number(a.at(-1)?.time):NaN,starts=[Number(b.atSecond),Number(h.entrySnapshot?.time),first(h.preActionFrames),first(h.episodeFrames)].filter(Number.isFinite),ends=[Number(af.second),last(h.postActionFrames),last(h.episodeFrames)].filter(Number.isFinite);return{start:starts.length?Math.min(...starts):null,end:ends.length?Math.max(...ends):null};}
function scopeSituationDebug(d){if(!d)return null;const out=deep(d),range=debugSituationRange(out),a=range.start,b=range.end,inside=t=>!Number.isFinite(a)||!Number.isFinite(b)||(Number(t)>=a-.001&&Number(t)<=b+.001),st=out.hybridAfter?.state;if(st){if(Array.isArray(st.resolvedEvents))st.resolvedEvents=st.resolvedEvents.filter(e=>inside(e?.t));if(Array.isArray(st.chain))st.chain=st.chain.filter(e=>inside(e?.t));if(Array.isArray(st.sceneCandidates))st.sceneCandidates=st.sceneCandidates.filter(e=>inside(e?.atSecond));}out.reportScope={startSecond:a,endSecond:b,cumulativeMatchHistoryIncluded:false,keepsFullSituationFrames:true};return out;}
function rememberCompletedSituation(d,kind='SCENE'){if(!d)return;const key=debugSituationKey(d),row={key,kind,debug:deep(d)};if(recentCompletedSituations.at(-1)?.key===key)recentCompletedSituations[recentCompletedSituations.length-1]=row;else recentCompletedSituations.push(row);while(recentCompletedSituations.length>2)recentCompletedSituations.shift();}
function previousSituationFor(d){if(!d||bugDebugOverride)return null;const key=debugSituationKey(d),last=recentCompletedSituations.at(-1);if(!last)return null;if(last.key!==key)return last.debug||null;return recentCompletedSituations.length>1?recentCompletedSituations.at(-2)?.debug||null:null;}
function makeBugReportBundle(d,ctx){const prev=previousSituationFor(d);return{schemaVersion:'FLR_BUG_REPORT_BUNDLE_0.3',scope:{currentSituation:true,previousSituation:!!prev,previousRule:'IMMEDIATE_PREVIOUS_SITUATION_START_TO_END',olderSituationsIncluded:false},bugReportContext:{reportId:ctx.reportId,build:'TT-0.51',step:78,description:ctx.description,category:ctx.category,priority:Number(ctx.priority),reportedAt:new Date().toISOString()},currentSituation:scopeSituationDebug(d),previousSituation:scopeSituationDebug(prev)};}
'''
marker="function currentDebugForBug(){return bugDebugOverride||(session&&activeBoundary?makeIntegratedDebug():latestIntegratedDebug)||null}"
if marker not in s:
    raise SystemExit('helper insertion marker missing')
s=s.replace(marker,helpers+marker,1)

# Choice episode: once fully handed back, keep only a two-situation rolling ring.
pattern=r"(latestIntegratedDebug=X\.build\(beforeHybrid,activeBoundary,opened,\{\.\.\.hb,selectedChoice:selectedStepResults\.at\(-1\)\?\.selectedChoice\|\|null,choiceSteps:scenes\.map\(sc=>\(\{sceneId:sc\.sceneId,selectedChoice:sc\.choice,result:sc\.result\}\)\)\},world\);)(episodeHistory\.push\()"
s,n=re.subn(pattern,r"\1rememberCompletedSituation(latestIntegratedDebug,'CHOICE_EPISODE');\2",s,count=1)
if n!=1: raise SystemExit(f'handback remember insert failed: {n}')

# Non-choice goal: preserve the actual displayed scoring situation before clearing the live handoff vars.
old="const team=goal?(goal.team||scoreDeltaTeam(entry,out.snapshot)):null,score=out.snapshot?.score||world.state.score,detail=goal?.text||null;deferredHandback=null;"
new="const team=goal?(goal.team||scoreDeltaTeam(entry,out.snapshot)):null,score=out.snapshot?.score||world.state.score,detail=goal?.text||null;if(goal){latestIntegratedDebug=X.build(beforeHybrid,activeBoundary,opened,{...out,selectedChoice:null,choiceSteps:[]},world);rememberCompletedSituation(latestIntegratedDebug,'GOAL_SCENE');}deferredHandback=null;"
replace_once(old,new,'goal-scene-remember')

# Set-piece goal: same rule; non-goal auto windows are not added to the user-visible previous-situation slot.
old="const goals=flushHybridNotables(),goal=goals.find(e=>e.kind==='HIGH_RES_GOAL');$('heroPlayback').textContent='세트피스 종료 · Hybrid 경기 재개';"
new="const goals=flushHybridNotables(),goal=goals.find(e=>e.kind==='HIGH_RES_GOAL');if(goal){latestIntegratedDebug=X.build(beforeHybrid,activeBoundary,opened,{...hb,selectedChoice:null,choiceSteps:[]},world);rememberCompletedSituation(latestIntegratedDebug,'SET_PIECE_GOAL');}$('heroPlayback').textContent='세트피스 종료 · Hybrid 경기 재개';"
replace_once(old,new,'setpiece-goal-remember')

start=s.find('async function openGitHubBugIssue(){')
end=s.find('\nfunction loop(ts)',start)
if start<0 or end<0:
    raise SystemExit('bug submit function bounds missing')
new_submit=r'''async function openGitHubBugIssue(){const d=currentDebugForBug();if(!d)return;const desc=$('heroBugDescription').value.trim();if(!desc){$('heroBugDescription').focus();return;}const cat=$('heroBugCategory').value,prio=$('heroBugPriority').value,snap=compactBugSnapshot(d),endpoint=String(window.FLR_BUG_REPORT_ENDPOINT||'').trim(),button=$('heroBugOpenIssue')||$('heroBugSubmit');if(button){button.disabled=true;button.textContent=endpoint?'버그 등록 중…':'등록 서버 확인 중…';}
  try{if(!endpoint)throw new Error('BUG_REPORT_ENDPOINT_MISSING');const rid=`tt051-${crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}`,reportBundle=makeBugReportBundle(d,{reportId:rid,description:desc,category:cat,priority:prio}),payload={reportId:rid,build:'TT-0.51',step:78,category:cat,priority:Number(prio),description:desc,summary:snap,debug:reportBundle,client:{userAgent:navigator.userAgent,href:location.href}},r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),j=await r.json().catch(()=>({}));if(!r.ok||!j.ok||!j.jsonUrl)throw new Error(j.error||`HTTP ${r.status}`);closeBugModal();const msg=`버그 등록 완료 · ${j.reportId||rid} · 현재 상황${reportBundle.previousSituation?' + 직전 상황':''} 저장됨 · GitHub 로그인 불필요`;$('heroPlayback').textContent=msg;pushLiveFeed(msg,'scene');return;}
  catch(err){console.warn('FLR anonymous bug report failed',err);const rid=`tt051-fallback-${Date.now()}`,reportBundle=makeBugReportBundle(d,{reportId:rid,description:desc,category:cat,priority:prio}),u=bugFallbackUrl(desc,cat,prio,snap,reportBundle);$('heroPlayback').textContent='자동 등록 실패 · 현재/직전 상황 JSON을 클립보드에 복사했습니다.';window.open(u,'_blank','noopener');}
  finally{if(button){button.disabled=false;button.textContent='버그 등록';}}
}'''
s=s[:start]+new_submit+s[end:]

p.write_text(s,encoding='utf-8')
print('TT-0.51 report scope applied')
