#!/usr/bin/env python3
import pathlib,re,sys

root=pathlib.Path(sys.argv[1]).resolve()

def write(rel,text):
    p=root/rel
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text,encoding='utf-8')

def replace_once(text,old,new,label):
    if old not in text:
        raise SystemExit(f'anchor missing: {label}')
    if text.count(old)!=1:
        raise SystemExit(f'anchor not unique: {label} count={text.count(old)}')
    return text.replace(old,new,1)

worker=r'''const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...extra}});
function cors(origin,env){const allowed=(env.ALLOWED_ORIGIN||'https://1lisam.github.io').split(',').map(x=>x.trim());return allowed.includes(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'}:{};}
function validId(v){return typeof v==='string'&&/^[a-zA-Z0-9-]{12,80}$/.test(v)}
function cleanText(v,n){return String(v||'').replace(/\s+/g,' ').trim().slice(0,n)}
function safeBuild(v){return String(v||'UNKNOWN').replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,80)||'UNKNOWN'}
const enc=new TextEncoder();
function utf8Size(s){return enc.encode(String(s)).byteLength}
function chunkUtf8(text,maxBytes=1500000){const out=[];let pos=0;while(pos<text.length){let lo=1,hi=Math.min(text.length-pos,maxBytes),best=1;while(lo<=hi){const mid=(lo+hi)>>1,n=utf8Size(text.slice(pos,pos+mid));if(n<=maxBytes){best=mid;lo=mid+1}else hi=mid-1;}let end=pos+best;if(end<text.length){const c=text.charCodeAt(end-1);if(c>=0xD800&&c<=0xDBFF)end--;}if(end<=pos)throw new Error('D1_CHUNK_SPLIT_FAILED');out.push(text.slice(pos,end));pos=end;}return out;}
async function getMeta(db,reportId){return db.prepare('SELECT report_id,build,created_at,category,priority,description,size_bytes,chunk_count,summary_json FROM bug_reports WHERE report_id=?').bind(reportId).first();}
async function getDebug(db,reportId){const meta=await getMeta(db,reportId);if(!meta)return null;const rows=(await db.prepare('SELECT chunk_no,data FROM bug_report_chunks WHERE report_id=? ORDER BY chunk_no').bind(reportId).all()).results||[];if(rows.length!==Number(meta.chunk_count))throw new Error('D1_REPORT_CHUNK_COUNT_MISMATCH');return{meta,debug:JSON.parse(rows.map(r=>r.data).join(''))};}
async function createGitHubIssue(env,p,jsonUrl,sizeBytes){if(!env.GITHUB_ISSUE_TOKEN)return null;const owner=env.GITHUB_OWNER||'1Lisam',repo=env.GITHUB_REPO||'FLR_TEST',prio=Math.max(1,Math.min(5,Number(p.priority)||3)),cat=cleanText(p.category,40)||'기타',desc=String(p.description||'').trim(),summary=p.summary||{},sec=summary?.s?.[0],minute=Number.isFinite(sec)?Math.floor(sec/60)+1:'?',choiceId=summary?.c?.[0]||'-',targetId=summary?.c?.[1]||'-',short=cleanText(desc,64)||'bug report',title=`[${cleanText(p.build,24)||'FLR'}][P${prio}][${cat}] ${short}`,body=`### 사용자 설명\n${desc}\n\n### 자동 첨부\n- 버전: ${cleanText(p.build,40)} USER_VISUAL_RETEST\n- 경기 시각: ${minute}분\n- 분류: ${cat}\n- 중요도: P${prio}\n- 선택: ${choiceId} → ${targetId}\n- **전체 통합 JSON 원본:** ${jsonUrl}\n- JSON 크기: ${(sizeBytes/1024).toFixed(1)} KiB\n\n> 비로그인 테스터가 FLR 버그 리포트에서 직접 전송한 보고서입니다.`,res=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,{method:'POST',headers:{'accept':'application/vnd.github+json','authorization':`Bearer ${env.GITHUB_ISSUE_TOKEN}`,'content-type':'application/json','user-agent':'FLR-Bug-Reporter','x-github-api-version':'2022-11-28'},body:JSON.stringify({title,body})});if(!res.ok){console.error(JSON.stringify({event:'github_issue_failed',status:res.status,reportId:p.reportId}));return null;}const out=await res.json();return{issueNumber:out.number,issueUrl:out.html_url};}
export default {async fetch(request,env){const u=new URL(request.url),origin=request.headers.get('origin')||'',ch=cors(origin,env);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:ch});if(!env.BUG_REPORT_DB)return json({ok:false,error:'D1 binding unavailable'},503,ch);
  if(request.method==='GET'&&u.pathname.startsWith('/reports/')){const parts=u.pathname.split('/').filter(Boolean),name=parts.at(-1)||'',reportId=name.endsWith('.json')?name.slice(0,-5):name;if(!validId(reportId))return new Response('Not found',{status:404});const got=await getDebug(env.BUG_REPORT_DB,reportId).catch(()=>null);if(!got||safeBuild(got.meta.build)!==safeBuild(parts.at(-2)))return new Response('Not found',{status:404});return new Response(JSON.stringify(got.debug),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-disposition':`inline; filename="${reportId}.json"`}});}
  if(request.method==='GET'&&u.pathname.startsWith('/report-meta/')){const reportId=u.pathname.slice('/report-meta/'.length);if(!validId(reportId))return json({ok:false,error:'invalid report id'},400);const meta=await getMeta(env.BUG_REPORT_DB,reportId);if(!meta)return json({ok:false,error:'not found'},404);return json({ok:true,reportId:meta.report_id,jsonUrl:`${u.origin}/reports/${safeBuild(meta.build)}/${meta.report_id}.json`,reportUrl:`${u.origin}/report-meta/${meta.report_id}`,sizeBytes:meta.size_bytes,build:meta.build,createdAt:meta.created_at,category:meta.category,priority:meta.priority,description:meta.description,summary:meta.summary_json?JSON.parse(meta.summary_json):null,storage:'D1'},200,{'cache-control':'no-store'});}
  if(request.method!=='POST'||u.pathname!=='/report')return json({ok:false,error:'not found'},404,ch);if(!ch['access-control-allow-origin'])return json({ok:false,error:'origin not allowed'},403,ch);const len=Number(request.headers.get('content-length')||0);if(len>8_000_000)return json({ok:false,error:'report too large'},413,ch);
  let p;try{p=await request.json()}catch{return json({ok:false,error:'invalid json'},400,ch)}if(!validId(p.reportId)||!p.debug||typeof p.description!=='string'||!p.description.trim())return json({ok:false,error:'invalid report'},400,ch);
  const reportId=p.reportId,build=safeBuild(p.build),raw=JSON.stringify(p.debug),sizeBytes=utf8Size(raw);if(sizeBytes>7_500_000)return json({ok:false,error:'debug json too large',sizeBytes},413,ch);const existing=await getMeta(env.BUG_REPORT_DB,reportId);if(existing)return json({ok:true,deduplicated:true,reportId,jsonUrl:`${u.origin}/reports/${build}/${reportId}.json`,reportUrl:`${u.origin}/report-meta/${reportId}`,sizeBytes:existing.size_bytes,build:existing.build,createdAt:existing.created_at,category:existing.category,priority:existing.priority,description:existing.description,summary:existing.summary_json?JSON.parse(existing.summary_json):null,storage:'D1'},200,ch);
  const chunks=chunkUtf8(raw),createdAt=new Date().toISOString(),category=cleanText(p.category,80),priority=Math.max(1,Math.min(5,Number(p.priority)||3)),description=String(p.description).trim().slice(0,4000),summaryJson=JSON.stringify(p.summary||null),schemaVersion=cleanText(p.debug?.schemaVersion,80)||null;
  const statements=[env.BUG_REPORT_DB.prepare('INSERT INTO bug_reports(report_id,build,created_at,category,priority,description,size_bytes,chunk_count,summary_json,debug_schema_version) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(reportId,build,createdAt,category,priority,description,sizeBytes,chunks.length,summaryJson,schemaVersion),...chunks.map((data,i)=>env.BUG_REPORT_DB.prepare('INSERT INTO bug_report_chunks(report_id,chunk_no,data) VALUES(?,?,?)').bind(reportId,i,data))];await env.BUG_REPORT_DB.batch(statements);
  const jsonUrl=`${u.origin}/reports/${build}/${reportId}.json`,reportUrl=`${u.origin}/report-meta/${reportId}`,baseMeta={reportId,jsonUrl,reportUrl,sizeBytes,build,createdAt,category,priority,description,summary:p.summary||null,storage:'D1',chunkCount:chunks.length};const issue=await createGitHubIssue(env,p,jsonUrl,sizeBytes).catch(err=>{console.error(JSON.stringify({event:'github_issue_exception',reportId,error:String(err)}));return null;});return json({ok:true,...baseMeta,issueCreated:!!issue,...(issue||{})},201,ch);
}};
'''
write('bug-report-worker/worker.js',worker)

