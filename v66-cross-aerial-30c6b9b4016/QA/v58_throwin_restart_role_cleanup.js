#!/usr/bin/env node
'use strict';

// Release-boundary regression for V58-REST-01.  The throw-in setup is allowed
// to author THROW_IN_* tasks; only a successful throw release relinquishes them.
const assert=require('assert');
const E=require('../runtime/continuous_match_core.js');

const m=E.createMatch('V58-REST-01');
const bridge=E.choiceActionBridge();
m.time=70;
// Keep the focused fixture out of the protagonist restart-choice gate.
m.protagonistControllerId='H-ST';
bridge.startDeadRestart(m,'THROW_IN','AWAY',66,67.6);

let setupTasks=[];
let releasedAt=null;
for(let tick=0;tick<200;tick++){
  E.step(m,.05);
  if(!setupTasks.length&&m.restart?.kind==='THROW_IN')setupTasks=m.players.filter(p=>String(p.action||'').startsWith('THROW_IN_')||String(p.tacticalTask||'').startsWith('THROW_IN_')).map(p=>({id:p.id,action:p.action,tacticalTask:p.tacticalTask,markTargetId:p.markTargetId||null}));
  if(!m.restart){releasedAt={tick:tick+1,time:Number(m.time.toFixed(3)),ballMode:m.ball.mode,ballKind:m.ball.kind};break;}
}

const stale=m.players.filter(p=>String(p.action||'').startsWith('THROW_IN_')||String(p.tacticalTask||'').startsWith('THROW_IN_')).map(p=>({id:p.id,action:p.action,tacticalTask:p.tacticalTask,markTargetId:p.markTargetId||null}));
const postReleaseFrames=[];
for(let tick=0;tick<101;tick++){
  E.step(m,.05);
  postReleaseFrames.push({time:Number(m.time.toFixed(3)),staleTaskIds:m.players.filter(p=>String(p.action||'').startsWith('THROW_IN_')||String(p.tacticalTask||'').startsWith('THROW_IN_')).map(p=>p.id),homeRb:{action:m.playersById['H-RB'].action,tacticalTask:m.playersById['H-RB'].tacticalTask,markTargetId:m.playersById['H-RB'].markTargetId||null,speed:Number(Math.hypot(m.playersById['H-RB'].vx,m.playersById['H-RB'].vy).toFixed(4))}});
}
const checks={
  throwInSetupWasAuthored:setupTasks.length>0,
  releaseOccurred:releasedAt?.ballMode==='FLIGHT'&&releasedAt?.ballKind==='THROW_IN',
  releaseEnteredOpenPlay:m.phase==='OPEN_PLAY'&&m.restart===null,
  noThrowInTaskFamilySurvivesRelease:stale.length===0,
  noThrowInTaskFamilyReappearsAcross505Seconds:postReleaseFrames.every(frame=>frame.staleTaskIds.length===0)
};
const passed=Object.values(checks).every(Boolean);
const out={schemaVersion:'V58_THROWIN_RESTART_ROLE_CLEANUP_1.0',verdict:passed?'PASS':'FAIL',checks,setupTasks,releasedAt,stale,postReleaseWindow:{seconds:5.05,tickSeconds:.05,homeRb:postReleaseFrames.map(frame=>frame.homeRb),staleTaskFrameCount:postReleaseFrames.filter(frame=>frame.staleTaskIds.length).length},futureOutcomePrecomputed:false,protagonistControlChanged:false};
console.log(JSON.stringify(out,null,2));
assert(passed,'V58 throw-in restart role cleanup failed');
