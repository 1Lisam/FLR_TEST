const fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||process.argv[1]||'.');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
const worker=read('bug-report-worker/worker.js'),wrangler=read('bug-report-worker/wrangler.toml'),schema=read('bug-report-worker/schema.sql'),wf=read('.github/workflows/flr-cloudflare-bug-reporter.yml'),auth=read('live_v06_scene_authority_browser.js');
add('worker-d1-binding',worker.includes('BUG_REPORT_DB')&&!worker.includes('env.BUG_REPORTS'));
add('worker-chunking',worker.includes('chunkUtf8')&&worker.includes('1500000'));
add('worker-report-id-metadata',worker.includes('INSERT INTO bug_reports')&&worker.includes('report_id'));
add('worker-d1-roundtrip-read',worker.includes('SELECT chunk_no,data FROM bug_report_chunks'));
add('worker-size-cap-preserved',worker.includes('7_500_000'));
add('schema-report-table',schema.includes('CREATE TABLE IF NOT EXISTS bug_reports'));
add('schema-chunk-table',schema.includes('CREATE TABLE IF NOT EXISTS bug_report_chunks'));
add('schema-build-time-index',schema.includes('idx_bug_reports_build_created'));
add('wrangler-no-r2',!wrangler.includes('r2_buckets'));
add('workflow-d1-list',wf.includes('wrangler@latest d1 list --json'));
add('workflow-d1-create',wf.includes('d1 create flr-bug-reports'));
add('workflow-d1-schema',wf.includes('d1 execute flr-bug-reports')&&wf.includes('schema.sql'));
add('workflow-live-roundtrip',wf.includes('d1-round-trip')&&wf.includes('flr_d1_readback'));
add('entry-contextual-helper',auth.includes('function contextualEntry'));
add('entry-live-task',auth.includes("tacticalTask='HYBRID_ENTRY_LIVE'"));
add('entry-no-zero-all-velocity',!auth.includes('p.vx=p.vy=0'));
add('entry-no-hero-teleport-safe-position',!auth.includes("hp.x=hp.role==='ST'?safeHeroAttackPosition"));
add('choice-context-lead',auth.includes('contextLead=clamp(Number(opts.contextLeadSeconds)||1.6,1.2,2.4)'));
add('choice-no-immediate-zero-span-return',!auth.includes('searchSeconds:0,preSpan:0,hadChoice:true'));
let dynamic={runs:[]};
try{
  const A=require(path.join(root,'live_v06_scene_authority_browser.js'));
  const makeBoundary=(sceneId,ownerId='H-CM',lane='CENTER',progress=.72)=>({sceneId,id:sceneId,type:'PROTAGONIST_2D_WINDOW',atSecond:600,reason:'ATTACKING_INVOLVEMENT',heroPlayerId:'H-ST',heroRole:'ST',heroTeam:'HOME',stateSnapshot:{second:600,score:{HOME:0,AWAY:0},possession:'HOME',zone:'FINAL_THIRD',phase:'FINAL_THIRD',danger:.62,ball:{team:'HOME',lane,progress,ownerId},structure:{HOME:{midfieldOccupancy:3,backLineOccupancy:4,width:56,lineHeight:55,transitionDebt:.18},AWAY:{midfieldOccupancy:3,backLineOccupancy:4,width:47,lineHeight:45,transitionDebt:.12}}},preContext:[{detail:{actorId:'H-RCM',targetId:'H-ST'}},{detail:{actorId:ownerId,targetId:'H-ST'}}],futureOutcomePrecomputed:false,choicePrecomputed:false});
  const cases=[makeBoundary('QA-LIVE-A','H-CM','CENTER',.72),makeBoundary('QA-LIVE-B','H-RCM','RIGHT',.76),makeBoundary('QA-LIVE-C','H-LCM','LEFT',.74)];
  for(const b of cases){const r=A.runToChoice(b,{runtimeDir:path.join(root,'runtime'),minPreSeconds:5,maxSearchSeconds:35,contextLeadSeconds:1.6});const ps=r.entrySnapshot?.players||[];const moving=ps.filter(p=>Math.hypot(Number(p.vx)||0,Number(p.vy)||0)>.05).length;const liveTasks=ps.filter(p=>p.tacticalTask==='HYBRID_ENTRY_LIVE').length;dynamic.runs.push({sceneId:b.sceneId,moving,liveTasks,hadChoice:r.hadChoice,preSpan:r.preSpan,searchSeconds:r.searchSeconds,futureOutcomePrecomputed:r.futureOutcomePrecomputed});}
  const first=dynamic.runs[0],choiceRuns=dynamic.runs.filter(x=>x.hadChoice);
  add('dynamic-entry-moving-majority',first.moving>=12,`moving=${first.moving}`);
  add('dynamic-entry-live-task-majority',first.liveTasks>=18,`liveTasks=${first.liveTasks}`);
  add('dynamic-future-not-precomputed',dynamic.runs.every(x=>x.futureOutcomePrecomputed===false));
  add('dynamic-choice-found',choiceRuns.length>=1,`choiceRuns=${choiceRuns.length}/3`);
  add('dynamic-choice-has-visible-lead',choiceRuns.every(x=>Number(x.searchSeconds)>=1.19&&Number(x.preSpan)>=1.0),JSON.stringify(choiceRuns));
}catch(e){add('dynamic-authority-run',false,String(e&&e.stack||e));}
const failures=checks.filter(x=>!x.ok);const out={schemaVersion:'FLR_TT051_D1_LIVE_ENTRY_VALIDATION_1.1',pass:failures.length===0,checks,dynamic,failures};console.log(JSON.stringify(out,null,2));process.exit(failures.length?1:0);