schema=r'''PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS bug_reports (
  report_id TEXT PRIMARY KEY,
  build TEXT NOT NULL,
  created_at TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 3,
  description TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  summary_json TEXT,
  debug_schema_version TEXT
);
CREATE TABLE IF NOT EXISTS bug_report_chunks (
  report_id TEXT NOT NULL,
  chunk_no INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (report_id, chunk_no),
  FOREIGN KEY (report_id) REFERENCES bug_reports(report_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bug_reports_build_created ON bug_reports(build, created_at DESC);
'''
write('bug-report-worker/schema.sql',schema)
write('bug-report-worker/wrangler.toml','''name = "flr-bug-reporter"\nmain = "worker.js"\ncompatibility_date = "2026-08-21"\n\n[vars]\nGITHUB_REPO = "1Lisam/FLR_TEST"\nALLOWED_ORIGIN = "https://1lisam.github.io"\n''')

workflow=r'''name: FLR Cloudflare Bug Reporter Deploy

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - '.flr/cloudflare-deploy.json'

permissions:
  contents: write

concurrency:
  group: flr-cloudflare-bug-reporter
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout main
        uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0
      - name: Check Cloudflare credentials
        id: creds
        shell: bash
        env:
          CF_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          if [ -n "${CF_API_TOKEN:-}" ]; then echo 'token=true' >> "$GITHUB_OUTPUT"; else echo 'token=false' >> "$GITHUB_OUTPUT"; fi
          if [ -n "${CF_ACCOUNT_ID:-}" ]; then echo 'account=true' >> "$GITHUB_OUTPUT"; else echo 'account=false' >> "$GITHUB_OUTPUT"; fi
          if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ACCOUNT_ID:-}" ]; then echo 'ready=true' >> "$GITHUB_OUTPUT"; else echo 'ready=false' >> "$GITHUB_OUTPUT"; fi
      - uses: actions/setup-node@v4
        if: steps.creds.outputs.ready == 'true'
        with:
          node-version: '24'
      - name: Provision D1, migrate schema, deploy Worker, verify round trip
        if: steps.creds.outputs.ready == 'true'
        id: cloudflare
        continue-on-error: true
        shell: bash
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          WRANGLER_OUTPUT_FILE_PATH: ${{ github.workspace }}/wrangler-output.ndjson
        run: |
          set -euo pipefail
          cd bug-report-worker
          npx --yes wrangler@latest d1 list --json > /tmp/flr_d1_list.json
          dbid="$(python - <<'PY'
import json
j=json.load(open('/tmp/flr_d1_list.json',encoding='utf-8'))
for row in j:
    if row.get('name')=='flr-bug-reports':
        print(row.get('uuid') or row.get('id') or '')
        break
PY
          )"
          if [ -z "$dbid" ]; then
            npx --yes wrangler@latest d1 create flr-bug-reports --location apac
            npx --yes wrangler@latest d1 list --json > /tmp/flr_d1_list.json
            dbid="$(python - <<'PY'
import json
j=json.load(open('/tmp/flr_d1_list.json',encoding='utf-8'))
for row in j:
    if row.get('name')=='flr-bug-reports':
        print(row.get('uuid') or row.get('id') or '')
        break
PY
            )"
          fi
          test -n "$dbid"
          cp wrangler.toml /tmp/flr-wrangler.toml
          printf '\n[[d1_databases]]\nbinding = "BUG_REPORT_DB"\ndatabase_name = "flr-bug-reports"\ndatabase_id = "%s"\n' "$dbid" >> /tmp/flr-wrangler.toml
          npx --yes wrangler@latest d1 execute flr-bug-reports --remote --yes --file=schema.sql --config /tmp/flr-wrangler.toml
          npx --yes wrangler@latest deploy --config /tmp/flr-wrangler.toml
          cd ..
          python - <<'PY'
import json,pathlib
p=pathlib.Path('wrangler-output.ndjson'); targets=[]
for line in p.read_text(encoding='utf-8').splitlines():
    try: row=json.loads(line)
    except Exception: continue
    if row.get('type')=='deploy': targets.extend(row.get('targets') or [])
urls=[str(x) for x in targets if str(x).startswith('https://')]
if not urls: raise SystemExit('WORKER_DEPLOY_URL_NOT_FOUND')
pathlib.Path('/tmp/flr_worker_url.txt').write_text(urls[0].rstrip('/'),encoding='utf-8')
PY
          endpoint="$(cat /tmp/flr_worker_url.txt)"; echo "endpoint=${endpoint}" >> "$GITHUB_OUTPUT"
          get_code="$(curl --max-time 15 -sS -o /dev/null -w '%{http_code}' "${endpoint}/reports/TT-0.51/_missing_.json" || true)"
          options_code="$(curl --max-time 15 -sS -o /dev/null -w '%{http_code}' -X OPTIONS "${endpoint}/report" -H 'Origin: https://1lisam.github.io' -H 'Access-Control-Request-Method: POST' || true)"
          [ "$get_code" = '404' ] && [ "$options_code" = '204' ]
          report_id="tt051-d1-smoke-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
          python - "$report_id" <<'PY' > /tmp/flr_d1_smoke.json
import json,sys
rid=sys.argv[1]
print(json.dumps({'reportId':rid,'build':'TT-0.51-D1-SMOKE','step':78,'category':'기타','priority':1,'description':'Automated D1 round-trip smoke','summary':{'smoke':True},'debug':{'schemaVersion':'FLR_BUG_REPORT_BUNDLE_0.3','probe':'d1-round-trip','reportId':rid}},ensure_ascii=False))
PY
          post_code="$(curl --max-time 20 -sS -o /tmp/flr_d1_smoke_response.json -w '%{http_code}' -X POST "${endpoint}/report" -H 'Origin: https://1lisam.github.io' -H 'Content-Type: application/json' --data-binary @/tmp/flr_d1_smoke.json || true)"
          [ "$post_code" = '201' ] || [ "$post_code" = '200' ]
          json_url="$(python - <<'PY'
import json
j=json.load(open('/tmp/flr_d1_smoke_response.json',encoding='utf-8'))
assert j.get('ok') and j.get('storage')=='D1' and j.get('jsonUrl')
print(j['jsonUrl'])
PY
          )"
          curl --max-time 20 -fsS "$json_url" -o /tmp/flr_d1_readback.json
          python - "$report_id" <<'PY'
import json,sys
j=json.load(open('/tmp/flr_d1_readback.json',encoding='utf-8'))
assert j=={'schemaVersion':'FLR_BUG_REPORT_BUNDLE_0.3','probe':'d1-round-trip','reportId':sys.argv[1]}
PY
          cd bug-report-worker
          npx --yes wrangler@latest d1 execute flr-bug-reports --remote --yes --config /tmp/flr-wrangler.toml --command "DELETE FROM bug_report_chunks WHERE report_id='${report_id}'; DELETE FROM bug_reports WHERE report_id='${report_id}';"
          cd ..
          echo 'smoke_ok=true' >> "$GITHUB_OUTPUT"; echo "post_code=${post_code}" >> "$GITHUB_OUTPUT"
      - name: Record deployment status and wire endpoint
        if: always()
        shell: bash
        env:
          READY: ${{ steps.creds.outputs.ready }}
          TOKEN_PRESENT: ${{ steps.creds.outputs.token }}
          ACCOUNT_PRESENT: ${{ steps.creds.outputs.account }}
          DEPLOY_OUTCOME: ${{ steps.cloudflare.outcome }}
          ENDPOINT: ${{ steps.cloudflare.outputs.endpoint }}
          SMOKE_OK: ${{ steps.cloudflare.outputs.smoke_ok }}
          E2E_POST: ${{ steps.cloudflare.outputs.post_code }}
          SOURCE_SHA: ${{ github.sha }}
        run: |
          set -euo pipefail
          git config user.name 'FLR Cloudflare Deploy Bot'; git config user.email 'actions@users.noreply.github.com'; git pull --rebase origin main; mkdir -p .flr
          python - <<'PY'
import json,os,pathlib
ready=os.environ.get('READY')=='true'; outcome=os.environ.get('DEPLOY_OUTCOME','skipped'); endpoint=(os.environ.get('ENDPOINT') or '').rstrip('/'); smoke=os.environ.get('SMOKE_OK')=='true'
if not ready:
    missing=[]
    if os.environ.get('TOKEN_PRESENT')!='true': missing.append('CLOUDFLARE_API_TOKEN')
    if os.environ.get('ACCOUNT_PRESENT')!='true': missing.append('CLOUDFLARE_ACCOUNT_ID')
    status='NEEDS_CREDENTIALS'
elif outcome!='success' or not endpoint or not smoke:
    missing=[]; status='D1_DEPLOY_FAILED'
else:
    missing=[]; status='DEPLOYED_D1'
    pathlib.Path('bug_report_config.js').write_text("window.FLR_BUG_REPORT_ENDPOINT = '"+endpoint+"/report'; // managed by FLR Cloudflare deploy workflow\n",encoding='utf-8')
obj={'schemaVersion':'FLR_CLOUDFLARE_D1_DEPLOY_STATUS_1.0','status':status,'worker':'flr-bug-reporter','storage':'D1','database':'flr-bug-reports','workerUrl':endpoint or None,'endpoint':endpoint+'/report' if status=='DEPLOYED_D1' else None,'missingSecrets':missing,'deployOutcome':outcome,'liveRoundTrip':{'ok':smoke,'postReport':os.environ.get('E2E_POST') or None},'sourceCommit':os.environ.get('SOURCE_SHA')}
pathlib.Path('.flr/cloudflare-deploy-status.json').write_text(json.dumps(obj,indent=2)+'\n',encoding='utf-8')
print(json.dumps(obj))
PY
          git add .flr/cloudflare-deploy-status.json bug_report_config.js
          git diff --cached --quiet || { git commit -m 'Record FLR bug reporter D1 deployment status'; git push origin HEAD:main; }
'''
write('.github/workflows/flr-cloudflare-bug-reporter.yml',workflow)

