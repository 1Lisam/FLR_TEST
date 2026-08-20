#!/usr/bin/env python3
import re, sys
from pathlib import Path
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

def read(rel): return (ROOT/rel).read_text(encoding='utf-8')
def write(rel,s): (ROOT/rel).write_text(s,encoding='utf-8')
def replace_once(text,old,new,label):
    n=text.count(old)
    if n!=1: raise SystemExit(f'TT050_REPLACE_COUNT {label} expected=1 actual={n}')
    return text.replace(old,new,1)

# 1) Through-ball travel time should meet the runner, not behave like a shot at a coordinate.
p='runtime/ball_strike_model.js'; t=read(p)
t=replace_once(t,
"  const pressure=Number(ctx.pressure)||99,targetSpeed=Number(ctx.targetSpeed)||0,forward=Number(ctx.forward)||0;",
"  const pressure=Number(ctx.pressure)||99,targetSpeed=Number(ctx.targetSpeed)||0,forward=Number(ctx.forward)||0,targetLeadDistance=Math.max(0,Number(ctx.targetLeadDistance)||0);",
'pass context lead distance')
t=replace_once(t,
"      style='THROUGH_GROUND';arrival=clamp(0.60+d/45-(targetSpeed>4?0.07:0),0.72,1.28);speed=clamp(d/arrival+quality*1.0,16.0,24.5);loft=0.07;",
"      style='THROUGH_GROUND';const runnerArrival=targetSpeed>1.6&&targetLeadDistance>1.5?targetLeadDistance/targetSpeed:0,physicsFloor=d/24.5;arrival=runnerArrival>0?clamp(Math.max(physicsFloor,runnerArrival),0.82,1.62):clamp(0.68+d/43-(targetSpeed>4?0.04:0),0.82,1.42);speed=clamp(d/arrival+quality*0.55,13.2,24.5);loft=0.07;",
'runner timed through pass')
write(p,t)

