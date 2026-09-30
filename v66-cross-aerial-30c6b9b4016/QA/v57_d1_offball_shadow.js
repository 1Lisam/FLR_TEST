#!/usr/bin/env node
'use strict';

const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const {performance}=require('perf_hooks');
const ROOT=path.resolve(__dirname,'..');
const E=require(path.join(ROOT,'runtime/continuous_match_core.js'));
const A=require(path.join(ROOT,'runtime/attribute_match_adapter.js'));
const M=require(path.join(ROOT,'runtime/manager_tendency_adapter.js'));
const D=require(path.join(ROOT,'runtime/offball_decision_shadow.js'));
const HARNESS=path.join(ROOT,'single_state_continuity_test.js');
const MANIFEST_PATH=path.join(ROOT,'evidence/v56/d0_offball_case_manifest.json');
const OUT=path.join(ROOT,'evidence/v57/d1_offball_shadow.json');
const BASE='daeac3f14a9d2e46cf316c70ca1b6939a6c0344a';
const SEED='SINGLE-V56-1-H-ST',DT=.05;
const SHA=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const harnessSource=fs.readFileSync(HARNESS,'utf8');
const manifest=JSON.parse(fs.readFileSync(MANIFEST_PATH,'utf8'));
const checks=[];
function check(group,id,fn){
  try{const detail=fn()||{};checks.push({group,id,...detail,status:'PASS'});return detail;}
  catch(error){checks.push({group,id,status:'FAIL',error:error.stack||String(error)});throw error;}
}
function same(a,b,message){assert.deepStrictEqual(a,b,message);}
function ok(value,message){assert.ok(value,message);}

function between(src,start,end){const a=src.indexOf(start);if(a<0)throw new Error(`SOURCE_TOKEN_MISSING:${start}`);const b=end?src.indexOf(end,a+start.length):src.length;return src.slice(a,b<0?src.length:b);}
function scenarioSource(key){const start=`if(key==='${key}')`,a=harnessSource.indexOf(start);if(a<0)throw new Error(`SCENARIO_MISSING:${key}`);const b=harnessSource.indexOf("}else if(key==='",a+start.length);return harnessSource.slice(a,b<0?harnessSource.indexOf('\n}',a):b);}
function parsePositions(text){const rows=[],re=/setPlayerPos\(m,'([^']+)',\s*([-\d.]+),\s*([-\d.]+)\)/g;let x;while((x=re.exec(text)))rows.push({id:x[1],x:Number(x[2]),y:Number(x[3])});return rows;}
const baselinePositions=parsePositions(between(harnessSource,'function baselineOpenPlay(m){','function forcePossession'));
function fixtureDefinition(key){
  if(key==='NATURAL')return{positions:[],mark:null,markOwner:null,owner:null};
  const text=scenarioSource(key),positions=parsePositions(text),mark=/markTargetId='([^']+)'/.exec(text)?.[1]||null,owner=/forcePossession\(m,'([^']+)'\)/.exec(text)?.[1]||null,markOwner=/p\.id==='([^']+)'\);if\([^)]*\)[^;]*\.markTargetId=/.exec(text)?.[1]||null;
  return{positions,mark,markOwner,owner};
}
function player(m,id){return m.playersById?.[id]||m.players.find(p=>p.id===id)||null;}
function resetPosition(m,row){const p=player(m,row.id);if(!p)return;p.x=row.x;p.y=row.y;p.tx=row.x;p.ty=row.y;p.vx=0;p.vy=0;p.sprint=false;p.runUntil=0;p.runType=null;p.markTargetId=null;p.responsibilityTargetId=null;p.responsibilityType=null;}
function applyFixture(m,key){
  if(key==='NATURAL')return;
  for(const row of baselinePositions)resetPosition(m,row);
  m.restart=null;m.setPieceLive=null;m.goalCelebration=null;m.completed=false;m.phase='OPEN_PLAY';m.time=600;m.nextShape=0;m.transitionUntil=0;
  m._defenceRoleLocks={};m._defensiveResponsibility={};m._markLocks={};m._transitionWideVacancies={};
  const def=fixtureDefinition(key);for(const row of def.positions)resetPosition(m,row);
  const initialMarker=def.mark&&def.markOwner?player(m,def.markOwner):null;if(initialMarker)initialMarker.markTargetId=def.mark;
  if(def.owner){const p=player(m,def.owner),bridge=E.choiceActionBridge();for(const q of m.players)q.hasBall=false;bridge.setControlled(m,p,true);m.nextShape=0;}
}
function create(policy='CURRENT',scenario='NATURAL',seed=SEED){const m=E.createMatch(seed);for(const p of m.players)A.assign(m,p.id,A.baseProfile(60));M.init(m,{HOME:'BALANCED',AWAY:'BALANCED'});m.offBallPolicy=policy;applyFixture(m,scenario);return m;}
function authoritativeDigest(m){return digest({snapshot:E.snapshot(m),rng:m.r?.observe?.()||null,defence:m._defensiveResponsibility||null,locks:m._defenceRoleLocks||null,markLocks:m._markLocks||null,transition:m._transitionWideVacancies||null});}
function semantic(decision){return D.semanticProjection(decision);}

