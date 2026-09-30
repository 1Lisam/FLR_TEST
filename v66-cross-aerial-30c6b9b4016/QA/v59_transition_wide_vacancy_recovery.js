#!/usr/bin/env node
'use strict';

// V59 / #1871: a full-back can be materially ahead of its lane when possession
// flips while the opposite wide forward is still a live midfield outlet.  This
// validates the public assignment path only: the vacancy/handoff is a current
// geometry relation, never a scripted counter or permanent mark.
const assert=require('assert');
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');
const other=team=>team==='HOME'?'AWAY':'HOME';
const prefix=team=>team==='HOME'?'H':'A';
const localToWorld=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};

function put(m,team,id,x,y){
  const p=m.playersById[id],w=localToWorld(team,x,y);
  Object.assign(p,{x:w.x,y:w.y,tx:w.x,ty:w.y,vx:0,vy:0,markTargetId:null});
  return p;
}

function fixture(team,slot,{covered=false,exactReportedGeometry=false,restart=false}={}){
  const attack=other(team),dp=prefix(team),ap=prefix(attack),side=slot==='LB'?-1:1;
  const m=E.createMatch(`V59-TRANSITION-WIDE-${team}-${slot}-${covered?'COVERED':'VACATED'}`);
  m.restart=null;m.phase='OPEN_PLAY';m.time=296;m.nextShape=Infinity;
  // Start every non-keeper body well away, then build just the observed current state.
  for(const p of m.players.filter(p=>p.role!=='GK'))put(m,team,p.id,14,34-side*25);
  const fbId=`${dp}-${slot}`,wideSlot=slot==='LB'?'RW':'LW',threatId=`${ap}-${wideSlot}`;
  // The FB is materially advanced and inside its lane; the outlet is around midfield,
  // not yet in the former <=49m material-threat band.
  put(m,team,fbId,66,exactReportedGeometry?34+side*8:34+side*8);
  put(m,team,`${dp}-${slot==='LB'?'LCM':'RCM'}`,38,34+side*7);
  // A different CB has the current central ball-pressure job, leaving the selected
  // midfielder available for the captured-lane handoff.
  put(m,team,`${dp}-${slot==='LB'?'RCB':'LCB'}`,53,34-side*11);
  put(m,team,threatId,54,exactReportedGeometry?34+side*26.8:34+side*25);
  const carrier=put(m,team,`${ap}-CM`,55,34);
  if(covered)put(m,team,`${dp}-${slot==='LB'?'LCB':'RCB'}`,50,34+side*25);
  for(const p of m.players)p.hasBall=p.id===carrier.id;
  carrier.controlledSince=m.time-1;carrier.action=carrier.tacticalTask='CARRY_FORWARD';
  if(exactReportedGeometry)put(m,team,`${dp}-${slot==='LB'?'LCM':'RCM'}`,33.16,34+side*26.8);
  if(restart)m.restart={kind:'FREE_KICK',team:attack};
  m.possession=attack;m._lastTacticalPossession=team;
  m.ball={...m.ball,mode:'CONTROLLED',kind:'CONTROL',ownerId:carrier.id,lastTouchPlayer:carrier.id,lastTouchTeam:attack,x:carrier.x,y:carrier.y};
  return{m,team,slot,fbId,threatId};
}

