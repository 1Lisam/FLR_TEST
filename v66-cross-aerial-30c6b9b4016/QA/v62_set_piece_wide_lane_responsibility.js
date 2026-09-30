#!/usr/bin/env node
'use strict';

const assert=require('assert');
const R=require('../runtime/restart_movement.js');
global.FLRPG_RESTART_MOVEMENT=R;
require('../runtime/free_kick_templates.js');
require('../runtime/free_kick_wall_model.js');
require('../runtime/corner_templates.js');
require('../runtime/v37_set_piece_liveliness_patch.js');
const E=require('../runtime/continuous_match_core.js');
const A=require('../runtime/attribute_match_adapter.js');
const M=require('../runtime/manager_tendency_adapter.js');
const T=require('../runtime/tactical_movement.js');

const DT=.05;
const other=team=>team==='HOME'?'AWAY':'HOME';
const prefix=team=>team==='HOME'?'H':'A';
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const local=(team,p)=>world(team,p.x,p.y);
const side=slot=>slot==='LB'?-1:1;
const fbIds=team=>['LB','RB'].map(slot=>`${prefix(team)}-${slot}`);
const materialWide=(m,team,slot)=>m.players.filter(p=>p.team===other(team)&&['WF','FB'].includes(p.role)).filter(p=>{
  const q=local(team,p);
  const vacancy=Object.values(m._transitionWideVacancies?.[team]||{}).some(v=>v?.threatId===p.id&&m.time<(v.until||0));
  return Math.sign(q.y-34)===side(slot)&&Math.abs(q.y-34)>=15&&(q.x<=49||vacancy);
});

function inspect(m,label){
  const team='HOME',state=m._defensiveResponsibility?.[team];
  assert(state&&state.at<=m.time+1e-7&&m.time-state.at<=.45,`${label}: live reconcile state`);
  assert.deepEqual(state.diagnostics.duplicateThreats,[],`${label}: no duplicate threat owners`);
  for(const slot of ['LB','RB']){
    const id=`H-${slot}`,fb=m.playersById[id],wide=materialWide(m,team,slot);
    const central=state.threats.filter(t=>t.material&&t.kind==='CENTRAL_RUNNER'&&t.owners.includes(id));
    if(wide.length)assert.equal(central.length,0,`${label}: ${id} consumed by central runner while ${wide.map(p=>p.id)} is wide`);
    for(const threat of wide){
      const row=state.threats.find(t=>t.id===threat.id);
      assert(row,`${label}: current wide body in responsibility ledger`);
      const press=state.primaryPressureOwnerId&&state.primaryPressureTargetId===threat.id;
      assert(row.owners.length||press,`${label}: ${threat.id} abandoned with no owner or live carrier pressure`);
      assert(!central.length,`${label}: ${id} is not taken from ${threat.id}`);
    }
    const target=fb.responsibilityTargetId&&m.playersById[fb.responsibilityTargetId];
    if(target&&state.threats.find(t=>t.id===target.id)?.kind==='WIDE'){
      const q=local(team,target);
      assert.equal(Math.sign(q.y-34),side(slot),`${label}: ${id} must not swap wide lanes`);
    }
  }
  for(const row of state.threats.filter(t=>t.material)){
    assert(row.owners.length<=1,`${label}: ${row.id} has at most one explicit owner`);
    assert(!row.owners.includes(state.coverOwnerId),`${label}: required cover is not a second marker`);
  }
  return{time:Number(m.time.toFixed(2)),phase:m.phase,ballMode:m.ball.mode,fullbacks:fbIds(team).map(id=>({id,targetId:state.records[id]?.targetId||null,type:state.records[id]?.type||null})),materialWide:state.threats.filter(t=>t.kind==='WIDE').map(t=>({id:t.id,owners:t.owners}))};
}