function makePlayer(id,team,role,slot,x,y,extra={}){return{id,team,role,slot,x,y,vx:0,vy:0,tx:x,ty:y,bodyAngle:null,faceTargetAngle:null,hasBall:false,action:null,tacticalTask:null,markTargetId:null,...extra};}
function mockMatch(players,opts={}){
  const ball={mode:'DEAD',kind:null,ownerId:null,intendedReceiverId:null,flightReceiverId:null,x:52.5,y:34,z:0,vx:0,vy:0,vz:0,age:0,...opts.ball};
  return{time:opts.time??100,phase:opts.phase||'OPEN_PLAY',possession:opts.possession||'AWAY',ball,players,managerProfiles:opts.managerProfiles||{},tactical:opts.tactical||null,restart:opts.restart||null,setPieceLive:opts.setPieceLive||null,protagonistControllerId:opts.protagonistControllerId||null,userIncomingIntent:opts.userIncomingIntent||null};
}
function standardPlayers(){return[
  makePlayer('H-GK','HOME','GK','GK',6,34),makePlayer('H-LB','HOME','FB','LB',25,10),makePlayer('H-LCB','HOME','CB','LCB',25,27),makePlayer('H-RCB','HOME','CB','RCB',25,41),makePlayer('H-RB','HOME','FB','RB',25,58),makePlayer('H-LCM','HOME','CM','LCM',38,21),makePlayer('H-CM','HOME','CM','CM',38,34),makePlayer('H-RCM','HOME','CM','RCM',38,47),makePlayer('H-LW','HOME','WF','LW',55,10),makePlayer('H-ST','HOME','ST','ST',55,34),makePlayer('H-RW','HOME','WF','RW',55,58),
  makePlayer('A-GK','AWAY','GK','GK',99,34),makePlayer('A-LB','AWAY','FB','LB',80,58),makePlayer('A-LCB','AWAY','CB','LCB',82,41),makePlayer('A-RCB','AWAY','CB','RCB',82,27),makePlayer('A-RB','AWAY','FB','RB',80,10),makePlayer('A-LCM','AWAY','CM','LCM',67,47),makePlayer('A-CM','AWAY','CM','CM',67,34),makePlayer('A-RCM','AWAY','CM','RCM',67,21),makePlayer('A-LW','AWAY','WF','LW',52,57),makePlayer('A-ST','AWAY','ST','ST',49,34),makePlayer('A-RW','AWAY','WF','RW',52,11)
];}
function setPos(players,id,x,y,extra={}){const p=players.find(q=>q.id===id);Object.assign(p,{x,y,tx:x,ty:y,...extra});return p;}
function priorDecision(team,rows){return{schemaVersion:'V57_D1_SHADOW_DECISION_1',teamDecisions:{HOME:{team:'HOME',responsibilities:team==='HOME'?rows:[]},AWAY:{team:'AWAY',responsibilities:team==='AWAY'?rows:[]}}};}
function threatFor(snapshot,team,subjectId){const d=D.deriveDangerFacts(snapshot,team);return d.routes.find(x=>x.subjectId===subjectId)||d.flightReceiver||d.carrier;}