# 2) Core: preserve lateral/diagonal runner vector when extending an under-led through ball.
p='runtime/continuous_match_core.js'; t=read(p)
old="""  if(kind==='THROUGH'){
    const receiverLead=dist(target,tp),roughSpeed=clamp(16.0+pd*0.30,16.5,24.0),flightTime=pd/Math.max(1,roughSpeed),desiredLead=clamp(flightTime*6.25,5.8,14.5);
    // The receiver should still be running when the ball reaches the lane. A conservative
    // lead made quick forwards arrive ~0.5-1.0s early and wait for the pass. Extend only
    // along the attacking axis; keep the requested lane/side intact.
    if(receiverLead<desiredLead*0.88){const tl=worldToLocal(target.team,target.x,target.y),tpl=worldToLocal(target.team,tp.x,tp.y),extra=clamp(desiredLead-receiverLead,0,3.6),candidate=localToWorld(target.team,clamp(tpl.x+extra,4,98.2),clamp(tpl.y,4,64)),oldBlocks=laneBlockers(m,owner,tp,other(owner.team)).length,newBlocks=laneBlockers(m,owner,candidate,other(owner.team)).length,oldOpen=outfield(m,other(owner.team)).reduce((best,q)=>Math.min(best,dist(q,tp)),99),newOpen=outfield(m,other(owner.team)).reduce((best,q)=>Math.min(best,dist(q,candidate)),99);if(newBlocks<=oldBlocks&&newOpen>=Math.min(1.25,oldOpen-.35))tp=candidate;pd=dist(owner,tp);}
  }
"""
new="""  if(kind==='THROUGH'){
    const receiverLead=dist(target,tp),targetSpeed=Math.hypot(target.vx,target.vy),roughArrival=clamp(pd/Math.max(13.2,Math.min(24.5,pd/1.10)),0.82,1.62),desiredLead=clamp((targetSpeed>1.6?targetSpeed:5.0)*roughArrival,4.8,14.5);
    // Extend an under-led pass ALONG the runner's live movement vector. The previous X-axis-only
    // extension made diagonal/wide runs look like a hard straight shot toward the goal line.
    if(receiverLead<desiredLead*0.88){const baseDx=targetSpeed>1.6?target.vx:(tp.x-target.x),baseDy=targetSpeed>1.6?target.vy:(tp.y-target.y),nv=norm(baseDx,baseDy),extra=clamp(desiredLead-receiverLead,0,3.8),candidate={x:clamp(tp.x+nv.x*extra,1,104),y:clamp(tp.y+nv.y*extra,1,67)},oldBlocks=laneBlockers(m,owner,tp,other(owner.team)).length,newBlocks=laneBlockers(m,owner,candidate,other(owner.team)).length,oldOpen=outfield(m,other(owner.team)).reduce((best,q)=>Math.min(best,dist(q,tp)),99),newOpen=outfield(m,other(owner.team)).reduce((best,q)=>Math.min(best,dist(q,candidate)),99);if(newBlocks<=oldBlocks&&newOpen>=Math.min(1.25,oldOpen-.35))tp=candidate;pd=dist(owner,tp);}
  }
"""
t=replace_once(t,old,new,'through vector extension')
t=replace_once(t,
"const sl=worldToLocal(owner.team,owner.x,owner.y),strike=STRIKE&&typeof STRIKE.passPlan==='function'?STRIKE.passPlan({kind,distance:pd,deliveryMode,pressure:ballCarrierPressureDistance(m,owner),targetSpeed:Math.hypot(target.vx,target.vy),forward:dir(owner.team)*(tp.x-owner.x),passSkill,sourceX:sl.x}):null;",
"const sl=worldToLocal(owner.team,owner.x,owner.y),strike=STRIKE&&typeof STRIKE.passPlan==='function'?STRIKE.passPlan({kind,distance:pd,deliveryMode,pressure:ballCarrierPressureDistance(m,owner),targetSpeed:Math.hypot(target.vx,target.vy),targetLeadDistance:dist(target,tp),forward:dir(owner.team)*(tp.x-owner.x),passSkill,sourceX:sl.x}):null;",
'passPlan target lead')
# Prefer a real forward/flat safe outlet in the final third before choosing a backward safety valve.
old="if(!CANDIDATES)return null;const l=worldToLocal(owner.team,owner.x,owner.y),runner=opts.find(o=>(o.running||['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask))&&o.block===0&&((['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask)&&owner.role==='ST'&&o.leadForward>2.5&&o.score>-1.25)||(o.leadForward>6&&o.score>1.55))),progressive=opts.find(o=>o.forward>5&&o.block===0&&o.score>1.20),switchOpt=opts.find(o=>Math.abs(o.p.y-owner.y)>23&&o.block===0&&o.score>1.0),safe=opts.find(o=>o.block===0&&o.open>1.8),recycle=opts.find(o=>['CM','FB'].includes(o.p.role)&&o.block===0&&o.open>1.25&&o.forward<0&&o.forward>-16);"
new="if(!CANDIDATES)return null;const l=worldToLocal(owner.team,owner.x,owner.y),runner=opts.find(o=>(o.running||['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask))&&o.block===0&&((['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p.tacticalTask)&&owner.role==='ST'&&o.leadForward>2.5&&o.score>-1.25)||(o.leadForward>6&&o.score>1.55))),progressive=opts.find(o=>o.forward>5&&o.block===0&&o.score>1.20),switchOpt=opts.find(o=>Math.abs(o.p.y-owner.y)>23&&o.block===0&&o.score>1.0),safeAny=opts.find(o=>o.block===0&&o.open>1.8),safeForward=opts.find(o=>o.block===0&&o.open>1.35&&o.forward>-2&&['ST','WF','CM'].includes(o.p.role)),safe=l.x>=80?(safeForward||safeAny):safeAny,recycle=opts.find(o=>['CM','FB'].includes(o.p.role)&&o.block===0&&o.open>1.25&&o.forward<0&&o.forward>-16);"
t=replace_once(t,old,new,'final third safe outlet preference')
# A user CARRY is one coherent football action. Keep extending the live target while controller-owned.
old="""  if(userControl&&userControl.playerId===owner.id){
    if(userControl.controllerOwned)return;
    if(m.time<=Number(userControl.until||0)+0.001)return;
    m.userChoiceControl=null;owner.nextThink=Math.max(owner.nextThink||0,m.time);return;
  }
"""
new="""  if(userControl&&userControl.playerId===owner.id){
    if(userControl.controllerOwned){
      if(userControl.mode==='CARRY'&&m.time<Number(userControl.until||0)-0.05&&m.ball.mode==='CONTROLLED'&&m.ball.ownerId===owner.id){
        const remain=dist(owner,{x:owner.tx,y:owner.ty});
        if(remain<0.72){const l=worldToLocal(owner.team,owner.x,owner.y),tl=worldToLocal(owner.team,owner.tx,owner.ty),dx=tl.x-l.x,dy=tl.y-l.y,n=Math.hypot(dx,dy),ux=n>0.18?dx/n:1,uy=n>0.18?dy/n:0,step=clamp((Number(userControl.until)-m.time)*2.25,1.15,3.2),w=localToWorld(owner.team,clamp(l.x+ux*step,4,96.2),clamp(l.y+uy*step,4,64));owner.tx=w.x;owner.ty=w.y;owner.action=inOppPenaltyArea(owner.team,owner.x,owner.y)?'COMMITTED_BOX_CARRY':'CARRY_FORWARD';owner.tacticalTask=owner.action;owner.sprint=!inOppPenaltyArea(owner.team,owner.x,owner.y)&&step>2.4;m.stats.userCarryIntentExtensions=(m.stats.userCarryIntentExtensions||0)+1;}
      }
      return;
    }
    if(m.time<=Number(userControl.until||0)+0.001)return;
    m.userChoiceControl=null;owner.nextThink=Math.max(owner.nextThink||0,m.time);return;
  }
"""
t=replace_once(t,old,new,'coherent controller carry')
t=replace_once(t,
"intentUntil=Math.max(Number(owner.lockTargetUntil||0),m.time+0.90);owner.nextThink=intentUntil;",
"intentUntil=Math.max(Number(owner.lockTargetUntil||0),m.time+2.60);owner.nextThink=intentUntil;",
'carry intent duration')
t=replace_once(t,
"intentUntil=m.time+1.85;owner.nextThink=intentUntil;owner.lockTargetUntil=Math.max(owner.lockTargetUntil||0,intentUntil);",
"intentUntil=m.time+2.35;owner.nextThink=intentUntil;owner.lockTargetUntil=Math.max(owner.lockTargetUntil||0,intentUntil);",
'hold intent duration')
write(p,t)