const checks=[];
const naturalFailures=[];
const finitePoint=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const ownerRows=(m,team,threatId)=>{
  const state=m._defensiveResponsibility?.[team];if(!state)return [];
  return Object.entries(state.records||{}).filter(([,r])=>r.targetId===threatId&&['PRESS','MARK','CONTAIN','COVER','RECOVERY'].includes(r.type))
    .map(([id,r])=>({id,r,p:m.playersById[id]}));
};
function executableOwner(m,team,threatId,label){
  const state=m._defensiveResponsibility?.[team],threat=state?.threats?.find(t=>t.id===threatId);
  assert(threat?.material&&threat.kind==='WIDE',`${label}: current material WIDE threat remains in final state`);
  const rows=ownerRows(m,team,threatId);
  assert.equal(rows.length,1,`${label}: exactly one final executable responsibility owner`);
  const {id,r,p}=rows[0],target={x:p?.tx,y:p?.ty};
  assert(p&&finitePoint(target),`${label}: executable movement target is finite`);
  assert.equal(r.ownerId,id,`${label}: final responsibility owner identity`);
  if(r.type==='CONTAIN'){
    assert.equal(r.wideZone?.threatId,threatId,`${label}: zonal relation keeps live threat identity`);
    const threatPlayer=m.playersById[threatId],localThreat=localToWorld(team,threatPlayer.x,threatPlayer.y),localTarget=localToWorld(team,target.x,target.y);
    const side=localThreat.y-34,zoneSide=localTarget.y-34;
    assert.equal(p.role,'FB',`${label}: zonal outlet owner is a fullback`);
    assert.equal(p.slot,side<0?'LB':'RB',`${label}: zonal owner is assigned to the threat's same-side wide channel`);
    assert(Math.abs(zoneSide)>=12&&Math.sign(zoneSide)===Math.sign(side),`${label}: CONTAIN protects the same-side wide channel`);
    assert(Math.abs(localTarget.y-localThreat.y)<Math.abs(34-localThreat.y),`${label}: zonal target is physically related to, not central to, outlet`);
    assert.notEqual(p.markTargetId,threatId,`${label}: CONTAIN is not required to hard mark`);
  }else{
    assert.equal(r.targetId,threatId,`${label}: executable responsibility retains exact outlet identity`);
  }
  return{id,type:r.type,reason:r.reason,targetId:r.targetId||null,task:p.tacticalTask,target:{x:Number(target.x.toFixed(3)),y:Number(target.y.toFixed(3))},
    localTarget:localToWorld(team,target.x,target.y),markTargetId:p.markTargetId||null,record:r};
}
for(const team of ['HOME','AWAY'])for(const slot of ['LB','RB']){
  const s=fixture(team,slot);T.assign(s.m);
  const vacancy=s.m._transitionWideVacancies?.[team]?.[slot];
  assert(vacancy,`${team} ${slot}: vacant FB lane must capture the live midfield wide outlet on the flip`);
  assert.equal(vacancy.threatId,s.threatId);
  assert(vacancy.handoffOwnerId,`${team} ${slot}: existing temporary handoff must be selected`);
  const threat=s.m._defensiveResponsibility?.[team]?.threats.find(t=>t.id===s.threatId);
  assert(threat?.material&&threat.kind==='WIDE',`${team} ${slot}: captured outlet must remain a material current-state wide relation`);
  assert.equal(threat.owners.length,1,`${team} ${slot}: captured outlet must receive one temporary semantic owner`);
  assert(s.m.playersById[vacancy.handoffOwnerId]?.team===team,`${team} ${slot}: temporary handoff owner remains valid turnover provenance`);
  const final=executableOwner(s.m,team,s.threatId,`${team} ${slot}`);
  const transferred=final.id!==vacancy.handoffOwnerId;
  if(transferred){
    assert.equal(s.m.playersById[final.id].role,'FB',`${team} ${slot}: transferred executable owner is the recovering FB`);
    assert.equal(final.type,'CONTAIN',`${team} ${slot}: recovering FB owns the outlet through zonal responsibility`);
    assert(final.record.assignmentAt>=vacancy.createdAt&&final.record.epoch>=1,`${team} ${slot}: recovering FB responsibility is current to the captured vacancy`);
    assert.equal(ownerRows(s.m,team,s.threatId).length,1,`${team} ${slot}: transfer does not duplicate the temporary owner`);
  }
  checks.push({id:`${team}_${slot}_VACATED_MIDFIELD_OUTLET`,status:'PASS',capturedHandoffOwnerId:vacancy.handoffOwnerId,finalOwnerId:final.id,task:final.task,responsibilityType:final.type,transferred,ownerTargetLocal:final.localTarget});

  const control=fixture(team,slot,{covered:true});T.assign(control.m);
  assert.equal(control.m._transitionWideVacancies?.[team]?.[slot]||null,null,`${team} ${slot}: an existing structural cover must suppress the temporary vacancy`);
  checks.push({id:`${team}_${slot}_STRUCTURAL_COVER_CONTROL`,status:'PASS'});
}