const sourceHashes={
  singleStateContinuity:SHA(HARNESS),runtimeTacticalMovement:SHA(path.join(ROOT,'runtime/tactical_movement.js')),runtimeContinuousCore:SHA(path.join(ROOT,'runtime/continuous_match_core.js')),
  d0ArchitectureReview:SHA(path.join(ROOT,'docs/v56/D_OFFBALL_RESPONSIBILITY_ARCHITECTURE_ASTRA_REVIEW.md')),d0ArchitectureEvidence:SHA(path.join(ROOT,'evidence/v56/d_offball_responsibility_architecture_astra_review.json')),
  d0Contract:SHA(path.join(ROOT,'docs/v56/D0_OFFBALL_FAILURE_CONTRACT.md')),d0Checkpoint:SHA(path.join(ROOT,'docs/v56/D0_OFFBALL_FAILURE_CONTRACT_CHECKPOINT.md')),
  d0Evidence:SHA(path.join(ROOT,'evidence/v56/d0_offball_failure_contract.json')),d0CaseManifest:SHA(MANIFEST_PATH),d0QA:SHA(path.join(ROOT,'QA/v56_d0_offball_failure_contract.js')),
  d1Shadow:SHA(path.join(ROOT,'runtime/offball_decision_shadow.js')),d1QA:SHA(__filename)
};

check('LINEAGE','D0_SOURCE_HASHES_EXACT',()=>{
  same(sourceHashes.singleStateContinuity,manifest.sourceHashes.harness);
  same(sourceHashes.runtimeTacticalMovement,manifest.sourceHashes.runtimeTacticalMovement);
  same(sourceHashes.runtimeContinuousCore,manifest.sourceHashes.runtimeContinuousCore);
  same(manifest.caseMapping.length,13);return{baseCommit:BASE,manifestCases:13};
});

const q01Rows=[];
check('Q01','PURE_NO_AUTHORITATIVE_OR_RNG_MUTATION',()=>{
  for(const c of manifest.caseMapping){const m=create(c.policy,c.scenarioId,c.seed),before=authoritativeDigest(m),out=D.observe(m,null),after=authoritativeDigest(m);same(after,before,`${c.caseId} shadow mutated authoritative state`);ok(Object.isFrozen(out.snapshot)&&Object.isFrozen(out.snapshot.players),'snapshot must be deeply frozen');q01Rows.push({caseId:c.caseId,before,after,identical:before===after});}
  return{checkedCases:q01Rows.length,allAuthoritativeAndRngDigestsIdentical:true};
});

let q02SnapshotId=null;
check('Q02','ONE_IMMUTABLE_SNAPSHOT_AND_ENUMERATION_INDEPENDENCE',()=>{
  const m=create('CURRENT','WIDE_HANDOFF'),normal=D.observe(m),permuted={...m,players:[...m.players].reverse()},reverse=D.observe(permuted);
  same(semantic(normal.decision),semantic(reverse.decision));
  ok(normal.decision.sameImmutableSnapshotForBothTeams);same(normal.decision.teamDecisions.HOME.snapshotEpoch,normal.decision.teamDecisions.AWAY.snapshotEpoch);
  q02SnapshotId=normal.decision.snapshotId;return{snapshotId:q02SnapshotId,playerOrdersCompared:2,semanticResultsIdentical:true};
});

const q03=[];
check('Q03','REJECT_FALSE_ACQUISITION',()=>{
  const players=standardPlayers();setPos(players,'A-ST',34,34);setPos(players,'H-LCB',5,34,{markTargetId:'A-ST'});
  let snap=D.buildSnapshot(mockMatch(players)),threat=threatFor(snap,'HOME','A-ST'),relation=D.relationshipTarget('HOME',threat,'MARK');
  let a=D.assessAcquisition(snap,'HOME','H-LCB',threat,relation);ok(!a.acquired&&a.failures.includes('BODY_TOO_FAR'));q03.push({id:'FAR_SUCCESSOR_LABEL_ONLY',status:'REJECTED',failures:a.failures});
  setPos(players,'H-LCB',31,34);snap=D.buildSnapshot(mockMatch(players));threat=threatFor(snap,'HOME','A-ST');relation={...D.relationshipTarget('HOME',threat,'MARK'),targetPoint:{x:72,y:34}};a=D.assessAcquisition(snap,'HOME','H-LCB',threat,relation);ok(!a.acquired&&a.failures.includes('TARGET_LEAVES_THREAT'));q03.push({id:'BODY_GOOD_TARGET_LEAVES',status:'REJECTED',failures:a.failures});
  setPos(players,'H-LCB',5,34);snap=D.buildSnapshot(mockMatch(players));threat=threatFor(snap,'HOME','A-ST');relation=D.relationshipTarget('HOME',threat,'MARK');a=D.assessAcquisition(snap,'HOME','H-LCB',threat,relation);ok(!a.acquired&&a.failures.includes('BODY_TOO_FAR'));q03.push({id:'TARGET_GOOD_BODY_FAR',status:'REJECTED',failures:a.failures});
  setPos(players,'H-LCB',31,34);setPos(players,'A-CM',35,50);snap=D.buildSnapshot(mockMatch(players));threat=threatFor(snap,'HOME','A-ST');relation=D.relationshipTarget('HOME',threat,'MARK');a=D.assessAcquisition(snap,'HOME','H-LCB',threat,relation,[{actorId:'H-LCB',subjectId:'A-CM',state:'ACQUIRED',primary:true}]);ok(!a.acquired&&a.failures.includes('SOLE_MANDATORY_DUTY_CONFLICT'));q03.push({id:'ABANDONS_OTHER_SOLE_MANDATORY_THREAT',status:'REJECTED',failures:a.failures});
  return{probes:q03};
});