# 3) Controller: allow an early new decision only when the carry produced a genuinely new threat state.
p='runtime/protagonist_match_controller.js'; t=read(p)
old="""  else if(['CARRY','HOLD'].includes(tr.choiceId)){
    if(tr.possessionChangedAt!=null)ready=now-tr.possessionChangedAt>=1.20&&ballSettled;
    else ready=now>=tr.minimumUntil;
  }else if(tr.family==='패스'||tr.family==='크로스'){"""
new="""  else if(['CARRY','HOLD'].includes(tr.choiceId)){
    if(tr.possessionChangedAt!=null)ready=now-tr.possessionChangedAt>=1.20&&ballSettled;
    else if(tr.choiceId==='CARRY'&&heroOwnNow){const q=inspect(s),f=q?.frame||{},moved=protagonistMovement(s.currentScene)||0,critical=!!(f.shot?.oneVOne||(f.shot?.inBox&&f.shot?.openWindow&&(f.shot?.blockers??9)<=1));ready=(critical&&now>=tr.startedAt+1.25)||(moved>=6.0&&now>=tr.startedAt+2.35)||now>=tr.minimumUntil;}
    else ready=now>=tr.minimumUntil;
  }else if(tr.family==='패스'||tr.family==='크로스'){"""
t=replace_once(t,old,new,'meaningful carry checkpoint')
write(p,t)

# 4) Tactics: recovering 8s leave the striker's central lane instead of sharing the same path.
p='runtime/tactical_movement.js'; t=read(p)
anchor="""function targetSeparation(m){
"""
helper="""function separateRecoveringMidfieldFromStriker(m,team){
  const st=teamPlayers(m,team).find(p=>p.slot==='ST');if(!st)return;
  const sl=worldToLocal(team,st.x,st.y);
  for(const p of teamPlayers(m,team).filter(p=>['LCM','RCM'].includes(p.slot)&&['RECOVER_MIDFIELD_8','BOX_EDGE_SUPPORT','SECOND_WAVE_8'].includes(p.tacticalTask))){
    const pl=worldToLocal(team,p.x,p.y);if(Math.hypot(pl.x-sl.x,pl.y-sl.y)>7.0||Math.abs(pl.y-sl.y)>3.8)continue;
    const sign=p.slot==='RCM'?1:-1,tl=worldToLocal(team,p.tx,p.ty),wantedY=clamp(sl.y+sign*5.2,18,50),w=localToWorld(team,Math.min(tl.x,pl.x-1.0),wantedY);p.tx=w.x;p.ty=w.y;p.action=p.tacticalTask='RECOVER_MIDFIELD_LANE';p.sprint=true;m.stats.midfieldStrikerLaneSeparations=(m.stats.midfieldStrikerLaneSeparations||0)+1;
  }
}

function targetSeparation(m){
"""
t=replace_once(t,anchor,helper,'midfield striker lane helper')
t=replace_once(t,
"assignAttack(m,poss,ctx);const defTeam=other(poss);assignDefence(m,defTeam,ctx);",
"assignAttack(m,poss,ctx);separateRecoveringMidfieldFromStriker(m,poss);const defTeam=other(poss);assignDefence(m,defTeam,ctx);",
'call midfield lane separation')
write(p,t)