p=root/'live_v06_scene_authority_browser.js';s=p.read_text(encoding='utf-8')
anchor="function runtime(runtimeDir){"
helper=r'''function entryHash(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function entryNoise(key,salt){let x=entryHash(`${key}|${salt}`);x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)/4294967296)*2-1;}
function worldToLocal(team,x,y){return team==='HOME'?{x,y}:{x:105-x,y:68-y};}
function contextualEntry(p,ctx,bxy,boundary){const base=localBase(p,ctx),bl=worldToLocal(p.team,bxy.x,bxy.y),key=`${boundary.sceneId}|${p.id}`,n1=entryNoise(key,'x'),n2=entryNoise(key,'y'),n3=entryNoise(key,'run'),inPoss=ctx.possession===p.team,trans=ctx.phase==='TRANSITION',recent=(boundary.preContext||[]).slice(-5),actor=recent.some(e=>e?.detail?.actorId===p.id),target=recent.some(e=>e?.detail?.targetId===p.id);let x=base.x+n1*(trans?4.6:2.8),y=base.y+n2*(trans?3.8:2.5);if(inPoss){const pull=p.role==='CM'?.11:p.role==='WF'||p.role==='ST'?.075:p.role==='FB'?.055:.025;x+=clamp((bl.x-x)*pull,-4.2,4.2);y+=clamp((bl.y-y)*pull,-3.8,3.8);}else{x+=clamp((bl.x-x)*.035,-2.2,2.2);y+=clamp((bl.y-y)*.075,-3.2,3.2);if(trans)x-=2.2+Math.max(0,n3)*2.4;}if(actor){x+=clamp((bl.x-x)*.14,-4.8,4.8);y+=clamp((bl.y-y)*.14,-4.2,4.2);}if(target&&inPoss){x+=1.4+Math.max(0,n3)*2.4;y+=clamp((bl.y-y)*.08,-2.5,2.5);}x=clamp(x,4,101);y=clamp(y,4,64);let runX=inPoss?(p.role==='ST'||p.role==='WF'?3.6:p.role==='CM'?2.3:1.5):(trans?-3.3:-1.2),runY=clamp((bl.y-y)*.10,-2.8,2.8)+n2*.7;if(target&&inPoss)runX+=1.8;if(actor)runY*=.45;const w=localToWorld(p.team,x,y),wt=localToWorld(p.team,clamp(x+runX,4,101),clamp(y+runY,4,64)),vx=clamp((wt.x-w.x)/1.4,-5.5,5.5),vy=clamp((wt.y-w.y)/1.4,-4.5,4.5);return{x:w.x,y:w.y,tx:wt.x,ty:wt.y,vx,vy,action:trans&&!inPoss?'RECOVER_LIVE':inPoss?'SUPPORT_LIVE':'HOLD_LIVE'};}
'''
s=replace_once(s,anchor,helper+anchor,'insert contextual entry helpers')
old=r''' for(const p of m.players){const l=localBase(p,ctx),w=localToWorld(p.team,l.x,l.y);p.x=w.x;p.y=w.y;p.vx=p.vy=0;p.tx=p.x;p.ty=p.y;p.hasBall=false;p.action='HYBRID_ENTRY_SHAPE';p.tacticalTask='HYBRID_ENTRY_SHAPE';p.nextThink=m.time+.18+(Math.abs((p.id.charCodeAt(0)||1)*17+(p.slot?.length||1)*13)%24)/100;p.lockTargetUntil=0;p.markTargetId=null;p.runUntil=0;p.sprint=false;}
 let owner=m.players.find(p=>p.id===ctx.ball.ownerId);if(!owner||owner.team!==ctx.possession)owner=m.players.find(p=>p.team===ctx.possession&&p.role==='CM')||m.players.find(p=>p.team===ctx.possession&&p.role!=='GK');owner.x=bxy.x;owner.y=bxy.y;owner.tx=owner.x;owner.ty=owner.y;owner.hasBall=true;owner.controlledSince=m.time;owner.nextThink=m.time+.35;const hp=m.players.find(p=>p.id===hero);if(hp&&hp.id!==owner.id){const ht=hp.team,dir=ht==='HOME'?1:-1;if(boundary.reason==='ATTACKING_INVOLVEMENT'){hp.x=hp.role==='ST'?safeHeroAttackPosition(m,hp,bxy):clamp(bxy.x+dir*5.5,5,96);hp.y=clamp(34+(bxy.y-34)*.35,8,60);hp.tx=hp.x;hp.ty=hp.y;}else if(boundary.reason==='MIDFIELD_INVOLVEMENT'){hp.x=clamp(bxy.x-dir*4.5,6,99);hp.y=clamp(bxy.y+(hp.slot==='LCM'?-5:hp.slot==='RCM'?5:3),8,60);hp.tx=hp.x;hp.ty=hp.y;}else if(boundary.reason==='DEFENSIVE_TRANSITION'){const goalSide=ht==='HOME'?-1:1;hp.x=clamp(bxy.x+goalSide*6.0,5,100);hp.y=clamp(bxy.y+(hp.y>=bxy.y?3:-3),7,61);hp.tx=bxy.x;hp.ty=bxy.y;hp.action='RECOVER_GOAL_SIDE';hp.tacticalTask='RECOVER_GOAL_SIDE';}}'''