let handoffDecision,endedDecision,cancelDecision;
check('Q04','ACQUIRE_BEFORE_RELEASE_CANCEL_END_AND_CIRCULAR_REJECTION',()=>{
  const players=standardPlayers();setPos(players,'A-ST',34,34);setPos(players,'H-LCB',7,27);setPos(players,'H-CM',31.5,34);
  const prior=priorDecision('HOME',[{actorId:'H-LCB',duty:'MARK',subjectId:'A-ST',threatId:'ROUTE:A-ST',lifecycle:'ACQUIRED'}]);
  handoffDecision=D.observe(mockMatch(players),prior).decision.teamDecisions.HOME;
  const events=handoffDecision.transfers.filter(x=>x.subjectId==='A-ST'),states=events.map(x=>x.state);
  ok(states.includes('HANDOFF_REQUESTED')&&states.includes('ACQUIRED')&&states.includes('RELEASED'));ok(states.indexOf('ACQUIRED')<states.indexOf('RELEASED'),'release preceded acquisition');
  const acq=handoffDecision.responsibilities.find(x=>x.subjectId==='A-ST');ok(acq&&acq.actorId==='H-CM'&&acq.lifecycle==='ACQUIRED');

  const far=standardPlayers();setPos(far,'A-ST',34,34);for(const id of ['H-LB','H-LCB','H-RCB','H-RB','H-LCM','H-CM','H-RCM'])setPos(far,id,7,far.find(p=>p.id===id)?.y||34);const acquiring=D.observe(mockMatch(far),prior).decision.teamDecisions.HOME;ok(acquiring.transfers.some(x=>x.state==='ACQUIRING'));ok(acquiring.diagnostics.deficits.some(x=>x.subjectId==='A-ST'));

  const ended=standardPlayers();setPos(ended,'A-ST',90,34);endedDecision=D.observe(mockMatch(ended),prior).decision.teamDecisions.HOME;ok(endedDecision.transfers.some(x=>x.subjectId==='A-ST'&&x.state==='RELEASED'&&x.reason==='CURRENT_THREAT_ENDED'));
  const acquiringPrior=priorDecision('HOME',[{actorId:'H-CM',predecessorId:'H-LCB',duty:'RECOVER',subjectId:'A-ST',threatId:'ROUTE:A-ST',lifecycle:'ACQUIRING'}]);cancelDecision=D.observe(mockMatch(ended),acquiringPrior).decision.teamDecisions.HOME;ok(cancelDecision.transfers.some(x=>x.state==='CANCELLED'));

  const unresolved=[{predecessorId:'H-LCB',successorId:'H-CM',state:'HANDOFF_REQUESTED'},{predecessorId:'H-CM',successorId:'H-LCB',state:'ACQUIRING'}],cycles=D.rejectCircularHandoffs(unresolved);same(cycles,['H-CM<>H-LCB']);
  return{validSameTickHandoffStates:states,acquireIndex:states.indexOf('ACQUIRED'),releaseIndex:states.indexOf('RELEASED'),farSuccessor:'ACQUIRING_WITH_EXPLICIT_DEFICIT',threatEnded:'RELEASED',cancel:'CANCELLED',circularHandoffRejected:cycles};
});