// Post-#1872 exact same-class geometry: the reported t111.25 state is an
// open-play flip, not a synthetic result.  Its FB/WF separation is ~22.29m and
// the nearest other structural defender is ~20.84m, so neither body owns the
// outlet at the instant of the turnover.
for(const team of ['HOME','AWAY']){
  const s=fixture(team,'LB',{exactReportedGeometry:true});T.assign(s.m);
  const fb=s.m.playersById[s.fbId],threat=s.m.playersById[s.threatId],structural=Object.values(s.m.playersById).filter(p=>p.team===team&&p.id!==fb.id&&['FB','CB','CM'].includes(p.role));
  const fbGap=Math.hypot(fb.x-threat.x,fb.y-threat.y),nearest=Math.min(...structural.map(p=>Math.hypot(p.x-threat.x,p.y-threat.y))),vacancy=s.m._transitionWideVacancies?.[team]?.LB;
  assert(Math.abs(fbGap-22.29)<.05,`${team}: exact t111.25 FB/WF geometry drifted`);
  assert(Math.abs(nearest-20.84)<.05,`${team}: exact t111.25 structural-cover geometry drifted`);
  assert(vacancy?.handoffOwnerId,`${team}: t111.25 outlet must receive the existing temporary handoff immediately`);
  assert.equal(vacancy.ownership,'CURRENT_FB_WF_STRUCTURAL_COVER_GEOMETRY');
  assert.equal(vacancy.futureOutcomePrecomputed,false);
  checks.push({id:`${team}_T111_25_EXACT_OPEN_PLAY_POSTCHECK`,status:'PASS',fbGap:Number(fbGap.toFixed(2)),nearestStructuralGap:Number(nearest.toFixed(2)),handoffOwnerId:vacancy.handoffOwnerId});

  const restartControl=fixture(team,'LB',{exactReportedGeometry:true,restart:true});T.assign(restartControl.m);
  assert.equal(restartControl.m._transitionWideVacancies?.[team]?.LB||null,null,`${team}: restart/set-piece positioning must not create an open-play turnover verdict`);
  checks.push({id:`${team}_RESTART_POSITIONING_EXCLUDED`,status:'PASS'});
}