new=r''' for(const p of m.players){const e=contextualEntry(p,ctx,bxy,boundary);p.x=e.x;p.y=e.y;p.vx=e.vx;p.vy=e.vy;p.tx=e.tx;p.ty=e.ty;p.hasBall=false;p.action=e.action;p.tacticalTask='HYBRID_ENTRY_LIVE';p.nextThink=m.time+.12+(Math.abs((p.id.charCodeAt(0)||1)*17+(p.slot?.length||1)*13)%24)/100;p.lockTargetUntil=0;p.markTargetId=null;p.runUntil=m.time+1.4+Math.abs(entryNoise(`${boundary.sceneId}|${p.id}`,'hold'))*.9;p.sprint=Math.hypot(p.vx,p.vy)>2.5;}
 let owner=m.players.find(p=>p.id===ctx.ball.ownerId);if(!owner||owner.team!==ctx.possession)owner=m.players.find(p=>p.team===ctx.possession&&p.role==='CM')||m.players.find(p=>p.team===ctx.possession&&p.role!=='GK');owner.x=bxy.x;owner.y=bxy.y;const od=owner.team==='HOME'?1:-1;owner.tx=clamp(owner.x+od*2.2,3,102);owner.ty=clamp(owner.y+entryNoise(`${boundary.sceneId}|${owner.id}`,'owner-y')*.8,3,65);owner.vx=clamp((owner.tx-owner.x)/1.3,-4.2,4.2);owner.vy=clamp((owner.ty-owner.y)/1.3,-2.5,2.5);owner.hasBall=true;owner.controlledSince=m.time;owner.nextThink=m.time+.35;const hp=m.players.find(p=>p.id===hero);if(hp&&hp.id!==owner.id){const dir=hp.team==='HOME'?1:-1;if(boundary.reason==='ATTACKING_INVOLVEMENT'){hp.tx=clamp(hp.x+dir*(3.2+Math.max(0,entryNoise(boundary.sceneId,'hero-run'))*2.0),5,100);hp.ty=clamp(hp.y+(bxy.y-hp.y)*.10,6,62);hp.runUntil=Math.max(hp.runUntil,m.time+2.2);hp.sprint=true;hp.action='ATTACKING_RUN_LIVE';hp.tacticalTask='HYBRID_ENTRY_LIVE';}else if(boundary.reason==='DEFENSIVE_TRANSITION'){hp.tx=clamp(hp.x-dir*3.0,5,100);hp.ty=clamp(hp.y+(bxy.y-hp.y)*.16,6,62);hp.action='RECOVER_GOAL_SIDE';hp.tacticalTask='HYBRID_ENTRY_LIVE';}}'''
