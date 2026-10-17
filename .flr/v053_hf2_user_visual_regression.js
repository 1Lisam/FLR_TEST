'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const H=require('../live_hybrid_session_v02.js');
const A=require('../live_v06_scene_authority_browser.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const P=require('../runtime/protagonist_match_controller.js');
const E=require('../runtime/continuous_match_core.js');
const tactical=fs.readFileSync(path.resolve(runtimeDir,'tactical_movement.js'),'utf8');
const ui=fs.readFileSync(path.resolve(__dirname,'../step71_hybrid_v06_ui.js'),'utf8');
const index=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const checks=[],detail={};
const add=(id,pass,extra={})=>checks.push({id,pass:!!pass,...extra});
const dist=(a,b)=>Math.hypot((a.x||0)-(b.x||0),(a.y||0)-(b.y||0));
const angdiff=(a,b)=>{let d=(a-b)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return Math.abs(d)};
const localX=(team,x)=>team==='HOME'?x:105-x;
function frameMap(f){return Object.fromEntries((f.players||[]).map(p=>[p.id,p]));}
function avg(arr){return arr.reduce((a,b)=>a+b,0)/Math.max(1,arr.length)}
function stepFrames(boundary,seed,seconds=6){const env=A.seedMatch(boundary,{runtimeDir,seed,explicitHeroChoiceRequired:true}),frames=[E.snapshot(env.state.m)];env.state.mode='FULL_SKIP';for(let t=0;t<seconds-.001;t+=.1){P.step(env.state,.1);frames.push(E.snapshot(env.state.m));}return {env,frames};}

let maxLead=-Infinity,chaseCount=0;const chaseTasks=new Set(['PRESS','PRESS_CONTAIN','CHASE_LOOSE','CLOSE_DOWN','ENGAGE','RECOVERY_CHASE']);
for(let i=0;i<24;i++){
  const d=H.createDeveloperScenario({seed:`HF2-BALL-${i}`,key:'BALL_DEPTH_SYNC'}),st=d.boundary.stateSnapshot,ps=st.spatial.players,owner=ps[st.ball.ownerId];
  const dir=st.possession==='HOME'?1:-1;
  const lead=Math.max(...Object.values(ps).filter(p=>p.team===st.possession&&['ST','WF'].includes(p.role)).map(p=>(p.x-owner.x)*dir));maxLead=Math.max(maxLead,lead);
  const {frames}=stepFrames(d.boundary,d.seed,3.0);
  for(const f of frames){const h=frameMap(f)['H-ST'];if(f.possession==='HOME'&&h&&chaseTasks.has(h.tacticalTask||h.action))chaseCount++;}
}
detail.ballDepth={maxLead:+maxLead.toFixed(3),heroChaseFrames:chaseCount};
add('HF2_BALL_FORWARD_CONNECTION',maxLead<=24,{maxLead:+maxLead.toFixed(3)});
add('HF2_HERO_ST_NOT_DEFENSIVE_BALL_CHASER_IN_HOME_POSSESSION',chaseCount===0,{heroChaseFrames:chaseCount});

{
 const seed='DEV-RECENT-1787544144068-8',d=H.createDeveloperScenario({seed,key:'CM_SUPPORT_SPREAD'}),{frames}=stepFrames(d.boundary,seed,7.0);
 let minLayer=Infinity,maxCarrierCrowd=0,maxThreatCrowd=0,shortStreak=0,maxShortStreak=0,covered=0,eligible=0;
 for(const f of frames){
   const ps=frameMap(f),def=Object.values(ps).filter(p=>p.team==='AWAY'),cbs=def.filter(p=>p.role==='CB'),cms=def.filter(p=>p.role==='CM');
   if(cbs.length&&cms.length){const cbx=avg(cbs.map(p=>localX('AWAY',p.x))),cmx=avg(cms.map(p=>localX('AWAY',p.x)));minLayer=Math.min(minLayer,cmx-cbx);}
   const carrier=ps[f.ball.ownerId];if(carrier){maxCarrierCrowd=Math.max(maxCarrierCrowd,def.filter(p=>dist(p,carrier)<=6.0).length);}
   const attackers=Object.values(ps).filter(p=>p.team==='HOME'&&p.id!==f.ball.ownerId);
   for(const a of attackers)maxThreatCrowd=Math.max(maxThreatCrowd,def.filter(p=>dist(p,a)<=4.6).length);
   let anyBad=false;for(const a of Object.values(ps))for(const b of Object.values(ps)){if(a.id>=b.id||a.team===b.team)continue;const duel=[a.tacticalTask,a.action,b.tacticalTask,b.action].some(x=>['PRESS','ENGAGE','TACKLE','RECOVERY_CHASE','CLOSE_DOWN'].includes(x));if(!duel&&dist(a,b)<1.20){anyBad=true;break;}}if(anyBad){shortStreak+=.1;maxShortStreak=Math.max(maxShortStreak,shortStreak)}else shortStreak=0;
   const rw=ps['H-RW'],lb=ps['A-LB'];if(rw&&localX('AWAY',rw.x)<=40){eligible++;if(lb&&(lb.markTargetId==='H-RW'||dist(lb,rw)<=6.5))covered++;}
 }
 const coverage=eligible?covered/eligible:1;detail.cmSeed={minMidfieldBackGap:+minLayer.toFixed(3),maxCarrierCrowd,maxThreatCrowd,maxNonDuelUnder1p2Seconds:+maxShortStreak.toFixed(2),wideRunnerCoverage:+coverage.toFixed(3),eligible};
 add('HF2_CM_BACKLINE_LAYER',minLayer>=5,{minLayer:+minLayer.toFixed(3)});
 add('HF2_CARRIER_CROWD_MAX_TWO',maxCarrierCrowd<=2,{maxCarrierCrowd});
 add('HF2_OFFBALL_THREAT_CROWD_MAX_TWO',maxThreatCrowd<=2,{maxThreatCrowd});
 add('HF2_NONDUEL_TREMBLE_NOT_SUSTAINED',maxShortStreak<=.6,{maxShortStreak:+maxShortStreak.toFixed(2)});
 add('HF2_DANGEROUS_WIDE_RUNNER_COVERED',coverage>=.85,{coverage:+coverage.toFixed(3),eligible});
}

{
 const seed='DEV-RECENT-1787544633220-28',d=H.createDeveloperScenario({seed,key:'EARLY_ATTACK_ENTRY'}),env=A.seedMatch(d.boundary,{runtimeDir,seed,explicitHeroChoiceRequired:true}),sp=d.boundary.stateSnapshot.spatial.players,ep=frameMap(env.entrySnapshot);let maxDelta=0;for(const [id,p] of Object.entries(sp))if(ep[id])maxDelta=Math.max(maxDelta,dist(p,ep[id]));const st=ep['H-ST'],cbD=['A-LCB','A-RCB'].map(id=>dist(ep[id],st)).sort((a,b)=>a-b);detail.earlySeed={entryMaxDelta:+maxDelta.toFixed(6),nearestCB:+cbD[0].toFixed(3),secondCB:+cbD[1].toFixed(3)};
 add('HF2_EARLY_ENTRY_EXACT_CONTINUITY',maxDelta<.001,{maxDelta:+maxDelta.toFixed(6)});
 add('HF2_EARLY_ENTRY_ONE_TIGHT_MARKER_ONLY',cbD[0]>=1.25&&cbD[1]>=4.5,{nearest:+cbD[0].toFixed(3),second:+cbD[1].toFixed(3)});
}

{
 const seed='DEV-RECENT-1787544733580-32',d=H.createDeveloperScenario({seed,key:'OFFSIDE_REVIEW'}),opened=A.runToChoice(d.boundary,{runtimeDir,seed,maxSearchSeconds:8});assert(opened.pending,'offside seed should reach a choice');const risky=opened.pending.options.find(o=>o.meta?.offsideRisk===true);assert(risky,'offside seed should expose a real risky pass');const r=A.applyChoiceAndAdvance(opened,risky.id,risky.targetId,{maxPostSeconds:8});const pass=(r.actualEvents||[]).find(e=>e.type==='PASS'),off=(r.actualEvents||[]).find(e=>e.type==='OFFSIDE');let maxJump=0;for(let i=1;i<r.postFrames.length;i++)maxJump=Math.max(maxJump,Number(r.postFrames[i].time)-Number(r.postFrames[i-1].time));const after=off&&r.postFrames.length?Number(r.postFrames.at(-1).time)-Number(off.t):0,delay=pass&&off?Number(off.t)-Number(pass.t):0;detail.offsideSeed={choice:[risky.id,risky.targetId],result:r.result?.code,delay:+delay.toFixed(3),visibleAfterCall:+after.toFixed(3),maxFrameJump:+maxJump.toFixed(3),events:(r.actualEvents||[]).map(e=>e.type)};
 add('HF2_OFFSIDE_REAL_ENGINE_RESULT',r.result?.code==='OFFSIDE');
 add('HF2_OFFSIDE_HAS_FLIGHT_BEFORE_CALL',delay>=.25&&delay<=1.0,{delay:+delay.toFixed(3)});
 add('HF2_OFFSIDE_CALL_REMAINS_VISIBLE',after>=1.1,{after:+after.toFixed(3)});
 add('HF2_OFFSIDE_NO_COMPRESSED_JUMP_DURING_REVIEW',maxJump<=.25,{maxJump:+maxJump.toFixed(3)});
}

function runGk(choiceId){const seed='DEV-RECENT-1787544851660-37',d=H.createDeveloperScenario({seed,key:'GK_RESULT_CONSISTENCY'}),opened=A.runToChoice(d.boundary,{runtimeDir,seed,maxSearchSeconds:8});assert(opened.pending,'GK seed should reach choice');const opt=opened.pending.options.find(o=>o.id===choiceId);assert(opt,`${choiceId} missing`);const f0=E.snapshot(opened.state.m),g0=frameMap(f0)['H-GK'],b0=f0.ball,initialErr=angdiff(g0.bodyAngle,Math.atan2(b0.y-g0.y,b0.x-g0.x));const apply=P.applyChoice(opened.state,choiceId,opt.targetId||null,{source:'TEST_HARNESS'});assert(apply.ok);for(let i=0;i<8;i++)P.step(opened.state,.1);const f=E.snapshot(opened.state.m),g=frameMap(f)['H-GK'],err=angdiff(g.bodyAngle,Math.atan2(f.ball.y-g.y,f.ball.x-g.x));return{x:g.x,tx:g.tx,initialErr,err};}
{
 const hold=runGk('GK_HOLD_POSITION'),step=runGk('GK_STEP_OUT'),posDelta=step.x-hold.x,targetDelta=step.tx-hold.tx,maxErr=Math.max(hold.initialErr,step.initialErr,hold.err,step.err)*180/Math.PI;detail.gkSeed={holdX:+hold.x.toFixed(3),stepX:+step.x.toFixed(3),positionDelta:+posDelta.toFixed(3),targetDelta:+targetDelta.toFixed(3),maxFacingErrorDeg:+maxErr.toFixed(3)};
 add('HF2_GK_FACES_LIVE_BALL',maxErr<=15,{maxFacingErrorDeg:+maxErr.toFixed(3)});
 add('HF2_GK_STEP_OUT_VISIBLY_DIFFERENT',posDelta>=.75&&targetDelta>=1.0&&targetDelta<=2.4,{positionDelta:+posDelta.toFixed(3),targetDelta:+targetDelta.toFixed(3)});
}

add('HF2_DEV_FIVE_ITEMS_VISIBLE',index.includes('size="5"')&&index.includes('GK 선택 결과 정합성'));
add('HF2_DEV_DEBUG_REPORT_DOWNLOAD_WIRED',ui.includes("rememberCompletedSituation(latestIntegratedDebug,'DEV_VISUAL')")&&ui.includes("$('heroDownloadScene').disabled=false")&&ui.includes("$('heroBugReport').disabled=false"));
{const hi=ui.indexOf('function handback'),ri=ui.indexOf('const developerReplayFrames=developerScenarioActive?deep(frames):null',hi),ni=ui.indexOf('session=null',hi);add('HF2_DEV_REPLAY_CAPTURE_BEFORE_SESSION_NULL',hi>=0&&ri>=0&&ni>=0&&ri<ni,{handbackIndex:hi,replayCaptureIndex:ri,sessionNullIndex:ni});}
add('HF2_DISPLAYED_SEED_IS_HIGHRES_SEED',ui.includes('developerScenarioActive?.seed||`${seed()}-${r.boundary.sceneId}`')&&ui.includes('seed:d.seed'));
add('HF2_REPORT_IDENTITY',ui.includes('USER-MATCH-TEST-V0.5.3-HF2')&&ui.includes('umt053h2-'));
add('HF2_OFFSIDE_CALL_REVIEW_SOURCE',tactical.length>0&&fs.readFileSync(path.resolve(runtimeDir,'continuous_match_core.js'),'utf8').includes('CALL_REVIEW'));

const status=checks.every(x=>x.pass)?'PASS':'FAIL';const out={schemaVersion:'FLR_V053_HF2_USER_VISUAL_REGRESSION_1.0',status,checks,detail};fs.writeFileSync(path.resolve(__dirname,'v053_hf2_user_visual_regression_status.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));if(status!=='PASS')process.exitCode=1;
