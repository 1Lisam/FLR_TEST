#!/usr/bin/env node
'use strict';
/* Focused QA-only forensic replay.  It deliberately reuses the shipped
 * observation adapter and independent team-shape detector; the E.step wrapper
 * only observes current state after each 0.1-second production step. */
const fs=require('fs'),path=require('path');
const A=require('./v42_oracle_observation_adapter');
const D=require('./v42_team_shape_collapse_detector');
const E=require('../runtime/continuous_match_core');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'evidence/v42');
const cases=[
 {seed:'V42-ORACLE-100-ST-23',heroRole:'ST',heroPlayerId:'H-ST',team:'AWAY',expected:430.9},
 {seed:'V42-ORACLE-100-CM-13',heroRole:'CM',heroPlayerId:'H-CM',team:'AWAY',expected:29.2},
 {seed:'V42-ORACLE-100-CB-25',heroRole:'CB',heroPlayerId:'H-LCB',team:'AWAY',expected:294.7},
 {seed:'V42-SHAPE-SWEEP-FRESH-CM-002',heroRole:'CM',heroPlayerId:'H-CM',team:'HOME',expected:36.7}
];
const deep=x=>x==null?x:JSON.parse(JSON.stringify(x));
const n=x=>Number.isFinite(Number(x))?Number(Number(x).toFixed(3)):null;
function row(p){return{id:p.id,team:p.team,role:p.role,slot:p.slot||null,x:n(p.x),y:n(p.y),vx:n(p.vx),vy:n(p.vy),tx:n(p.tx),ty:n(p.ty),tacticalTask:p.tacticalTask||p.action||null,action:p.action||null,markTargetId:p.markTargetId||null,responsibilityType:p.responsibilityType||null,responsibilityReason:p.responsibilityReason||null,responsibilityTargetId:p.responsibilityTargetId||null,responsibilityMotionMode:p.responsibilityMotionMode||null,responsibilityRewriteReason:p.responsibilityRewriteReason||null,responsibilityContinuityReason:p.responsibilityContinuityReason||null};}
function compact(m,d,prior){const s=E.snapshot(m),def=deep(m.defensiveResponsibility||null),arb=deep(def?.waypointArbitration||null),markCorrections=Number(m.stats?.markBodyCorrections||0);
 const changed=(prior?.players||[]).map(q=>{const p=m.players.find(x=>x.id===q.id);return p&&(['tx','ty','tacticalTask','responsibilityType','responsibilityReason','responsibilityTargetId','markTargetId'].some(k=>String(p[k]??null)!==String(q[k]??null)))?p.id:null;}).filter(Boolean);
 const markCandidates=m.players.filter(p=>p.team===d.team&&p.role!=='GK'&&p.tacticalTask==='MARK_LANE_SCREEN'&&p.markTargetId).map(p=>({playerId:p.id,targetId:p.markTargetId,distance:n(Math.hypot(p.x-(m.players.find(q=>q.id===p.markTargetId)?.x||p.x),p.y-(m.players.find(q=>q.id===p.markTargetId)?.y||p.y)))}));
 return{time:n(m.time),phase:m.phase||null,restart:!!m.restart,setPieceLive:!!m.setPieceLive,ball:deep(s.ball),detector:{flagged:d.flagged,signals:d.signals,legal:d.legal,metrics:d.m},players:m.players.map(row),waypointArbitration:arb,defensiveResponsibility:def,markingShapeGuard:{observableIntervention:false,reason:'CORE_EXPOSES_NO_GUARD_TRACE; markBodyCorrectionsDelta is recorded separately',markBodyCorrections:markCorrections,delta:markCorrections-(prior?.markBodyCorrections||0),eligibleMarkLaneCandidates:markCandidates},changedPlayerIds:changed};
}
function replay(c){const frames=[];let previous=null,orig=E.step;
 E.step=function(m,dt){const out=orig(m,dt),s=E.snapshot(m),d=D.detect(s,c.team);frames.push(compact(m,d,previous));previous={players:m.players.map(p=>({...p})),markBodyCorrections:Number(m.stats?.markBodyCorrections||0)};return out;};
 try{A.captureActualPath({...c,durationSeconds:1800});}finally{E.step=orig;}
 const fail=frames.find(f=>f.detector.flagged);if(!fail)throw Error(`FOCUSED_REPLAY_NO_FAIL:${c.seed}`);if(Math.abs(fail.time-c.expected)>.001)throw Error(`FIRST_FAIL_TIME_CHANGED:${c.seed}:${fail.time}:${c.expected}`);
 const i=frames.indexOf(fail),before=frames.slice(0,i).filter(f=>!f.detector.flagged).at(-1),window=[before,...frames.slice(i,i+3)].filter(Boolean);
 const changes=[];for(let j=1;j<window.length;j++){const a=window[j-1],b=window[j];for(const p of b.players){const q=a.players.find(x=>x.id===p.id);if(!q)continue;const fields=['tx','ty','tacticalTask','responsibilityType','responsibilityReason','responsibilityTargetId','markTargetId'];const delta={};for(const k of fields)if(String(q[k]??null)!==String(p[k]??null))delta[k]={from:q[k]??null,to:p[k]??null};if(Object.keys(delta).length)changes.push({at:b.time,playerId:p.id,team:p.team,delta});}}
 const spacing=window.map(f=>({time:f.time,worsened:f.waypointArbitration?.worsened??null,applied:f.waypointArbitration?.applied??null,deferred:f.waypointArbitration?.deferred||[],spaced:f.waypointArbitration?.spaced||[],protectedDutiesChanged:(f.waypointArbitration?.spaced||[]).map(x=>x.playerId)}));
 return{...c,lastCleanTime:before?.time??null,firstFailTime:fail.time,firstFail:fail.detector,window,waypointAndResponsibilityChanges:changes,spacing};
}
function main(){const results=cases.map(replay);const out={schemaVersion:'V42_BROAD_COLLAPSE_COMMON_CAUSE_1.0',truth:{USER_FAIL_OPEN:'OPEN',STEP79:'NOT_STARTED',productionGameplayChanged:false,deploymentPerformed:false,broadSweepRerun:false,futureOutcomePrecomputed:false},source:{head:process.env.V42_REPO_HEAD||'NOT_SUPPLIED',path:'captureActualPath -> E.step observation wrapper -> existing TEAM_SHAPE_COLLAPSE detector'},cases:results};fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'V42_BROAD_COLLAPSE_COMMON_CAUSE.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(results.map(x=>({seed:x.seed,lastClean:x.lastCleanTime,firstFail:x.firstFailTime,signals:x.firstFail.signals})),null,2));return out;}
if(require.main===module){try{main();}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={replay,main};
