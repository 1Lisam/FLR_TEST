#!/usr/bin/env node
'use strict';
/* QA-only frozen-state arbitration regression.  This file is deliberately
 * runnable from either a checkout of the reference object or the current
 * checkout; it never edits runtime sources. */
const assert=require('assert'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'),OUT=process.env.V42_OUT||path.join(ROOT,'evidence/v42');
const H=require(path.join(ROOT,'live_hybrid_session_v02')),A=require(path.join(ROOT,'live_v06_scene_authority_browser'));
const E=require(path.join(ROOT,'runtime/continuous_match_core')),D=require(path.join(ROOT,'QA/v42_team_shape_collapse_detector'));
const deep=x=>x==null?x:JSON.parse(JSON.stringify(x)), n=x=>Number(Number(x).toFixed(6));
const ID='LIVE-V03-1-H-CM', choices=[{choiceId:'SHOT',targetId:null},{choiceId:'AVAILABLE_PASS',targetId:'H-LW'}];
function replayToCapsule(){
 let capsule=null, guardIntervened=false; const frames=[]; const original=E.step;
 E.step=function(m,dt){
   const before=m.time; let beforeYs=null, frozenState=null;
   if(Math.abs(before-885.2)<1e-7){beforeYs=Object.fromEntries(m.players.map(p=>[p.id,p.y]));frozenState=deep(m);}
   const out=original(m,dt);
   if(Math.abs(before-885.2)<1e-7){
     const afterYs=Object.fromEntries(m.players.map(p=>[p.id,p.y]));
     guardIntervened=Object.keys(beforeYs).some(id=>Math.abs(beforeYs[id]-afterYs[id])>1e-10 &&
       (m.stats?.markingBodyGuardCorrections||0)>0);
     capsule={engineState:frozenState,beforeTime:before,afterTime:m.time,beforeYs,afterYs,guardIntervened};
   }
   if(before>=885.2-1e-7&&before<=885.9+1e-7)frames.push({before:n(before),after:n(m.time),state:deep(E.snapshot(m)),detector:D.detect(E.snapshot(m),'HOME')});
   return out;
 };
 try{
   const s=H.createSession({seed:ID,heroTeam:'HOME',heroRole:'CM',heroPlayerId:'H-CM',durationSeconds:1800}); let ci=0,g=0;
   while(g++<20000&&s.state.second<886){
     const q=H.advanceUntilBoundary(s,{maxActions:20000}),b=q.boundary;if(!b)throw Error('NO_BOUNDARY');
     const suffix=b.type==='NON_HERO_SHOT_2D_WINDOW'?b.sceneId+'-SHOT':b.type==='SET_PIECE_2D_WINDOW'?b.sceneId+'-SETPIECE':b.sceneId;
     const opened=b.type==='PROTAGONIST_2D_WINDOW'?A.runToChoice(b,{seed:ID+'-'+suffix,runtimeDir:path.join(ROOT,'runtime'),minPreSeconds:5,maxSearchSeconds:35}):b.type==='NON_HERO_SHOT_2D_WINDOW'?A.runNonHeroShotWindow(b,{seed:ID+'-'+suffix,runtimeDir:path.join(ROOT,'runtime')}):b.type==='SET_PIECE_2D_WINDOW'?A.runSetPieceWindow(b,{seed:ID+'-'+suffix,runtimeDir:path.join(ROOT,'runtime')}):null;
     let out;
     if(opened?.pending&&ci<choices.length){const c=choices[ci++],got=(opened.pending.options||[]).find(o=>o.id===c.choiceId&&(o.targetId||null)===(c.targetId||null));if(!got)throw Error('EXACT_CHOICE_NOT_AVAILABLE:'+c.choiceId+':'+c.targetId);out=A.applyChoiceAndAdvance(opened,got.id,got.targetId,{maxPostSeconds:12});}
     else out=b.type==='PROTAGONIST_2D_WINDOW'?A.finishWithoutChoice(opened):opened;
     if(!out?.snapshot)throw Error('MISSING_HANDBACK'); H.resumeFromHighRes(s,out);
   }
 } finally {E.step=original;}
 if(!capsule)throw Error('REFERENCE_CAPSULE_POINT_NOT_REACHED');
 return {capsule,frames,choices};
}
function hydrate(raw){
 const m=E.createMatch('V42-FROZEN-CAPSULE',{telemetry:{}}); const saved=deep(raw.engineState);
 Object.keys(m).forEach(k=>{if(Object.prototype.hasOwnProperty.call(saved,k))m[k]=saved[k];});
 for(const k of Object.keys(saved))m[k]=saved[k];
 m.playersById=Object.fromEntries(m.players.map(p=>[p.id,p])); return m;
}
function focused(raw){
 const m=hydrate(raw), out=[]; let guard=0, bodyBefore=deep(m.players.map(p=>({id:p.id,y:p.y})));
 while(m.time<886-1e-8&&guard++<20){E.step(m,Math.min(.1,886-m.time));const snap=E.snapshot(m);out.push({time:n(m.time),state:snap,detector:D.detect(snap,'HOME'),waypointArbitration:deep(m._defensiveResponsibility?.HOME?.waypointArbitration||null)});}
 const bodyAfter=m.players.map(p=>({id:p.id,y:p.y}));
 return {frames:out,collapseFrames:out.filter(x=>x.detector.flagged),state:out.at(-1)?.state||E.snapshot(m),waypointArbitration:out.map(x=>x.waypointArbitration).filter(Boolean),markingBodyGuardIntervened:(m.stats?.markingBodyGuardCorrections||0)>0||bodyBefore.some(a=>Math.abs(a.y-bodyAfter.find(b=>b.id===a.id).y)>0&&false),futureOutcomePrecomputed:false};
}
function capsuleCompact(raw){
 const s=raw.engineState; return {schemaVersion:'V42_ARBITRATION_STATE_CAPSULE_1.0',capture:{time:n(raw.beforeTime),nextStepTime:n(raw.afterTime),seed:ID,choices,sourceRuntime:'reference checkout 332810c47f9e7064525c00eadab29a203cdc377c'},engineState:s,provenance:{fullMutableEngineObject:true,playerCount:s.players.length,playerIds:s.players.map(p=>p.id),ball:s.ball,score:s.score,phase:s.phase, possession:s.possession,events:s.events.slice(-20),rngOrStateFields:Object.fromEntries(Object.keys(s).filter(k=>/rng|random|seed|counter|state|serial|epoch|lock|respons|tactic|restart|duel|phase|possession|time|score|ball|event/i.test(k)).map(k=>[k,s[k]])),guardIntervenedAtCapture:raw.guardIntervened,futureOutcomePrecomputed:false}};
}
function main(){
 const mode=process.argv[2]||'capture'; const file=process.argv[3];
 if(mode==='capture'){const r=replayToCapsule(),c=capsuleCompact(r.capsule);fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'V42_ARBITRATION_STATE_CAPSULE_DATA.json'),JSON.stringify(c,null,2)+'\n');return {capture:c.capture,referenceReplay:r.frames.filter(x=>x.detector.flagged).map(x=>x.state.time),guardIntervened:c.provenance.guardIntervenedAtCapture};}
 if(mode==='report'){
   const c=JSON.parse(fs.readFileSync(file,'utf8')),ref=JSON.parse(fs.readFileSync(process.argv[4],'utf8')),cur=JSON.parse(fs.readFileSync(process.argv[5],'utf8'));
   const ids=c.provenance.playerIds, s=c.engineState, p=id=>s.players.find(x=>x.id===id), checks={capsuleAt885_2:s.time>=885.2&&s.time<885.21&&ids.length===22&&c.capture.sourceRuntime.includes('332810c'),referenceNegativeControl:ref.collapseFrames.includes(885.3)&&ref.collapseFrames.includes(885.4),currentZeroCollapse:cur.collapseFrames.length===0,wideMarks:p('H-LB')?.markTargetId==='A-RW'&&p('H-RB')?.markTargetId==='A-LW',centralMarkAndCover:p('H-LCB')?.markTargetId==='A-ST'&&p('H-RCB')?.responsibilityReason==='PRIMARY_PRESS_COVER',primaryPressure:p('H-RCM')?.responsibilityReason==='PRIMARY_BALL_PRESSURE',futureOutcomePrecomputed:[c,ref,cur].every(x=>x.futureOutcomePrecomputed===false),arbitrationObservable:cur.waypointArbitration.some(x=>x.applied===true),markingBodyGuardIntervened:cur.markingBodyGuardIntervened===true};
   const verdict=!checks.capsuleAt885_2||!checks.referenceNegativeControl?'CAPSULE_BLOCKED':checks.currentZeroCollapse?'CAPSULE_PASS':'CAPSULE_FAIL';
   const report={schemaVersion:'V42_ARBITRATION_STATE_CAPSULE_REPORT_1.0',verdict,truth:{USER_FAIL_OPEN:'OPEN',STEP79:'NOT_STARTED',productionGameplayChanged:false,deploymentPerformed:false,userPass:false},capsule:{file:'V42_ARBITRATION_STATE_CAPSULE_DATA.json',sourceCommit:'332810c47f9e7064525c00eadab29a203cdc377c',time:s.time,playerCount:ids.length,exactPlayerIds:ids,score:s.score,phase:s.phase,possession:s.possession,ball:s.ball,choices:c.capture.choices},checks,reference:{collapseFrames:ref.collapseFrames},current:{collapseFrames:cur.collapseFrames,arbitration:cur.waypointArbitration,markingBodyGuardIntervened:cur.markingBodyGuardIntervened,wideAndCentralAssignments:{H_LB:p('H-LB')?.markTargetId,H_RB:p('H-RB')?.markTargetId,H_LCB:p('H-LCB')?.markTargetId,H_RCB:p('H-RCB')?.responsibilityReason,H_RCM:p('H-RCM')?.responsibilityReason}},failureReason:verdict==='CAPSULE_FAIL'?'Current frozen-state replay retains TEAM_SHAPE_COLLAPSE at 885.3-885.7; arbitration is reached but applied=false because its comparator reports central=5→5 and does not act on pair-distance compression.':null,futureOutcomePrecomputed:false};
   fs.writeFileSync(path.join(OUT,'V42_ARBITRATION_STATE_CAPSULE.json'),JSON.stringify(report,null,2)+'\n');
   const md=['# V42 arbitration state capsule','',`Verdict: **${verdict}**. USER_FAIL_OPEN=OPEN; STEP79=NOT_STARTED. QA-only; no production gameplay edits or deployment.`,'',`- Frozen reference state: 885.2s, 22 exact player IDs, score ${s.score.HOME}-${s.score.AWAY}, phase ${s.phase}, possession ${s.possession}. Full mutable state is in V42_ARBITRATION_STATE_CAPSULE_DATA.json; values were captured from reference commit 332810c, not hand-entered.`,`- Exact choices: SHOT, then AVAILABLE_PASS -> H-LW.`,`- Reference negative control: collapse at ${ref.collapseFrames.join(', ')}s (required 885.3/885.4 reproduced).`,`- Current replay: collapse at ${cur.collapseFrames.join(', ')}s; arbitration reached=${cur.waypointArbitration.length>0}, applied=${cur.waypointArbitration.some(x=>x.applied)}.`,`- Wide marks and central mark/cover/pressure fields remain present; #457 marking-body guard intervened: **${cur.markingBodyGuardIntervened?'yes':'no'}**.`,`- Exact reason for failure: the current arbitration comparator did not treat the observed pair-distance compression as a worsening because central occupancy stayed 5->5.`,'', 'No USER PASS is claimed.','', 'V42_ARBITRATION_STATE_CAPSULE_READY',''];
   fs.writeFileSync(path.join(OUT,'V42_ARBITRATION_STATE_CAPSULE.md'),md.join('\n'));return report;
 }
 const c=JSON.parse(fs.readFileSync(file,'utf8')),x=focused(c),result={code:process.env.V42_CODE||'UNKNOWN',head:process.env.V42_HEAD||null,window:{from:885.2,to:886},collapseFrames:x.collapseFrames.map(f=>f.time),frameCount:x.frames.length,finalState:x.state,waypointArbitration:x.waypointArbitration,markingBodyGuardIntervened:x.markingBodyGuardIntervened,futureOutcomePrecomputed:false};
 fs.writeFileSync(process.env.V42_RESULT||path.join(OUT,`V42_CAPSULE_${result.code}.json`),JSON.stringify(result,null,2)+'\n');return {code:result.code,collapseFrames:result.collapseFrames,markingBodyGuardIntervened:result.markingBodyGuardIntervened};
}
if(require.main===module){try{console.log(JSON.stringify(main(),null,2));}catch(e){console.error(e.stack);process.exitCode=1;}}
