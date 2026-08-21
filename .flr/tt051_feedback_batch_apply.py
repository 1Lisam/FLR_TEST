#!/usr/bin/env python3
import pathlib,re,sys
root=pathlib.Path(sys.argv[1])

def read(p): return (root/p).read_text(encoding='utf-8')
def write(p,s): (root/p).write_text(s,encoding='utf-8')
def rep(s,old,new,label,count=1):
    n=s.count(old)
    if n!=count: raise SystemExit(f'{label}: expected {count}, found {n}')
    return s.replace(old,new,count)

# 1) Wingers that finish a release run beyond the line must recover onside rather than freeze there.
p=pathlib.Path('runtime/tactical_movement.js'); s=read(p)
s=rep(s,"const entering=!['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','FAR_SIDE_RUN'].includes(p.tacticalTask)","const entering=!['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','FAR_SIDE_RUN','FAR_SIDE_HOLD','FAR_SIDE_RECOVER'].includes(p.tacticalTask)",'release timing continuity')
old="""if(phase==='FINAL_THIRD'&&!ss){
      const x=releaseForwardLocal(m,p,clamp(progress+8,82,91.5)),y=34+sg*16.0,runAlive=x>local.x+.85;
      return{lx:runAlive?x:Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':'FAR_SIDE_HOLD',sprint:runAlive};
    }
    if(!ss&&progress>48){const x=releaseForwardLocal(m,p,Math.max(front+5,progress+8)),y=34+sg*(18.5*pr.wingerWidth),runAlive=x>local.x+.85;return{lx:runAlive?x:Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':'FAR_SIDE_HOLD',sprint:runAlive};}"""
new="""if(phase==='FINAL_THIRD'&&!ss){
      const wanted=clamp(progress+8,82,91.5),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*16.0,runAlive=x>local.x+.85,recover=local.x>safeX+.18;
      return{lx:runAlive?x:recover?safeX:Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':'FAR_SIDE_HOLD',sprint:runAlive||recover};
    }
    if(!ss&&progress>48){const wanted=Math.max(front+5,progress+8),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*(18.5*pr.wingerWidth),runAlive=x>local.x+.85,recover=local.x>safeX+.18;return{lx:runAlive?x:recover?safeX:Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':'FAR_SIDE_HOLD',sprint:runAlive||recover};}"""
s=rep(s,old,new,'far-side onside recovery')
write(p,s)

# 2) UI: explicit JSON attachment checkbox, no backdrop dismissal, goal-aware history headline.
p=pathlib.Path('index.html'); s=read(p)
old='<label style="margin-top:10px">문제 설명<textarea id="heroBugDescription" placeholder="지금 화면에서 무엇이 이상했는지 적어주세요."></textarea></label><p class="muted">등록 버튼을 누르면 현재 Episode의 전체 통합 JSON 원본과 설명을 서버에 자동 저장합니다. 테스터는 GitHub 로그인이 필요하지 않습니다. 서버에 GitHub 이슈 작성 권한이 연결된 경우 이슈도 자동 생성됩니다.</p>'
new='<label style="margin-top:10px">문제 설명<textarea id="heroBugDescription" placeholder="지금 화면에서 무엇이 이상했는지 적어주세요."></textarea></label><label class="inline-check" style="margin-top:10px"><input type="checkbox" id="heroBugAttachJson" checked> 경기 상황(JSON) 첨부</label><p class="muted">체크하면 현재 상황 + 직전 상황의 통합 JSON을 함께 저장합니다. UI/문구처럼 경기 상황이 필요 없는 문제는 체크를 해제할 수 있습니다. 설명·분류·등록 ID는 JSON 없이도 저장됩니다. 테스터는 GitHub 로그인이 필요하지 않습니다.</p>'
s=rep(s,old,new,'bug attachment checkbox')
write(p,s)

