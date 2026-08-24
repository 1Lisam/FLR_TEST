'use strict';
const path=require('path'),cp=require('child_process');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
function runJson(script,args=[]){const p=cp.spawnSync(process.execPath,[path.join(__dirname,script),...args],{encoding:'utf8'});let obj;try{obj=JSON.parse(p.stdout);}catch(e){console.error(p.stdout,p.stderr);throw e;}return{status:p.status,obj,stderr:String(p.stderr||'').slice(-4000)};}
const legacy=runJson('v054_defense_normalization_validation_r13.js',[root]);
const oldSuffix=':CM_BACKLINE_COLLAPSE_RATIO';
const oldChecks=(legacy.obj.checks||[]).filter(x=>String(x.id||'').endsWith(oldSuffix));
const checks=(legacy.obj.checks||[]).filter(x=>!String(x.id||'').endsWith(oldSuffix));
const watches=[...(legacy.obj.watches||[]),...oldChecks.map(x=>({id:`LEGACY_RAW_POSITION_GATE:${x.id}`,value:{pass:x.pass,value:x.value}}))];
const check=(id,pass,value)=>checks.push({id,pass:!!pass,value});
const unexpectedLegacyFailures=(legacy.obj.failedIds||[]).filter(id=>!String(id).endsWith(oldSuffix));
check('R14_ONLY_SUPERSEDES_LEGACY_RAW_CM_COLLAPSE_GATE',unexpectedLegacyFailures.length===0,{legacyStatus:legacy.obj.status,legacyExitStatus:legacy.status,oldGateCount:oldChecks.length,unexpectedLegacyFailures});
const H=require(path.join(root,'live_hybrid_session_v02.js')),A=require(path.join(root,'live_v06_scene_authority_browser.js'));
const pl=(f,id)=>(f.players||[]).find(p=>p.id===id)||null;
const L=(p)=>p?{x:105-Number(p.x),y:68-Number(p.y)}:null;
const LT=(p)=>p&&Number.isFinite(Number(p.tx))&&Number.isFinite(Number(p.ty))?{x:105-Number(p.tx),y:68-Number(p.ty)}:null;
const scenarios=[
 ['DEFENSIVE_ROLE_STABILITY','DEV-RECENT-1787573272419-1'],
 ['PASS_FLIGHT_WIDE_TRACK','DEV-RECENT-1787575663982-11'],
 ['MARK_TARGET_STABILITY','DEV-RECENT-1787575803967-13'],
 ['MARK_TARGET_STABILITY','DEV-RECENT-1787575897894-18'],
 ['STRIKER_RUN_LANE','DEV-RECENT-1787575948505-19']
];
for(const [key,seed] of scenarios){
 const d=H.createDeveloperScenario({key,seed}),v=A.runDeveloperVisualWindow(d.boundary,{runtimeDir:path.join(root,'runtime'),seed:d.seed,durationSeconds:9}),rows=v.frames||[];
 let defendingFrames=0,intentCollapse=0,rawCurrentCollapse=0,escapingTransient=0,missingTargets=0;const samples=[];
 for(const f of rows){
  // These fixtures inspect the AWAY defensive unit. A deep pivot during AWAY possession
  // is build-up, not a defensive collapse, so it must never enter this gate.
  if(f.possession!=='HOME')continue;
  const cbs=['A-LCB','A-RCB'].map(id=>pl(f,id)).filter(Boolean);if(cbs.length<2)continue;
  const cbNow=cbs.map(q=>L(q).x).reduce((a,b)=>a+b,0)/2,cbTargets=cbs.map(LT).filter(Boolean);if(cbTargets.length<2)continue;
  const cbTarget=cbTargets.map(q=>q.x).reduce((a,b)=>a+b,0)/2;defendingFrames++;
  for(const id of ['A-LCM','A-CM','A-RCM']){
   const q=pl(f,id);if(!q)continue;const now=L(q),target=LT(q);if(!target){missingTargets++;continue;}
   const currentCollapsed=now.x<=cbNow+1.5,targetGap=target.x-cbTarget,targetCollapsed=targetGap<5.3;
   if(currentCollapsed)rawCurrentCollapse++;
   if(currentCollapsed&&targetCollapsed){intentCollapse++;if(samples.length<12)samples.push({t:+Number(f.time).toFixed(2),id,nowX:+now.x.toFixed(2),cbNow:+cbNow.toFixed(2),targetX:+target.x.toFixed(2),cbTarget:+cbTarget.toFixed(2),targetGap:+targetGap.toFixed(2),task:q.tacticalTask||q.action||null,mark:q.markTargetId||null});}
   else if(currentCollapsed&&!targetCollapsed)escapingTransient++;
  }
 }
 const denom=defendingFrames*3,ratio=denom?intentCollapse/denom:0;
 check(`${key}:${seed}:CM_BACKLINE_COLLAPSE_RATIO_CONTEXTUAL`,defendingFrames>0&&ratio<=0.035,{defendingFrames,intentCollapse,ratio:+ratio.toFixed(4),threshold:0.035,missingTargets,samples});
 watches.push({id:`${key}:${seed}:CM_BACKLINE_CURRENT_POSITION_TRANSIENTS`,value:{defendingFrames,rawCurrentCollapse,escapingTransient,intentCollapse,rawRatio:denom?+((rawCurrentCollapse/denom).toFixed(4)):0}});
}
const failedIds=checks.filter(x=>!x.pass).map(x=>x.id),status=failedIds.length===0?'PASS':'FAIL';
console.log(JSON.stringify({schemaVersion:'FLR_V054_DEFENCE_NORMALIZATION_VALIDATION_R14_CONTEXTUAL_GATE_1.0',status,legacyStatus:legacy.obj.status,legacyExitStatus:legacy.status,failedIds,checks,watches},null,2));if(status!=='PASS')process.exitCode=1;