s=replace_once(s,old,new,'replace formation reset and hero teleport')
old2="function runToChoice(boundary,opts={}){const env=seedMatch(boundary,{...opts,explicitHeroChoiceRequired:true}),{E,P,state}=env,dt=.10,minPre=clamp(Number(opts.minPreSeconds)||5,5,7),maxSearch=clamp(Number(opts.maxSearchSeconds)||35,minPre,60),frames=[deep(env.entrySnapshot)],start=state.m.time;\n if(tryHeroOwnerCheckpoint(P,state))return{...env,frames,pending:deep(state.pending),scene:state.currentScene?deep(state.currentScene):null,searchSeconds:0,preSpan:0,hadChoice:true,futureOutcomePrecomputed:false};\n while(!state.m.completed&&!state.pending&&state.m.time<start+minPre-.001){P.step(state,dt);frames.push(deep(E.snapshot(state.m)));if(tryHeroOwnerCheckpoint(P,state))break;}"
new2="function runToChoice(boundary,opts={}){const env=seedMatch(boundary,{...opts,explicitHeroChoiceRequired:true}),{E,P,state}=env,dt=.10,minPre=clamp(Number(opts.minPreSeconds)||5,5,7),contextLead=clamp(Number(opts.contextLeadSeconds)||1.6,1.2,2.4),maxSearch=clamp(Number(opts.maxSearchSeconds)||35,minPre,60),frames=[deep(env.entrySnapshot)],start=state.m.time;\n while(!state.m.completed&&!state.pending&&state.m.time<start+contextLead-.001){P.step(state,dt);frames.push(deep(E.snapshot(state.m)));}\n if(!state.m.completed&&!state.pending)tryHeroOwnerCheckpoint(P,state);\n while(!state.m.completed&&!state.pending&&state.m.time<start+minPre-.001){P.step(state,dt);frames.push(deep(E.snapshot(state.m)));if(tryHeroOwnerCheckpoint(P,state))break;}"
s=replace_once(s,old2,new2,'delay first checkpoint for visible context')
p.write_text(s,encoding='utf-8')
print('TT-0.51 D1 + live entry patch applied')