# 5) Bug backend: store the exact integrated debug JSON object and link it from the issue.
worker="""const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...extra}});
function cors(origin,env){const allowed=(env.ALLOWED_ORIGIN||'https://1lisam.github.io').split(',').map(x=>x.trim());return allowed.includes(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'}:{};}
function validId(v){return typeof v==='string'&&/^[a-zA-Z0-9-]{12,80}$/.test(v)}
async function githubIssue(env,title,body){const r=await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`,{method:'POST',headers:{'authorization':`Bearer ${env.GITHUB_TOKEN}`,'accept':'application/vnd.github+json','user-agent':'FLR-Bug-Reporter','x-github-api-version':'2022-11-28','content-type':'application/json'},body:JSON.stringify({title,body})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`GitHub ${r.status}: ${j.message||'issue create failed'}`);return j;}
export default {async fetch(request,env){const u=new URL(request.url),origin=request.headers.get('origin')||'',ch=cors(origin,env);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:ch});
  if(request.method==='GET'&&u.pathname.startsWith('/reports/')){const key=u.pathname.slice(1),obj=await env.BUG_REPORTS.get(key);if(!obj)return new Response('Not found',{status:404});return new Response(obj.body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=31536000, immutable','content-disposition':`inline; filename="${key.split('/').at(-1)||'FLR_BUG_REPORT.json'}"`}});}
  if(request.method!=='POST'||u.pathname!=='/report')return json({ok:false,error:'not found'},404,ch);
  if(!ch['access-control-allow-origin'])return json({ok:false,error:'origin not allowed'},403,ch);
  const len=Number(request.headers.get('content-length')||0);if(len>8_000_000)return json({ok:false,error:'report too large'},413,ch);
  let p;try{p=await request.json()}catch{return json({ok:false,error:'invalid json'},400,ch)}
  if(!validId(p.reportId)||!p.debug||typeof p.description!=='string'||!p.description.trim())return json({ok:false,error:'invalid report'},400,ch);
  const reportId=p.reportId,build=String(p.build||'UNKNOWN').replace(/[^A-Za-z0-9._-]+/g,'_'),key=`reports/${build}/${reportId}.json`,metaKey=`meta/${reportId}.json`,raw=JSON.stringify(p.debug),sizeBytes=new TextEncoder().encode(raw).byteLength;
  if(sizeBytes>7_500_000)return json({ok:false,error:'debug json too large',sizeBytes},413,ch);
  const existingMeta=await env.BUG_REPORTS.get(metaKey);if(existingMeta){const m=await existingMeta.json();return json({ok:true,deduplicated:true,...m},200,ch);}
  await env.BUG_REPORTS.put(key,raw,{httpMetadata:{contentType:'application/json'},customMetadata:{reportId,build,sizeBytes:String(sizeBytes)}});
  const publicUrl=`${u.origin}/${key}`,short=String(p.description).replace(/\\s+/g,' ').slice(0,72),title=`[${p.build||'FLR'}][P${p.priority||3}][${p.category||'기타'}] ${short}`,choice=p.summary?.c||[null,null],minute=Number.isFinite(p.summary?.s?.[0])?Math.floor(p.summary.s[0]/60)+1:'?';
  const body=`### 사용자 설명\\n${p.description}\\n\\n### 자동 첨부\\n- Report ID: \\`${reportId}\\`\\n- 버전: ${p.build||'-'}\\n- 경기 시각: ${minute}분\\n- 분류: ${p.category||'-'}\\n- 중요도: P${p.priority||3}\\n- 선택: ${choice[0]||'-'} → ${choice[1]||'-'}\\n- **전체 통합 JSON 원본:** ${publicUrl}\\n- JSON 크기: ${(sizeBytes/1024).toFixed(1)} KiB\\n\\n> 위 링크는 사용자가 직접 '전체 JSON 저장'으로 내려받던 통합 디버그 객체와 같은 원본 JSON입니다.`;
  let issue;try{issue=await githubIssue(env,title,body)}catch(e){await env.BUG_REPORTS.delete(key);return json({ok:false,error:String(e.message||e)},502,ch)}
  const meta={reportId,issueNumber:issue.number,issueUrl:issue.html_url,jsonUrl:publicUrl,sizeBytes};try{await env.BUG_REPORTS.put(metaKey,JSON.stringify(meta),{httpMetadata:{contentType:'application/json'}})}catch(_e){}
  return json({ok:true,...meta},201,ch);
}}};
"""
write('bug-report-worker/worker.js',worker)