p=pathlib.Path('step71_hybrid_v06_ui.js'); s=read(p)
s=rep(s,"function openBugModal(debugOverride=null){bugDebugOverride=debugOverride||null;const d=currentDebugForBug();if(!d)return;const m=$('heroBugModal');$('heroBugDescription').value='';m.hidden=false;setTimeout(()=>$('heroBugDescription').focus(),0)}","function openBugModal(debugOverride=null){bugDebugOverride=debugOverride||null;const d=currentDebugForBug();if(!d)return;const m=$('heroBugModal');$('heroBugDescription').value='';const attach=$('heroBugAttachJson');if(attach)attach.checked=true;m.hidden=false;setTimeout(()=>$('heroBugDescription').focus(),0)}",'modal reset checkbox')
# Outside click must never discard a draft.
s=rep(s,"if($('heroBugModal'))$('heroBugModal').onclick=e=>{if(e.target===$('heroBugModal'))closeBugModal()};","if($('heroBugModal'))$('heroBugModal').onclick=e=>{if(e.target===$('heroBugModal'))e.stopPropagation()};",'modal backdrop no-close')
# Goal-aware history: if a goal occurred in the completed episode, show 득점/실점 rather than generic possession wording.
needle="function handback(){ensurePitchChoice()?.hide();"
helper="function episodeHistoryHeadline(events,lastResult){const goal=[...(events||[])].reverse().find(e=>e?.type==='GOAL');if(goal)return goal.team==='HOME'?'득점':'실점';return lastResult?.headline||'선택 Episode'}\n"
if needle not in s: raise SystemExit('handback insertion anchor missing')
s=s.replace(needle,helper+needle,1)
s=rep(s,"headline:session.lastResult?.headline||'선택 Episode'","headline:episodeHistoryHeadline(events,session.lastResult)",'goal history headline')
# Fallback text can omit the giant debug body.
s=s.replace("${JSON.stringify(d,null,2)}","${d?JSON.stringify(d,null,2):'경기 상황 JSON 첨부 안 함'}",1)
s=s.replace("전체 JSON 자동 연결 서버에 접근하지 못해 원본 JSON을 클립보드에 복사했습니다.","${d?'전체 JSON 자동 연결 서버에 접근하지 못해 원본 JSON을 클립보드에 복사했습니다.':'경기 상황 JSON을 첨부하지 않은 리포트입니다.'}",1)
# Replace submit function atomically.
pat=r"async function openGitHubBugIssue\(\)\{.*?\n\}\nfunction loop\(ts\)"
m=re.search(pat,s,re.S)
if not m: raise SystemExit('openGitHubBugIssue block missing')
newfun="""async function openGitHubBugIssue(){const d=currentDebugForBug();if(!d)return;const desc=$('heroBugDescription').value.trim();if(!desc){$('heroBugDescription').focus();return;}const cat=$('heroBugCategory').value,prio=$('heroBugPriority').value,snap=compactBugSnapshot(d),attachJson=$('heroBugAttachJson')?.checked!==false,endpoint=String(window.FLR_BUG_REPORT_ENDPOINT||'').trim(),button=$('heroBugOpenIssue')||$('heroBugSubmit');if(button){button.disabled=true;button.textContent=endpoint?'버그 등록 중…':'등록 서버 확인 중…';}
  try{if(!endpoint)throw new Error('BUG_REPORT_ENDPOINT_MISSING');const rid=`tt051-${crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}`,reportBundle=attachJson?makeBugReportBundle(d,{reportId:rid,description:desc,category:cat,priority:prio}):null,payload={reportId:rid,build:'TT-0.51',step:78,category:cat,priority:Number(prio),description:desc,summary:snap,debug:reportBundle,client:{userAgent:navigator.userAgent,href:location.href}},r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||`HTTP ${r.status}`);closeBugModal();const scope=attachJson?`현재 상황${reportBundle?.previousSituation?' + 직전 상황':''} 저장됨`:'경기 상황 JSON 미첨부',msg=`버그 등록 완료 · ${j.reportId||rid} · ${scope} · GitHub 로그인 불필요`;$('heroPlayback').textContent=msg;pushLiveFeed(msg,'scene');return;}
  catch(err){console.warn('FLR anonymous bug report failed',err);const rid=`tt051-fallback-${Date.now()}`,reportBundle=attachJson?makeBugReportBundle(d,{reportId:rid,description:desc,category:cat,priority:prio}):null,u=bugFallbackUrl(desc,cat,prio,snap,reportBundle);$('heroPlayback').textContent=attachJson?'자동 등록 실패 · 현재/직전 상황 JSON을 클립보드에 복사했습니다.':'자동 등록 실패 · 설명만 GitHub 등록 화면으로 전달합니다.';window.open(u,'_blank','noopener');}
  finally{if(button){button.disabled=false;button.textContent='버그 등록';}}
}
function loop(ts)"""
s=s[:m.start()]+newfun+s[m.end():]
write(p,s)