let stableOwners=[],changedOwners=[];
check('Q05','NO_STABLE_CHURN_AND_MATERIAL_CHANGE_REASSIGNMENT',()=>{
  const players=standardPlayers();setPos(players,'A-ST',34,34);setPos(players,'H-LCB',31,32);setPos(players,'H-CM',36,34);
  let prior=null,firstSemantic=null;
  for(let i=0;i<5;i++){const out=D.observe(mockMatch(players,{time:200+i*.05}),prior),team=out.decision.teamDecisions.HOME,owner=team.responsibilities.find(r=>r.subjectId==='A-ST'&&['MARK','PRESS'].includes(r.duty));stableOwners.push(owner?.actorId||null);const projection=semantic(out.decision);if(i===0)firstSemantic=projection;prior=out.nextPriorShadowDecision;}
  ok(new Set(stableOwners).size===1&&stableOwners[0],'stable threat owner churned');
  setPos(players,'A-ST',90,34);setPos(players,'A-LCM',34,32);const changed=D.observe(mockMatch(players,{time:201}),prior).decision.teamDecisions.HOME;changedOwners=changed.responsibilities.filter(r=>r.subjectId==='A-LCM').map(r=>r.actorId);ok(changed.transfers.some(x=>x.subjectId==='A-ST'&&x.state==='RELEASED'));ok(changedOwners.length>0,'material current threat did not receive a current responsibility');
  return{stableOwners,unexplainedABA:false,materialThreatChangeReleasedOld:true,newThreatOwners:changedOwners,firstDecisionDigest:digest(firstSemantic)};
});