# Public config is deliberately token-free. Only the Worker URL belongs here.
write('bug_report_config.js',"window.FLR_BUG_REPORT_ENDPOINT = window.FLR_BUG_REPORT_ENDPOINT || ''; // set to https://<worker>/report after one-time Worker deployment\n")

# Browser: POST the full makeIntegratedDebug object; safe fallback preserves current manual flow.
p='step71_hybrid_v06_ui.js'; t=read(p)
pattern=r"function currentDebugForBug\(\).*?function loop\(ts\)"
replacement=r"""function currentDebugForBug(){return bugDebugOverride||(session&&activeBoundary?makeIntegratedDebug():latestIntegratedDebug)||null}
function compactBugSnapshot(d){if(!d)return null;const hr=d.highResolution||{},hb=d.hybridBefore||{},frames=hr.postActionFrames?.length?hr.postActionFrames:hr.preActionFrames||[],last=frames.at?.(-1)||hr.entrySnapshot||null,hero=hb.boundary?.heroPlayerId||$('heroPlayer').value,ball=last?.ball||{},selected=hr.selectedChoice||null,ps=last?.players||[],anchor=ps.find(p=>p.id===hero)||{x:ball.x||0,y:ball.y||0},need=new Set([hero,ball.ownerId,selected?.targetId].filter(Boolean));ps.slice().sort((a,b)=>Math.min(Math.hypot(a.x-anchor.x,a.y-anchor.y),Math.hypot(a.x-(ball.x||0),a.y-(ball.y||0)))-Math.min(Math.hypot(b.x-anchor.x,b.y-anchor.y),Math.hypot(b.x-(ball.x||0),b.y-(ball.y||0)))).slice(0,9).forEach(p=>need.add(p.id));const players=ps.filter(p=>need.has(p.id)).map(p=>[p.id,p.team,p.slot,Number(p.x.toFixed(1)),Number(p.y.toFixed(1)),Number((p.vx||0).toFixed(1)),Number((p.vy||0).toFixed(1)),p.tacticalTask||p.action||null,p.markTargetId||null]);return{sv:'FLR_BUG_0.3',b:'TT-0.50',step:78,seed:world?.seed||seed(),bd:[hb.boundary?.id||null,hb.boundary?.atSecond!=null?Number(hb.boundary.atSecond.toFixed(1)):null,hb.boundary?.reason||null,hero],c:[selected?.id||null,selected?.targetId||null],r:[hr.actualResult?.code||null,hr.actualResult?.headline||null],o:(hr.decision?.options||[]).map(o=>[o.id,o.targetId||null,o.label]),s:last?[Number(last.time.toFixed(1)),last.score,last.phase,last.possession,[ball.mode,Number((ball.x||0).toFixed(1)),Number((ball.y||0).toFixed(1)),ball.ownerId||null],players]:null,e:(hr.actualEvents||[]).slice(-8).map(e=>[Number(e.t.toFixed(1)),e.type,e.actorId||null,e.targetId||null]),canon:{fp:false,exactTarget:true}}}
function openBugModal(debugOverride=null){bugDebugOverride=debugOverride||null;const d=currentDebugForBug();if(!d)return;const m=$('heroBugModal');$('heroBugDescription').value='';m.hidden=false;setTimeout(()=>$('heroBugDescription').focus(),0)}
function closeBugModal(){bugDebugOverride=null;$('heroBugModal').hidden=true}
function bugFallbackUrl(desc,cat,prio,snap,d){const sec=snap?.s?.[0],minute=Number.isFinite(sec)?Math.floor(sec/60)+1:'?',choiceId=snap?.c?.[0]||'-',targetId=snap?.c?.[1]||'-',short=desc.replace(/\s+/g,' ').slice(0,64),title=`[TT-0.50][P${prio}][${cat}] ${short}`,fullReport=`### 사용자 설명\n${desc}\n\n### 자동 첨부\n- 버전: TT-0.50 USER_VISUAL_RETEST\n- 경기 시각: ${minute}분\n- 분류: ${cat}\n- 중요도: P${prio}\n- 선택: ${choiceId} → ${targetId}\n\n\`\`\`json\n${JSON.stringify(d,null,2)}\n\`\`\``,body=`### 사용자 설명\n${desc}\n\n### 자동 첨부\n- 버전: TT-0.50 USER_VISUAL_RETEST\n- 경기 시각: ${minute}분\n- 분류: ${cat}\n- 중요도: P${prio}\n- 선택: ${choiceId} → ${targetId}\n\n> 전체 JSON 자동 연결 서버에 접근하지 못해 원본 JSON을 클립보드에 복사했습니다.`;navigator.clipboard?.writeText(fullReport).catch(()=>{});return`https://github.com/1Lisam/FLR_TEST/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`}
async function openGitHubBugIssue(){const d=currentDebugForBug();if(!d)return;const desc=$('heroBugDescription').value.trim();if(!desc){$('heroBugDescription').focus();return;}const cat=$('heroBugCategory').value,prio=$('heroBugPriority').value,snap=compactBugSnapshot(d),endpoint=String(window.FLR_BUG_REPORT_ENDPOINT||'').trim(),button=$('heroBugOpenIssue')||$('heroBugSubmit'),popup=window.open('about:blank','_blank');if(button){button.disabled=true;button.textContent=endpoint?'전체 JSON 업로드 중…':'GitHub 등록 화면 여는 중…';}
  try{
    if(endpoint){const rid=`tt050-${crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}`,payload={reportId:rid,build:'TT-0.50',step:78,category:cat,priority:Number(prio),description:desc,summary:snap,debug:d,client:{userAgent:navigator.userAgent,href:location.href}},r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`);if(popup)popup.location.href=j.issueUrl;else window.open(j.issueUrl,'_blank','noopener');closeBugModal();return;}
    const u=bugFallbackUrl(desc,cat,prio,snap,d);if(popup)popup.location.href=u;else window.open(u,'_blank','noopener');closeBugModal();
  }catch(err){console.warn('FLR full bug report upload failed',err);const u=bugFallbackUrl(desc,cat,prio,snap,d);if(popup)popup.location.href=u;else window.open(u,'_blank','noopener');closeBugModal();}
  finally{if(button){button.disabled=false;button.textContent='GitHub에 등록';}}
}
function loop(ts)"""
t2,n=re.subn(pattern,replacement,t,count=1,flags=re.S)
if n!=1: raise SystemExit(f'TT050_REPLACE_COUNT bug report UI expected=1 actual={n}')
write(p,t2)

p='index.html'; t=read(p)
t=replace_once(t,
"<script src=\"in_pitch_choice_ui.js\"></script><script src=\"step71_hybrid_v06_ui.js\"></script>",
"<script src=\"in_pitch_choice_ui.js\"></script><script src=\"bug_report_config.js\"></script><script src=\"step71_hybrid_v06_ui.js\"></script>",
'bug config script')
t=replace_once(t,
"현재 TT 버전, 경기 시간, seed, 선택 choiceId + exact targetId, 선수/공 위치와 최근 이벤트가 자동 첨부됩니다. GitHub 등록 화면에서 마지막 Submit만 누르면 됩니다.",
"등록 버튼을 누르면 현재 Episode의 전체 통합 JSON 원본을 자동 저장하고 GitHub Issue에 링크합니다. 서버가 아직 연결되지 않았거나 업로드에 실패하면 기존 수동 GitHub 등록 방식으로 안전하게 전환됩니다.",
'bug modal help')
write(p,t)
print('TT050_APPLY_OK')