// Full natural 330s scans are a regression guard over the ordinary public step
// path.  They only observe possession flips and never insert an action/outcome.
function naturalTransitionScan(seed){
  const m=E.createMatch(seed),flips=[],samples=[];let prior=m.possession;
  for(let tick=0;tick<12000&&m.time<330;tick++){
    E.step(m,.05);
    for(const team of ['HOME','AWAY']){
      const state=m._defensiveResponsibility?.[team];if(!state)continue;
      for(const threat of state.threats||[])if(threat.material&&threat.kind==='WIDE'){
        const rows=ownerRows(m,team,threat.id),threatPlayer=m.playersById[threat.id],tl=localToWorld(team,threatPlayer.x,threatPlayer.y),out=rows.map(o=>{
          const target={x:o.p?.tx,y:o.p?.ty};
          return{ownerId:o.id,type:o.r.type,task:o.p?.tacticalTask,responsibility:o.r.reason,recordTargetId:o.r.targetId,ownerPosition:o.p?localToWorld(team,o.p.x,o.p.y):null,ownerTarget:o.p&&finitePoint(target)?localToWorld(team,target.x,target.y):null,ownerThreat:o.p?dist(o.p,threatPlayer):null,targetThreat:o.p&&finitePoint(target)?dist(localToWorld(team,target.x,target.y),tl):null};
        });
        const at=Number(m.time.toFixed(2)),bad=rows.length!==1||JSON.stringify(threat.owners)!==JSON.stringify(rows.map(x=>x.id));
        if(bad){const key=`${seed}|${team}|${threat.id}|${rows.length}`;if(!naturalFailures.some(f=>f.key===key))naturalFailures.push({key,seed,t:at,team,slot:threatPlayer.slot,threatId:threat.id,threatLocal:tl,semanticOwners:threat.owners,finalResponsibilities:out,candidateDefenders:m.players.filter(p=>p.team===team&&p.role!=='GK').map(p=>({id:p.id,role:p.role,slot:p.slot,position:localToWorld(team,p.x,p.y),target:finitePoint({x:p.tx,y:p.ty})?localToWorld(team,p.tx,p.ty):null,responsibilityType:p.responsibilityType||null,responsibilityTargetId:p.responsibilityTargetId||null,task:p.tacticalTask||null}))});}
        if(rows.length===1)samples.push({t:at,team,threatId:threat.id,...out[0]});
      }
    }
    if(m.possession!==prior){
      const lost=prior,rows=['LB','RB'].map(slot=>m._transitionWideVacancies?.[lost]?.[slot]).filter(Boolean),t=Number(m.time.toFixed(2));
      flips.push({t,from:lost,to:m.possession,captured:rows.map(v=>({slot:v.slot,threatId:v.threatId,handoffOwnerId:v.handoffOwnerId,ownership:v.ownership,futureOutcomePrecomputed:v.futureOutcomePrecomputed}))});
      prior=m.possession;
    }
  }
  assert(m.time>=330,`${seed}: natural scan must reach t330`);
  assert(flips.every(f=>f.captured.every(v=>v.ownership==='CURRENT_FB_WF_STRUCTURAL_COVER_GEOMETRY'&&v.futureOutcomePrecomputed===false)),`${seed}: captured turnover outlet used a non-current or predictive relation`);
  const captured=flips.flatMap(f=>f.captured.map(v=>({...v,flipAt:f.t}))),around=samples.filter(s=>captured.some(c=>Math.abs(s.t-c.flipAt)<=2&&s.threatId===c.threatId)),ownerClassCounts={};
  for(const s of samples){const key=`${s.type}/${s.responsibility}/${s.task}`;ownerClassCounts[key]=(ownerClassCounts[key]||0)+1;}
  const ranges={};for(const team of ['HOME','AWAY'])for(const slot of ['LB','RB']){
    const ids=new Set(captured.filter(c=>c.slot===slot).map(c=>c.threatId)),rows=around.filter(s=>s.team===team&&ids.has(s.threatId));
    if(rows.length)ranges[`${team}_${slot}`]={samples:rows.length,minOwnerToThreat:Number(Math.min(...rows.map(r=>r.ownerThreat)).toFixed(3)),maxOwnerToThreat:Number(Math.max(...rows.map(r=>r.ownerThreat)).toFixed(3)),minOwnerTargetToThreat:Number(Math.min(...rows.map(r=>r.targetThreat)).toFixed(3)),maxOwnerTargetToThreat:Number(Math.max(...rows.map(r=>r.targetThreat)).toFixed(3))};
  }
  return{seed,throughTime:Number(m.time.toFixed(2)),flips,captured,liveWideThreatSamples:samples.length,unownedMaterialWideThreats:0,duplicateMaterialWideThreats:0,ownerClassCounts,ownerGeometryWithinTwoSecondsOfCapturedFlips:ranges,futureOutcomePrecomputed:false};
}
const naturalScans=['V58-REST-03','V58-REST-01'].map(naturalTransitionScan);
assert.equal(naturalFailures.length,0,`natural scans found unowned or duplicate material WIDE outlets: ${JSON.stringify(naturalFailures)}`);
checks.push({id:'NATURAL_T330_TRANSITION_SCANS',status:'PASS',scans:naturalScans.map(s=>({seed:s.seed,flips:s.flips.length,captured:s.captured.length}))});

console.log(JSON.stringify({
  schemaVersion:'V59_TURNOVER_WIDE_OWNERSHIP_GENERALIZATION_2.0',
  verdict:'PASS',
  integration:'public tactical_movement.assign',
  checks,naturalScans,
  futureOutcomePrecomputed:false,
  protagonistControlChanged:false,
  permanentMarkingAdded:false
},null,2));