const positiveControls=[];
function positive(id,fn){const detail=fn();positiveControls.push({id,status:'PASS',...detail});}
check('POSITIVE_CONTROLS','NON_PARKING_AND_LEGITIMATE_RELATIONSHIPS',()=>{
  positive('CB_STEP_WITH_PARTNER_OR_DM_PROTECTION',()=>{const ps=standardPlayers();setPos(ps,'A-CM',40,34,{hasBall:true});setPos(ps,'A-ST',34,31);setPos(ps,'H-LCB',38.5,34);setPos(ps,'H-RCB',31,32);setPos(ps,'H-CM',29,37);const d=D.observe(mockMatch(ps,{possession:'AWAY',ball:{mode:'CONTROLLED',ownerId:'A-CM',x:40,y:34}})).decision.teamDecisions.HOME;const central=d.responsibilities.filter(r=>r.subjectId==='A-ST'),press=d.responsibilities.find(r=>r.duty==='PRESS');ok(central.length&&press&&press.actorId==='H-LCB'&&press.actorId!==central[0].actorId);ok(d.coverOwnerId||central.some(x=>['H-RCB','H-CM'].includes(x.actorId)));return{pressOwner:press.actorId,centralOwner:central[0].actorId,coverOwner:d.coverOwnerId};});
  positive('COMPLETED_HANDOFF',()=>({states:handoffDecision.transfers.filter(x=>x.subjectId==='A-ST').map(x=>x.state)}));
  positive('AGGRESSIVE_FB_OVERLAP_UNDERLAP_INVERT_WITH_ACQUIRED_COVER',()=>{const variants=[];for(const task of ['OVERLAP','UNDERLAP','INVERT']){const ps=standardPlayers();setPos(ps,'H-CM',45,34,{hasBall:true});setPos(ps,'H-LB',55,10,{tacticalTask:task});setPos(ps,'H-LCM',32,12,{tacticalTask:'MIDFIELD_SCREEN'});setPos(ps,'A-RW',35,10);setPos(ps,'A-ST',90,34);const d=D.observe(mockMatch(ps,{possession:'HOME',ball:{mode:'CONTROLLED',ownerId:'H-CM',x:45,y:34}})).decision.teamDecisions.HOME,i=d.attackIntents.find(x=>x.actorId==='H-LB');ok(i&&['ACTIVE_RUN','ATTACK_SUPPORT'].includes(i.duty)&&i.safety.approved);variants.push({task,duty:i.duty,successorAcquiredNow:i.safety.successorAcquiredNow});}return{actorId:'H-LB',variants};});
  positive('ONE_FB_ASYMMETRY',()=>{const ps=standardPlayers();setPos(ps,'H-CM',45,34,{hasBall:true});setPos(ps,'H-LB',55,10,{tacticalTask:'OVERLAP'});setPos(ps,'H-LCM',32,12);setPos(ps,'A-RW',35,10);setPos(ps,'A-ST',90,34);const d=D.observe(mockMatch(ps,{possession:'HOME',ball:{mode:'CONTROLLED',ownerId:'H-CM',x:45,y:34}})).decision.teamDecisions.HOME,l=d.attackIntents.find(x=>x.actorId==='H-LB'),r=d.attackIntents.find(x=>x.actorId==='H-RB');ok(l.duty==='ACTIVE_RUN'&&r.duty==='BALANCE');return{left:l.duty,right:r.duty};});
  positive('HIGH_PRESS_AND_FORWARD_PRESS_SUPPORT',()=>{const ps=standardPlayers();setPos(ps,'A-LCB',50,34,{hasBall:true});setPos(ps,'A-LW',90,57);setPos(ps,'A-RW',90,11);setPos(ps,'H-ST',48,34,{tacticalTask:'HIGH_PRESS'});setPos(ps,'H-LW',55,10,{tacticalTask:'PRESS_SUPPORT'});const d=D.observe(mockMatch(ps,{possession:'AWAY',ball:{mode:'CONTROLLED',ownerId:'A-LCB',x:50,y:34}})).decision.teamDecisions.HOME;const p=d.responsibilities.find(x=>x.duty==='PRESS'),s=d.responsibilities.filter(x=>x.duty==='PRESS_SUPPORT');ok(p&&p.actorId==='H-ST');ok(s.some(x=>x.actorId==='H-LW'));return{pressOwner:p.actorId,pressSupportActors:s.map(x=>x.actorId)};});
  positive('TACTICAL_WINGER_DEEP_TRACK_WITH_COHERENT_STRUCTURE',()=>{const ps=standardPlayers();setPos(ps,'A-RW',34,10);setPos(ps,'H-LW',32,10,{tacticalTask:'TACTICAL_DEEP_TRACK'});for(const id of ['H-LB','H-LCB','H-RCB','H-RB','H-LCM','H-CM','H-RCM'])setPos(ps,id,8,ps.find(p=>p.id===id).y);const d=D.observe(mockMatch(ps)).decision.teamDecisions.HOME,r=d.responsibilities.find(x=>x.subjectId==='A-RW');ok(r&&r.actorId==='H-LW'&&r.lifecycle==='ACQUIRED');return{actorId:r.actorId,duty:r.duty,continuity:r.continuity};});
  positive('STATIONARY_HOLD_OR_COVER',()=>{const ps=standardPlayers();const cb=setPos(ps,'H-LCB',25,27,{tx:25,ty:27,vx:0,vy:0,tacticalTask:'HOLD'});const d=D.observe(mockMatch(ps,{possession:'HOME',ball:{mode:'CONTROLLED',ownerId:'H-ST',x:55,y:34}})).decision.teamDecisions.HOME,i=d.attackIntents.find(x=>x.actorId===cb.id);ok(i&&i.duty==='REST_DEFENCE'&&i.hold===true);return{actorId:i.actorId,duty:i.duty,stationaryHold:i.hold};});
  positive('GENUINE_THREAT_CHANGE_REASSIGNMENT',()=>({oldReleased:true,newOwners:changedOwners}));
  return{controls:positiveControls};
});

