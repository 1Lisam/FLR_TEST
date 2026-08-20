const fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||'.');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];function ok(name,cond,detail=''){checks.push({name,status:cond?'PASS':'FAIL',detail});if(!cond)throw new Error(name+(detail?': '+detail:''));}
const h=read('live_hybrid_session_v02.js'),a=read('live_v06_scene_authority_browser.js'),u=read('step71_hybrid_v06_ui.js'),w=read('bug-report-worker/worker.js'),idx=read('index.html'),rd=read('bug-report-worker/README.md');
ok('nonhero-shot-boundary',h.includes("type:'NON_HERO_SHOT_2D_WINDOW'"));
ok('lowres-shot-no-goal-resolution',h.includes('A non-hero shot is never resolved in low resolution')&&!h.includes("s.score[team]++;s.counters.goals++"));
ok('resume-accepts-shot-window',h.includes("'NON_HERO_SHOT_2D_WINDOW'"));
ok('authority-shot-window',a.includes('function runNonHeroShotWindow(')&&a.includes('UNCHOSEN_PROTAGONIST_NON_HERO_SHOT_ACTION_FORBIDDEN'));
ok('authority-export',a.includes('runSetPieceWindow,runNonHeroShotWindow,runFinalWindow'));
ok('ui-replay-only-goal',u.includes("r.boundary?.type==='NON_HERO_SHOT_2D_WINDOW'")&&u.includes('실제 V0.6 득점 과정 2D 표시'));
ok('ui-anonymous-submit',u.includes('GitHub 로그인 불필요')&&!u.includes("popup=window.open('about:blank'"));
ok('worker-anonymous-meta',w.includes("u.pathname.startsWith('/report-meta/')")&&w.includes('issueCreated:!!issue'));
ok('worker-token-optional',w.includes('if(!env.GITHUB_ISSUE_TOKEN)return null'));
ok('index-no-login-copy',idx.includes('테스터는 GitHub 로그인이 필요하지 않습니다.')&&idx.includes('id="heroBugOpenIssue">버그 등록</button>'));
ok('readme-no-login-flow',rd.includes('GitHub 로그인이나 GitHub Issue 작성 화면이 필요하지 않습니다.'));

// Anonymous worker round-trip: no GitHub token, report must still be accepted and retrievable.
const cp=require('child_process'),{pathToFileURL}=require('url');
const workerUrl=pathToFileURL(path.join(root,'bug-report-worker/worker.js')).href;
const esm=`import worker from ${JSON.stringify(workerUrl)};class O{constructor(v){this.v=v;this.body=v}async json(){return JSON.parse(this.v)}}class R{constructor(){this.m=new Map()}async get(k){return this.m.has(k)?new O(this.m.get(k)):null}async put(k,v){this.m.set(k,String(v))}}const env={BUG_REPORTS:new R(),ALLOWED_ORIGIN:'https://1lisam.github.io'};const p={reportId:'tt051-qa-123456789abc',build:'TT-0.51',category:'UI/다시보기',priority:3,description:'anonymous qa',summary:{s:[184],c:['SAFE_PASS','H-CM']},debug:{probe:'anonymous-roundtrip'}};let r=await worker.fetch(new Request('https://worker.example/report',{method:'POST',headers:{origin:'https://1lisam.github.io','content-type':'application/json'},body:JSON.stringify(p)}),env),j=await r.json();if(r.status!==201||!j.ok||j.issueCreated!==false||!j.jsonUrl||!j.reportUrl)process.exit(2);r=await worker.fetch(new Request(j.jsonUrl),env);const d=await r.json();if(d.probe!=='anonymous-roundtrip')process.exit(3);r=await worker.fetch(new Request(j.reportUrl),env);const m=await r.json();if(m.description!=='anonymous qa'||m.issueCreated!==false)process.exit(4);console.log('ANON_PASS');`;
const wr=cp.spawnSync(process.execPath,['--input-type=module','-e',esm],{encoding:'utf8'});
ok('worker-anonymous-roundtrip',wr.status===0&&wr.stdout.includes('ANON_PASS'),`status=${wr.status} stderr=${(wr.stderr||'').slice(-300)}`);

// Dynamic hybrid/2D check: low-res must hand non-hero shot candidates to V0.6 and never emit a low-res GOAL first.
const H=require(path.join(root,'live_hybrid_session_v02.js')),A=require(path.join(root,'live_v06_scene_authority_browser.js'));
let found=0,goals=0,lowGoalLeak=0,shotWindowsWithNoPrecompute=0;
for(let i=1;i<=360&&found<24;i++){
  const s=H.createSession({seed:`PREDIST-${i}`,heroTeam:'HOME',heroRole:'ST',heroPlayerId:'H-ST',durationSeconds:1200});
  const r=H.advanceUntilBoundary(s);
  if(s.state.resolvedEvents.some(e=>e.kind==='GOAL'))lowGoalLeak++;
  if(r.boundary?.type!=='NON_HERO_SHOT_2D_WINDOW')continue;
  found++; if(r.boundary.futureOutcomePrecomputed===false)shotWindowsWithNoPrecompute++;
  const o=A.runNonHeroShotWindow(r.boundary,{seed:`PREDIST-${i}-HR`,runtimeDir:path.join(root,'runtime'),durationSeconds:8});
  if(!o.pending&&o.actualEvents.some(e=>e.type==='GOAL'))goals++;
}
ok('dynamic-shot-window-sample',found>=8,`found=${found}`);
ok('dynamic-no-lowres-goal-leak',lowGoalLeak===0,`lowGoalLeak=${lowGoalLeak}`);
ok('dynamic-no-precompute',shotWindowsWithNoPrecompute===found,`flagged=${shotWindowsWithNoPrecompute}/${found}`);
ok('dynamic-highres-goal-observed',goals>=1,`goals=${goals}`);
console.log(JSON.stringify({schemaVersion:'FLR_TT051_PREDISTRIBUTION_VALIDATION_1.0',status:'PASS',checks,metrics:{found,goals,lowGoalLeak}},null,2));
