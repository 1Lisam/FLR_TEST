'use strict';
const assert=require('assert');
const R=require('../runtime/restart_movement.js');
global.FLRPG_RESTART_MOVEMENT=R;
require('../runtime/free_kick_templates.js');
require('../runtime/free_kick_wall_model.js');
require('../runtime/corner_templates.js');
require('../runtime/v37_set_piece_liveliness_patch.js');
const E=require('../runtime/continuous_match_core.js');
const DT=.05,MARKS=[.40,.80,1.20,2.00],MOTION_IDS=new Set(['DEEP_DIRECT','DEEP_INDIRECT','CORNER_TOP','CORNER_BOTTOM']);
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const pointDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const positions=m=>Object.fromEntries(m.players.map(p=>[p.id,{x:p.x,y:p.y,team:p.team,role:p.role}]));
const movedFrom=(m,at,minimum=.001)=>m.players.filter(p=>pointDistance(p,at[p.id])>=minimum);
const centralOutfieldCount=m=>m.players.filter(p=>p.role!=='GK'&&p.x>=43.5&&p.x<=61.5&&p.y>=25&&p.y<=43).length;
function checkSafety(m){
  assert(!(m.events||[]).some(e=>e.type==='USER_CHOICE'),'no USER_CHOICE');
  assert(!(m.userChoiceLog||[]).length,'no unchosen hero action');
  const text=JSON.stringify({restart:m.restart,setPieceLive:m.setPieceLive,events:m.events,userChoiceLog:m.userChoiceLog});
  assert(!/(futureOutcome|winner|result)/i.test(text),'no future outcome fields');
}
function runScenario(spec){
  const m=E.createMatch(spec.seed),bridge=E.choiceActionBridge(),point=world('AWAY',spec.x,spec.y);
  m.time=30;m.protagonistControllerId='NO_USER_CHOICE';
  bridge.startDeadRestart(m,spec.kind,'AWAY',point.x,point.y,null,spec.metadata);
  let kick=null,kickPositions=null,kickerId=null,maxJump=0,liveElapsed=0,releaseAt=null,releaseMode=null;
  const restartRelocations=[];
  const samples={},setHold=[],runUp=[],stalledTicks={};let runUpEntries=0,maxActivePauseTicks=0;
  for(let i=0;i<620;i++){
    const hadKick=!!kick;
    const before=positions(m);
    const beforeRestart=m.restart;
    const beforeStage=m.restart?.stage||null;
    E.step(m,DT);
    if(spec.kind==='CORNER'&&!hadKick){
      const stage=m.restart?.stage||((m.events||[]).some(e=>e.type==='CORNER_KICK')?'CORNER_KICK':null);
      if(stage==='SET_HOLD'){
        const p=m.playersById[m.restart.setup.kickerId];
        assert.equal(p.tacticalTask,'CORNER_SET_WAIT',`${spec.id}: settled kicker does not toggle back to run-up start`);
        assert.equal(p.action,'CORNER_SET_WAIT',`${spec.id}: settled kicker wait action`);
        assert.equal(p.sprint,false,`${spec.id}: settled kicker does not sprint`);
        assert(Math.hypot(p.vx,p.vy)<1e-9,`${spec.id}: settled kicker residual velocity cleared`);
        setHold.push({t:Number(m.time.toFixed(2)),x:Number(p.x.toFixed(4)),y:Number(p.y.toFixed(4)),tx:Number(p.tx.toFixed(4)),ty:Number(p.ty.toFixed(4))});
      }
      if(stage==='RUN_UP'&&beforeStage!=='RUN_UP')runUpEntries++;
      if(stage==='RUN_UP'||(stage==='CORNER_KICK'&&beforeStage==='RUN_UP')){
        const id=m.restart?.setup?.kickerId||kickerId||m.events.find(e=>e.type==='CORNER_KICK')?.restartGeometry?.setupKickerId;
        const p=m.playersById[id];assert(p,`${spec.id}: run-up kicker`);
        runUp.push({t:Number(m.time.toFixed(2)),stage,x:Number(p.x.toFixed(4)),y:Number(p.y.toFixed(4)),vx:Number(p.vx.toFixed(4)),vy:Number(p.vy.toFixed(4)),tx:Number(p.tx.toFixed(4)),ty:Number(p.ty.toFixed(4)),distance:Number(pointDistance(p,point).toFixed(4)),task:p.tacticalTask});
      }
    }
    if(hadKick&&m.restart&&!beforeRestart){
      const id=m.restart.setup?.kickerId,target=m.restart.setup?.targets?.[id],thrower=m.playersById[id];
      if(m.restart.kind==='THROW_IN'){
        assert(id&&target&&thrower,`${spec.id}: new throw-in identifies its thrower and setup target`);
        assert.equal(thrower.tacticalTask,'THROW_IN_THROWER',`${spec.id}: new throw-in assigns its thrower`);
        assert(pointDistance(thrower,target)<1e-8,`${spec.id}: thrower is placed at the current setup target`);
        restartRelocations.push({kind:m.restart.kind,playerId:id,distance:pointDistance(before[id],thrower)});
      }
    }
    // The corner's movement bound ends when a new dead-ball setup begins.
    if(hadKick&&!m.restart)for(const p of m.players)maxJump=Math.max(maxJump,pointDistance(before[p.id],p));
    if(hadKick)liveElapsed=Number((liveElapsed+DT).toFixed(2));
    if(!kick){
      kick=(m.events||[]).find(e=>e.type===spec.event);
      if(kick){
        kickPositions=positions(m);kickerId=kick.restartGeometry?.setupKickerId||null;
        assert(kickerId,`${spec.id}: kick geometry identifies kicker`);
      }
    }
    if(!kick)continue;
    if(hadKick&&['ATTACK_DIRECT','ATTACK_INDIRECT','CORNER_TOP','CORNER_BOTTOM'].includes(spec.id)&&liveElapsed<=1.20&&!m.restart&&m.phase!=='FULL_TIME')for(const p of m.players){
      if(p.role==='GK')continue;
      const target=p.finalMovementIntent?.targetPoint||{x:p.tx,y:p.ty};
      const duty=m._defensiveResponsibility?.[p.team]?.records?.[p.id];
      const dutyTarget=duty?.targetId&&m.playersById[duty.targetId];
      const active=pointDistance(p,target)>.50||(['MARK','PRESS'].includes(duty?.type)&&dutyTarget&&pointDistance(p,dutyTarget)>4.0);
      const stalled=active&&pointDistance(p,before[p.id])<.012&&Math.hypot(p.vx,p.vy)<.30;
      stalledTicks[p.id]=stalled?(stalledTicks[p.id]||0)+1:0;
      maxActivePauseTicks=Math.max(maxActivePauseTicks,stalledTicks[p.id]);
      assert(stalledTicks[p.id]<4,`${spec.id}: ${p.id} active ${p.tacticalTask} responsibility stationary for ${stalledTicks[p.id]*DT}s`);
    }
    for(const mark of MARKS)if(!samples[mark]&&liveElapsed>=mark)samples[mark]={positions:positions(m),moved:movedFrom(m,kickPositions),moved20:movedFrom(m,kickPositions,.20),centralOutfield:centralOutfieldCount(m)};
    if(releaseAt===null){
      if(m.phase==='OPEN_PLAY'&&!m.setPieceLive){releaseAt=liveElapsed;releaseMode='OPEN_PLAY';}
      else if(m.restart){releaseAt=liveElapsed;releaseMode=`NEXT_RESTART:${m.restart.kind}`;}
    }
    if(releaseAt!==null&&samples[2])break;
  }
  assert(kick,`${spec.id}: ${spec.event} occurs naturally`);
  for(const mark of MARKS)assert(samples[mark],`${spec.id}: +${mark.toFixed(2)}s sample`);
  assert(releaseAt!==null,`${spec.id}: reaches OPEN_PLAY or a current next restart`);
  const openLimit=spec.kind==='CORNER'?6:3;
  assert(releaseAt<openLimit,`${spec.id}: live release ${releaseAt.toFixed(2)}s`);
  assert(maxJump<=.80+1e-8,`${spec.id}: single-tick actual jump ${maxJump.toFixed(3)}m`);
  for(const move of restartRelocations)assert(move.distance<=.80+1e-8,
    `${spec.id}: ${move.kind} setup relocates ${move.playerId} ${move.distance.toFixed(3)}m in one tick`);
  const at120=samples[1.2];
  assert(at120.moved.length>0,`${spec.id}: all 22 remain at kick coordinates at +1.20s`);
  if(MOTION_IDS.has(spec.id)){
    const outfieldMoved=at120.moved20.filter(p=>p.role!=='GK');
    assert(outfieldMoved.length>=4,`${spec.id}: meaningful outfield reaction (${outfieldMoved.length}/4)`);
    for(const team of ['HOME','AWAY'])assert(at120.moved20.some(p=>p.team===team),`${spec.id}: ${team} reacts to current state`);
    for(const mark of [1.2,2])assert(samples[mark].centralOutfield<8,`${spec.id}: central 18x18 blob at +${mark.toFixed(2)}s (${samples[mark].centralOutfield})`);
  }
  if(spec.kind==='CORNER'){
    assert(setHold.length>1,`${spec.id}: reaches SET_HOLD under browser runtime stack`);
    const holdStart=setHold[0];
    assert(holdStart.x<.8||holdStart.x>104.2||holdStart.y<.8||holdStart.y>67.2,`${spec.id}: SET_HOLD retains the v37 outside-field reached position`);
    for(const q of setHold){
      assert(pointDistance(q,holdStart)<.0002,`${spec.id}: SET_HOLD kicker remains stationary without a field-bound snap`);
      assert(pointDistance({x:q.tx,y:q.ty},holdStart)<.0002,`${spec.id}: SET_HOLD target remains the reached hold point`);
    }
    assert.equal(runUpEntries,1,`${spec.id}: exactly one RUN_UP entry`);
    assert(runUp.length>2&&runUp.at(-1).stage==='CORNER_KICK',`${spec.id}: continuous run-up through contact`);
    let nearZeroRun=0;
    for(let i=0;i<runUp.length;i++){
      const q=runUp[i],previous=runUp[i-1];
      if(q.stage==='RUN_UP'){
        assert.equal(q.task,'CORNER_RUN_UP',`${spec.id}: no run-up task regression`);
        assert(pointDistance({x:q.tx,y:q.ty},point)<.0002,`${spec.id}: run-up target stays on the stationary ball`);
      }
      if(!previous)continue;
      const step=pointDistance(q,previous);
      assert(step<=.80+1e-8,`${spec.id}: no run-up teleport (${step.toFixed(3)}m)`);
      assert(q.distance<=previous.distance+.005,`${spec.id}: no material backward run-up step`);
      nearZeroRun=q.stage==='RUN_UP'&&q.distance>.18&&step<.008?nearZeroRun+1:0;
      assert(nearZeroRun<2,`${spec.id}: repeated pre-contact stop-start`);
    }
    const kicker=m.playersById[kickerId],corner={x:point.x,y:point.y};
    const atTwo=samples[2].positions[kickerId];
    assert(pointDistance(atTwo,corner)>=.20,`${spec.id}: corner kicker remains at the corner point`);
    assert(kicker,`${spec.id}: kicker remains available`);
  }
  checkSafety(m);
  return{
    id:spec.id,kickAt:Number(kick.t.toFixed(2)),liveToRelease:releaseAt,releaseMode,maxJump:Number(maxJump.toFixed(3)),restartRelocations,maxActivePauseSeconds:Number((maxActivePauseTicks*DT).toFixed(2)),
    ...(spec.kind==='CORNER'?{runUp}:{}),
    movedPlayers:Object.fromEntries(MARKS.map(mark=>[mark.toFixed(2),samples[mark].moved.length])),
    movedAt120ByTeam:Object.fromEntries(['HOME','AWAY'].map(team=>[team,at120.moved20.filter(p=>p.team===team).length])),
    centralOutfield:{'1.20':samples[1.2].centralOutfield,'2.00':samples[2].centralOutfield}
  };
}
const scenarios=[
  {id:'DEEP_DIRECT',seed:'V60-DEEP_DIRECT',kind:'FREE_KICK',x:52,y:14,metadata:{freeKickType:'DIRECT'},event:'FREE_KICK_TAKEN'},
  {id:'DEEP_INDIRECT',seed:'V60-DEEP_INDIRECT',kind:'FREE_KICK',x:52,y:54,metadata:{freeKickType:'INDIRECT'},event:'FREE_KICK_TAKEN'},
  {id:'ATTACK_DIRECT',seed:'V60-ATTACK_DIRECT',kind:'FREE_KICK',x:88,y:34,metadata:{freeKickType:'DIRECT'},event:'FREE_KICK_TAKEN'},
  {id:'ATTACK_INDIRECT',seed:'V60-ATTACK_INDIRECT',kind:'FREE_KICK',x:88,y:34,metadata:{freeKickType:'INDIRECT'},event:'FREE_KICK_TAKEN'},
  {id:'CORNER_TOP',seed:'V60-CORNER_TOP',kind:'CORNER',x:104,y:1.2,metadata:{cornerType:'DELIVERED'},event:'CORNER_KICK'},
  {id:'CORNER_BOTTOM',seed:'V60-CORNER_BOTTOM',kind:'CORNER',x:104,y:66.8,metadata:{cornerType:'DELIVERED'},event:'CORNER_KICK'}
];
const first=scenarios.map(runScenario),second=scenarios.map(runScenario);
assert.deepEqual(second,first,'same seed deterministic live-movement signature');
const topRun=first.find(s=>s.id==='CORNER_TOP').runUp,bottomRun=first.find(s=>s.id==='CORNER_BOTTOM').runUp;
assert(Math.abs(topRun.length-bottomRun.length)<=1,`mirrored corners differ by at most one run-up tick (${topRun.length} vs ${bottomRun.length})`);
const overlappingRunTicks=Math.min(topRun.length,bottomRun.length);
for(let i=0;i<overlappingRunTicks;i++){
  const topStage=topRun[i].stage,bottomStage=bottomRun[i].stage;
  const terminalBoundaryMismatch=i===overlappingRunTicks-1&&topRun.length!==bottomRun.length&&
    new Set([topStage,bottomStage]).size===2&&[topStage,bottomStage].includes('RUN_UP')&&[topStage,bottomStage].includes('CORNER_KICK');
  assert(topStage===bottomStage||terminalBoundaryMismatch,`mirrored corners share stage at tick ${i}`);
  assert(Math.abs(topRun[i].distance-bottomRun[i].distance)<=.11,`mirrored corners share approach distance within 0.11m at tick ${i}`);
}
console.log(JSON.stringify({verdict:'PASS_V60_SET_PIECE_LIVE_MOVEMENT',scenarios:first,futureOutcomePrecomputed:false,unchosenHeroAction:false}));