function addRestartFixture(m){
  const targets={};for(const p of m.players)if(p.team==='HOME'&&['H-LCB','H-RCB','H-CM'].includes(p.id))targets[p.id]={x:p.x,y:p.y,task:'FREE_KICK_WALL'};
  m.phase='SET_PIECE_SETUP';m.ball.mode='DEAD';m.ball.ownerId=null;m.ball.x=62;m.ball.y=34;m.ball.vx=m.ball.vy=0;m.possession='AWAY';
  m.restart={kind:'FREE_KICK',team:'AWAY',x:62,y:34,until:m.time+.9,stage:'SETUP',setupStartedAt:m.time,ballReturn:null,setup:{kickerId:'A-CM',targets}};
  return m;
}
const caseResults=[];
check('D0_CASES','ALL_13_CURRENT_STATE_SHADOW_COVERAGE',()=>{
  for(const c of manifest.caseMapping){
    const m=create(c.policy,c.scenarioId,c.seed);if(c.caseId==='CASE_02')addRestartFixture(m);
    const first=D.observe(m),second=D.observe(m,first.nextPriorShadowDecision),third=D.observe(m,second.nextPriorShadowDecision),home=second.decision.teamDecisions.HOME,away=second.decision.teamDecisions.AWAY;
    const acquired=[...home.responsibilities,...away.responsibilities].filter(r=>['OWNED','ACQUIRED'].includes(r.lifecycle)&&['MARK','PRESS','COVER'].includes(r.duty));
    const fbSafety=[...home.attackIntents,...away.attackIntents].filter(x=>x.safety);
    const stable=sameSemantic(second.decision,third.decision);
    let status='SHADOW_WATCH',reason='Mapped current-state fixture is observed, but it does not replay the exact user video transition.';
    if(c.caseId==='CASE_02')reason='QA-only FREE_KICK SETUP uses the real restart/setup/targets schema; no kick or future outcome is scripted.';
    else if(['CASE_01','CASE_03','CASE_04','CASE_05','CASE_07','CASE_08','CASE_10','CASE_11','CASE_12'].includes(c.caseId)&&acquired.length&&stable){status='SHADOW_PREVENTS_REPORTED_PATH';reason='On this mapped current-state input, repeated Shadow evaluation retains geometry-valid responsibility without unexplained churn; this is not a gameplay-solved claim.';}
    else if(['CASE_06','CASE_09','CASE_13'].includes(c.caseId)&&fbSafety.length){status='SHADOW_PREVENTS_REPORTED_PATH';reason='On this mapped current-state input, every observed FB support request carries an explicit current cover/rest-structure certificate or is gated; this is not a gameplay-solved claim.';}
    caseResults.push({caseId:c.caseId,scenarioId:c.scenarioId,policy:c.policy,status,reason,restartFixture:c.caseId==='CASE_02'?'QA_ONLY_REAL_SCHEMA_CURRENT_STATE':null,snapshotId:second.decision.snapshotId,stableRepeatedInput:stable,acquiredRelationshipCount:acquired.length,fullbackSafetyDecisions:fbSafety.map(x=>({actorId:x.actorId,duty:x.duty,approved:x.safety.approved,sameSideThreatIds:x.safety.sameSideThreatIds})),deficits:[...home.diagnostics.deficits,...away.diagnostics.deficits].map(x=>({status:x.status,reason:x.reason,subjectId:x.subjectId||null}))});
  }
  same(caseResults.length,13);ok(caseResults.every(x=>['SHADOW_PREVENTS_REPORTED_PATH','SHADOW_WATCH','NOT_EXERCISED'].includes(x.status)));return{caseCount:13,statuses:Object.fromEntries(caseResults.map(x=>[x.caseId,x.status]))};
});
function sameSemantic(a,b){
  const clean=x=>{const q=cloneJson(semantic(x));delete q.snapshotId;return q;};return JSON.stringify(clean(a))===JSON.stringify(clean(b));
}
function cloneJson(x){return JSON.parse(JSON.stringify(x));}

const q14={};
check('Q14','DETERMINISM_AND_SHADOW_ON_OFF_ENDPOINT_IDENTITY',()=>{
  const m=create('CURRENT','NATURAL','V57-D1-Q14'),snap=D.buildSnapshot(m),a=D.decideEpoch(snap),b=D.decideEpoch(snap);same(semantic(a),semantic(b));
  const off=create('CURRENT','WIDE_HANDOFF','V57-D1-Q14-LIVE'),on=create('CURRENT','WIDE_HANDOFF','V57-D1-Q14-LIVE'),rows=[];let prior=null;
  for(let tick=0;tick<=80;tick++){
    if(tick>0){E.step(off,DT);E.step(on,DT);}
    const before=authoritativeDigest(on),observed=D.observe(on,prior),after=authoritativeDigest(on);same(after,before,`shadow mutation at tick ${tick}`);prior=observed.nextPriorShadowDecision;
    const offDigest=authoritativeDigest(off),onDigest=authoritativeDigest(on);same(onDigest,offDigest,`Shadow ON/OFF diverged at tick ${tick}`);rows.push({tick,offDigest,onDigest,identical:true});
  }
  Object.assign(q14,{repeatedIdenticalInputDeterministic:true,checkedEndpoints:rows.length,allAuthoritativeAndRngDigestsIdentical:true,endpointDigest:rows.at(-1).onDigest});return q14;
});