# 3) D1 Worker: metadata-only reports are valid and return no jsonUrl.
p=pathlib.Path('bug-report-worker/worker.js'); s=read(p)
s=rep(s,"async function getDebug(db,reportId){const meta=await getMeta(db,reportId);if(!meta)return null;const rows=(await db.prepare('SELECT chunk_no,data FROM bug_report_chunks WHERE report_id=? ORDER BY chunk_no').bind(reportId).all()).results||[];if(rows.length!==Number(meta.chunk_count))throw new Error('D1_REPORT_CHUNK_COUNT_MISMATCH');return{meta,debug:JSON.parse(rows.map(r=>r.data).join(''))};}","async function getDebug(db,reportId){const meta=await getMeta(db,reportId);if(!meta)return null;const count=Number(meta.chunk_count)||0;if(count===0)return{meta,debug:null};const rows=(await db.prepare('SELECT chunk_no,data FROM bug_report_chunks WHERE report_id=? ORDER BY chunk_no').bind(reportId).all()).results||[];if(rows.length!==count)throw new Error('D1_REPORT_CHUNK_COUNT_MISMATCH');return{meta,debug:JSON.parse(rows.map(r=>r.data).join(''))};}",'worker getDebug optional')
# GitHub issue link wording supports no JSON.
oldfrag='- **전체 통합 JSON 원본:** ${jsonUrl}\\n- JSON 크기: ${(sizeBytes/1024).toFixed(1)} KiB'
newfrag='${jsonUrl?`- **전체 통합 JSON 원본:** ${jsonUrl}\\n- JSON 크기: ${(sizeBytes/1024).toFixed(1)} KiB`:`- 경기 상황 JSON: 첨부 안 함`}'
s=rep(s,oldfrag,newfrag,'worker issue optional JSON')
s=rep(s,"if(!got||safeBuild(got.meta.build)!==safeBuild(parts.at(-2)))return new Response('Not found',{status:404});return new Response(JSON.stringify(got.debug)","if(!got||got.debug==null||safeBuild(got.meta.build)!==safeBuild(parts.at(-2)))return new Response('Not found',{status:404});return new Response(JSON.stringify(got.debug)",'worker report GET no-debug 404')
old="return json({ok:true,reportId:meta.report_id,jsonUrl:`${u.origin}/reports/${safeBuild(meta.build)}/${meta.report_id}.json`,reportUrl:`${u.origin}/report-meta/${meta.report_id}`,sizeBytes:meta.size_bytes,build:meta.build,createdAt:meta.created_at,category:meta.category,priority:meta.priority,description:meta.description,summary:meta.summary_json?JSON.parse(meta.summary_json):null,storage:'D1'},200,{'cache-control':'no-store'});"
new="const hasDebug=Number(meta.chunk_count)>0;return json({ok:true,reportId:meta.report_id,jsonUrl:hasDebug?`${u.origin}/reports/${safeBuild(meta.build)}/${meta.report_id}.json`:null,reportUrl:`${u.origin}/report-meta/${meta.report_id}`,sizeBytes:meta.size_bytes,build:meta.build,createdAt:meta.created_at,category:meta.category,priority:meta.priority,description:meta.description,summary:meta.summary_json?JSON.parse(meta.summary_json):null,storage:'D1',hasDebug},200,{'cache-control':'no-store'});"
s=rep(s,old,new,'worker meta hasDebug')
s=rep(s,"if(!validId(p.reportId)||!p.debug||typeof p.description!=='string'||!p.description.trim())return json({ok:false,error:'invalid report'},400,ch);","if(!validId(p.reportId)||typeof p.description!=='string'||!p.description.trim())return json({ok:false,error:'invalid report'},400,ch);",'worker allow metadata-only')
old="const reportId=p.reportId,build=safeBuild(p.build),raw=JSON.stringify(p.debug),sizeBytes=utf8Size(raw);if(sizeBytes>7_500_000)return json({ok:false,error:'debug json too large',sizeBytes},413,ch);const existing=await getMeta(env.BUG_REPORT_DB,reportId);if(existing)return json({ok:true,deduplicated:true,reportId,jsonUrl:`${u.origin}/reports/${build}/${reportId}.json`,reportUrl:`${u.origin}/report-meta/${reportId}`,sizeBytes:existing.size_bytes,build:existing.build,createdAt:existing.created_at,category:existing.category,priority:existing.priority,description:existing.description,summary:existing.summary_json?JSON.parse(existing.summary_json):null,storage:'D1'},200,ch);"
new="const reportId=p.reportId,build=safeBuild(p.build),hasDebug=p.debug!=null,raw=hasDebug?JSON.stringify(p.debug):'',sizeBytes=hasDebug?utf8Size(raw):0;if(sizeBytes>7_500_000)return json({ok:false,error:'debug json too large',sizeBytes},413,ch);const existing=await getMeta(env.BUG_REPORT_DB,reportId);if(existing){const existingHasDebug=Number(existing.chunk_count)>0;return json({ok:true,deduplicated:true,reportId,jsonUrl:existingHasDebug?`${u.origin}/reports/${build}/${reportId}.json`:null,reportUrl:`${u.origin}/report-meta/${reportId}`,sizeBytes:existing.size_bytes,build:existing.build,createdAt:existing.created_at,category:existing.category,priority:existing.priority,description:existing.description,summary:existing.summary_json?JSON.parse(existing.summary_json):null,storage:'D1',hasDebug:existingHasDebug},200,ch);}"
s=rep(s,old,new,'worker optional raw/dedupe')
s=rep(s,"const chunks=chunkUtf8(raw),createdAt=new Date().toISOString(),category=cleanText(p.category,80),priority=Math.max(1,Math.min(5,Number(p.priority)||3)),description=String(p.description).trim().slice(0,4000),summaryJson=JSON.stringify(p.summary||null),schemaVersion=cleanText(p.debug?.schemaVersion,80)||null;","const chunks=hasDebug?chunkUtf8(raw):[],createdAt=new Date().toISOString(),category=cleanText(p.category,80),priority=Math.max(1,Math.min(5,Number(p.priority)||3)),description=String(p.description).trim().slice(0,4000),summaryJson=JSON.stringify(p.summary||null),schemaVersion=hasDebug?(cleanText(p.debug?.schemaVersion,80)||null):null;",'worker optional chunks')
old="const jsonUrl=`${u.origin}/reports/${build}/${reportId}.json`,reportUrl=`${u.origin}/report-meta/${reportId}`,baseMeta={reportId,jsonUrl,reportUrl,sizeBytes,build,createdAt,category,priority,description,summary:p.summary||null,storage:'D1',chunkCount:chunks.length};"
new="const jsonUrl=hasDebug?`${u.origin}/reports/${build}/${reportId}.json`:null,reportUrl=`${u.origin}/report-meta/${reportId}`,baseMeta={reportId,jsonUrl,reportUrl,sizeBytes,build,createdAt,category,priority,description,summary:p.summary||null,storage:'D1',chunkCount:chunks.length,hasDebug};"
s=rep(s,old,new,'worker optional jsonUrl')
write(p,s)
print('TT-0.51 feedback batch patch applied')