function realRestart(spec){
  const m=E.createMatch(`V62-EXACT-${spec.id}`);
  for(const p of m.players)A.assign(m,p.id,A.baseProfile(60));
  M.init(m,{HOME:'BALANCED',AWAY:'BALANCED'});
  m.offBallPolicy='CURRENT';m.time=30;m.protagonistControllerId='NO_USER_CHOICE';
  E.choiceActionBridge().startDeadRestart(m,spec.kind,'AWAY',spec.x,spec.y,null,spec.metadata);
  assert.equal(m.restart?.team,'AWAY',`${spec.id}: actual restart`);
  let setup=null,kick=null,after=null;
  for(let tick=0;tick<900&&!after;tick++){
    if(m.restart?.setup&&['SETUP','SET_HOLD','RUN_UP'].includes(m.restart.stage)){
      setup={time:Number(m.time.toFixed(2)),phase:m.phase,stage:m.restart.stage,
        fbMarks:fbIds('HOME').map(id=>({id,targetId:m.playersById[id].markTargetId||null}))};
    }
    E.step(m,DT);
    if(!kick&&(m.events||[]).some(e=>e.type===spec.event)){
      kick={...inspect(m,`${spec.id} KICK`),at:m.time};
    }
    if(kick&&m.time>=kick.at+.40-1e-7)after=inspect(m,`${spec.id} +0.40s`);
  }
  assert(setup,`${spec.id}: SETTLED_SETUP visited`);
  assert(kick&&after,`${spec.id}: real kick and +0.40s sampled`);
  for(const row of setup.fbMarks)assert(!row.targetId||m.playersById[row.targetId]?.role!=='CM',`${spec.id}: setup did not assign FB to CM`);
  assert(!(m.events||[]).some(e=>e.type==='USER_CHOICE'),`${spec.id}: no unselected hero action`);
  // Keep the actual kicked match and put both observed flank outlets in material
  // positions while two midfielders enter the central danger band. This forces
  // the public production assign/reconcile path to decide the contested duties.
  for(const [id,x,y] of [['A-RW',35,10],['A-LW',35,58],['A-LCM',10,27],['A-RCM',10,41]]){
    const p=m.playersById[id];Object.assign(p,{x,y,tx:x,ty:y,vx:0,vy:0});
  }
  T.assign(m);
  const contested=inspect(m,`${spec.id} current-geometry continuation`);
  assert.equal(contested.materialWide.length,2,`${spec.id}: both flank outlets are material in production continuation`);
  return{id:spec.id,setup,kick:{...kick,at:undefined},after,contested};
}

const real=[
  {id:'NO_WALL_INDIRECT',kind:'FREE_KICK',x:35,y:54,metadata:{freeKickType:'INDIRECT'},event:'FREE_KICK_TAKEN'},
  {id:'CORNER_TOP',kind:'CORNER',x:0,y:0,metadata:{cornerType:'DELIVERED'},event:'CORNER_KICK'},
  {id:'CORNER_BOTTOM',kind:'CORNER',x:0,y:68,metadata:{cornerType:'DELIVERED'},event:'CORNER_KICK'}
].map(realRestart);

function fixture(team,slot,{wide=true,centralRole='CM',withCentralDefenders=false,carrier=false}={}){
  const attack=other(team),dp=prefix(team),ap=prefix(attack),y=slot==='LB'?10:58;
  const make=(id,owner,role,playerSlot,x,ly)=>{const p=world(team,x,ly);return{id,team:owner,role,slot:playerSlot,x:p.x,y:p.y,tx:p.x,ty:p.y,vx:0,vy:0,markTargetId:null};};
  const fb=make(`${dp}-${slot}`,team,'FB',slot,19,y);
  const runner=make(`${ap}-${centralRole==='ST'?'ST':'CM'}`,attack,centralRole,centralRole==='ST'?'ST':'CM',centralRole==='ST'?10:17,34);
  const wing=make(`${ap}-${slot==='LB'?'RW':'LW'}`,attack,'WF',slot==='LB'?'RW':'LW',wide?35:52,y);
  const players=[fb,runner,wing];
  if(withCentralDefenders){players.push(make(`${dp}-CM`,team,'CM','CM',20,34));players.push(make(`${dp}-LCB`,team,'CB','LCB',18,32));}
  const m={time:100,phase:'OPEN_PLAY',possession:attack,players,playersById:Object.fromEntries(players.map(p=>[p.id,p])),ball:{mode:carrier?'CONTROLLED':'FLIGHT',ownerId:carrier?wing.id:null,x:wing.x,y:wing.y},offBallPolicy:'CURRENT',_defenceRoleLocks:{},_markLocks:{HOME:{pairs:{}},AWAY:{pairs:{}}}};
  return{m,fb,runner,wing};
}