let performanceObservation;
check('PERFORMANCE','BOUNDED_DIAGNOSTIC_OBSERVATION',()=>{
  const m=create('CURRENT','NATURAL','V57-D1-PERF'),iterations=1500,start=performance.now();let prior=null,totalBytes=0;
  for(let i=0;i<iterations;i++){const out=D.observe(m,prior);prior=out.nextPriorShadowDecision;totalBytes+=JSON.stringify(out.decision).length;}
  const elapsedMs=performance.now()-start;performanceObservation={status:'OBSERVED_NO_PASS_QUOTA',iterations,elapsedMs:Number(elapsedMs.toFixed(3)),meanMs:Number((elapsedMs/iterations).toFixed(6)),meanDecisionBytes:Number((totalBytes/iterations).toFixed(1)),scope:'Node diagnostic micro-observation on an unchanged current state; no gameplay budget or universal threshold asserted.'};return performanceObservation;
});

const failed=checks.filter(x=>x.status!=='PASS');
const evidence={
  schemaVersion:'V57_D1_OFFBALL_SHADOW_EVIDENCE_1',verdict:failed.length?'FAIL':'PASS',implementation:'D1_PURE_SHADOW_OBSERVATION',baseCommit:BASE,
  declarations:{GAMEPLAY_CHANGED:'NO',LEGACY_AUTHORITY:'A_B_C_ONLY',D_SHADOW_STARTED:'YES',D_SHADOW_DRIVES_MOVEMENT:'NO',D2_STARTED:'NO',USER_VISUAL_PROVEN:'UNCHANGED'},
  d0Lineage:{architectureReviewVerdict:'REFINE',acceptedD0Base:'#1715',attempt1723:'HISTORICAL_INTENT_ONLY_NOT_IMPLEMENTATION_DONOR',manifestSchema:manifest.schemaVersion,manifestCases:manifest.caseMapping.length,sourceHashes},
  shadowSchema:{snapshot:'V57_D1_IMMUTABLE_SNAPSHOT_1',danger:'V57_D1_CURRENT_DANGER_1',teamDraft:'V57_D1_TEAM_DRAFT_1',decision:'V57_D1_SHADOW_DECISION_1',authority:'SHADOW_OBSERVATION_ONLY',historyLocation:'caller-owned priorShadowDecision argument/return only; never attached to Match',duties:[...D.DUTIES].sort(),transferStates:[...D.TRANSFER_STATES].sort(),numericBands:'D1 observable QA/decision calibration, not universal football truth'},
  validation:{Q01:checks.filter(x=>x.group==='Q01'),Q02:checks.filter(x=>x.group==='Q02'),Q03:checks.filter(x=>x.group==='Q03'),Q04:checks.filter(x=>x.group==='Q04'),Q05:checks.filter(x=>x.group==='Q05'),Q14:checks.filter(x=>x.group==='Q14'),allChecks:checks,nodeExecution:failed.length?'FAIL':'PASS',protagonistActionsInvoked:false,futureOutcomeScripted:false,liveMutatingTacticalHelpersCalled:false},
  purity:{caseDigests:q01Rows,q14},determinism:{snapshotId:q02SnapshotId,enumerationIndependent:true,repeatedInput:q14.repeatedIdenticalInputDeterministic},falseAcquisition:q03,case13Results:caseResults,positiveControls,performanceObservation,
  risks:['D1 is a decision-model shadow and is not wired into continuous_match_core; it cannot improve visible gameplay.','Calibration bands require later shadow trace evidence before any D2 proposal; they are not football-wide constants.','Attack-side intent is deliberately relationship-level and does not reproduce every Legacy attack formula.','A reported visual path can remain SHADOW_WATCH when the mapped current-state fixture does not reproduce its exact temporal transition.'],
  observabilityGaps:['D1 has no runtime call site, so ordinary matches do not yet emit Shadow decisions without the QA/diagnostic caller.','D0 traces do not expose every sub-tick proposal writer; D1 compares only the bounded current snapshot it receives.','The case-2 restart fixture exercises FREE_KICK SETUP current schema, not the reported video sequence or a future kick outcome.','No user visual retest has occurred; USER_VISUAL_PROVEN remains UNCHANGED.'],
  noDeployment:true,noD2:true
};
fs.writeFileSync(OUT,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({verdict:evidence.verdict,checks:checks.length,caseStatuses:Object.fromEntries(caseResults.map(x=>[x.caseId,x.status])),q14,performanceObservation,evidence:path.relative(ROOT,OUT)},null,2));
if(failed.length)process.exitCode=1;