const mirrored=[];
for(const team of ['HOME','AWAY'])for(const slot of ['LB','RB']){
  const label=`${team} ${slot}`;
  const guarded=fixture(team,slot),beforeLocks=JSON.stringify(guarded.m._markLocks);
  const state=T.reconcileDefensiveResponsibilities(guarded.m,team,null);
  assert.equal(state.threats.find(t=>t.id===guarded.runner.id).kind,'CENTRAL_RUNNER');
  assert.equal(state.threats.find(t=>t.id===guarded.wing.id).kind,'WIDE');
  assert(!state.threats.find(t=>t.id===guarded.runner.id).owners.includes(guarded.fb.id),`${label}: material wide lane forbids FB central runner`);
  assert(state.threats.find(t=>t.id===guarded.wing.id).owners.includes(guarded.fb.id),`${label}: FB remains available for own wide channel`);
  assert.equal(JSON.stringify(guarded.m._markLocks),beforeLocks,`${label}: no hard mark lock`);

  const stale=fixture(team,slot);stale.m.offBallPolicy='LOCKED_MARK';stale.fb.markTargetId=stale.runner.id;
  stale.m._defensiveResponsibility={[team]:{threats:[{id:stale.runner.id,owners:[stale.fb.id]}],records:{[stale.fb.id]:{ownerId:stale.fb.id,type:'MARK',targetId:stale.runner.id,assignmentAt:99.9,holdUntil:102}}}};
  const staleState=T.reconcileDefensiveResponsibilities(stale.m,team,null);
  assert(!staleState.threats.find(t=>t.id===stale.runner.id).owners.includes(stale.fb.id),`${label}: prior central lock cannot consume material wide FB`);
  assert.equal(JSON.stringify(stale.m._markLocks),beforeLocks,`${label}: no global mark-lock reset`);

  const vacancy=fixture(team,slot,{wide:false});vacancy.m._transitionWideVacancies={[team]:{[slot]:{fbId:vacancy.fb.id,threatId:vacancy.wing.id,slot,laneY:slot==='LB'?10:58,until:104}}};
  const vacancyState=T.reconcileDefensiveResponsibilities(vacancy.m,team,null);
  assert.equal(vacancyState.threats.find(t=>t.id===vacancy.wing.id).kind,'WIDE',`${label}: active transition outlet is material beyond x=49`);
  assert(!vacancyState.threats.find(t=>t.id===vacancy.runner.id).owners.includes(vacancy.fb.id),`${label}: vacancy also reserves FB from central runner`);

  const safe=fixture(team,slot,{wide:false,withCentralDefenders:true}),safeState=T.reconcileDefensiveResponsibilities(safe.m,team,null);
  assert(!safeState.threats.find(t=>t.id===safe.runner.id).owners.includes(safe.fb.id),`${label}: safe flank does not make FB an ordinary central runner marker`);
  assert(safeState.threats.find(t=>t.id===safe.runner.id).owners.includes(`${prefix(team)}-CM`),`${label}: eligible CM owns ordinary central runner with a safe flank`);
  assert.notEqual(safeState.records[safe.fb.id].targetId,safe.runner.id,`${label}: FB stays available for its structural role`);
  const striker=fixture(team,slot,{centralRole:'ST'}),stState=T.reconcileDefensiveResponsibilities(striker.m,team,null);
  assert(!stState.threats.find(t=>t.id===striker.runner.id).owners.includes(striker.fb.id),`${label}: central ST flank guard retained`);
  const safeStriker=fixture(team,slot,{wide:false,centralRole:'ST'}),safeStState=T.reconcileDefensiveResponsibilities(safeStriker.m,team,null);
  assert(safeStState.threats.find(t=>t.id===safeStriker.runner.id).owners.includes(safeStriker.fb.id),`${label}: safe flank still permits central ST tuck`);

  const shared=fixture(team,slot,{withCentralDefenders:true}),sharedState=T.reconcileDefensiveResponsibilities(shared.m,team,null);
  assert(sharedState.threats.find(t=>t.id===shared.runner.id).owners.includes(`${prefix(team)}-CM`),`${label}: CM remains preferred for central runner`);
  assert(!sharedState.threats.find(t=>t.id===shared.runner.id).owners.includes(shared.fb.id),`${label}: CM preference has no duplicate FB`);
  const covered=fixture(team,slot,{withCentralDefenders:true}),coverId=`${prefix(team)}-CM`;
  covered.m._defenceRoleLocks[team]={coverId};
  const coverState=T.reconcileDefensiveResponsibilities(covered.m,team,null);
  assert.equal(coverState.records[coverId].type,'COVER',`${label}: current required cover remains cover`);
  assert(!coverState.threats.some(t=>t.owners.includes(coverId)),`${label}: cover is not consumed as another marker`);
  assert(coverState.threats.find(t=>t.id===covered.runner.id).owners.includes(`${prefix(team)}-LCB`),`${label}: CB can take the central runner`);
  const press=fixture(team,slot,{carrier:true});press.m._defenceRoleLocks[team]={pressId:press.fb.id};
  const pressState=T.reconcileDefensiveResponsibilities(press.m,team,press.wing);
  assert.equal(pressState.records[press.fb.id].type,'PRESS',`${label}: actual wide carrier press retains authority`);
  assert.equal(pressState.primaryPressureTargetId,press.wing.id,`${label}: pressure refers to current carrier`);
  mirrored.push({team,slot,guarded:'PASS',staleLock:'PASS',transitionVacancy:'PASS',safeCentralRunnerPolicy:'PASS',centralStriker:'PASS',cmPreference:'PASS',coverPreserved:'PASS',currentCarrierPress:'PASS'});
}

console.log(JSON.stringify({verdict:'PASS_V62_SET_PIECE_FB_WIDE_LANE_RESPONSIBILITY',real,mirrored,futureOutcomePrecomputed:false,userVisualPass:false},null,2));
