#!/usr/bin/env node
'use strict';

const assert=require('assert');
const R=require('../runtime/restart_movement.js');
global.FLRPG_RESTART_MOVEMENT=R;
require('../runtime/free_kick_templates.js');
require('../runtime/free_kick_wall_model.js');
require('../runtime/corner_templates.js');
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');

const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const local=world;
const other=team=>team==='HOME'?'AWAY':'HOME';
const lanes={LB:9,LCB:27,RCB:41,RB:59,LCM:21,CM:34,RCM:47,LW:9,ST:34,RW:59};
const point=(p,team)=>local(team,p.tx,p.ty);

function kickedStrongWall(attack){
  const defence=other(attack),m=E.createMatch(`V62-STRONG-WALL-${attack}`),kick=world(attack,88,34);
  m.time=30;m.protagonistControllerId='NO_USER_CHOICE';
  E.choiceActionBridge().startDeadRestart(m,'FREE_KICK',attack,kick.x,kick.y,null,{freeKickType:'DIRECT'});
  for(let tick=0;tick<600&&!m.setPieceWallRecovery;tick++)E.step(m,.05);
  const rec=m.setPieceWallRecovery;
  assert(rec,`${attack}: actual direct kick creates recovery state`);
  assert.equal(rec.team,defence);
  assert(Math.abs(rec.until-rec.startedAt-2.6)<1e-8);
  assert((m.events||[]).some(e=>e.type==='FREE_KICK_TAKEN'),`${attack}: real restart contact`);
  for(const slot of ['LB','RB'])assert(rec.wallIds.includes(`${defence[0]}-${slot}`),`${attack}: ${slot} is a strong-wall member`);
  return{m,attack,defence,rec};
}

function isolateCurrentHandoff(f){
  const {m,attack,defence,rec}=f;
  // Keep the actual wall bodies from the kick. Move opposing receivers out of the
  // defensive danger band so the test isolates a zone handoff from a live mark.
  for(const p of m.players.filter(p=>p.team===attack&&p.role!=='GK')){
    const w=world(defence,82,lanes[p.slot]);Object.assign(p,{x:w.x,y:w.y,tx:w.x,ty:w.y,vx:0,vy:0});
  }
  m.restart=null;m.setPieceLive=null;m.phase='OPEN_PLAY';m.possession=attack;
  m.time=rec.startedAt+.5;
  return f;
}

function setBall(f,mode,x,y,ownerId=null){
  const {m,attack,defence}=f,w=world(defence,x,y);
  m.ball={...m.ball,mode,ownerId,x:w.x,y:w.y,lastTouchTeam:attack,lastTouchPlayer:null};
}

function assertOwnSide(f,label,allowPrimary=false){
  const {m,defence}=f,lb=m.playersById[`${defence[0]}-LB`],rb=m.playersById[`${defence[0]}-RB`];
  const primary=m.looseBallArbitration?.teams?.[defence]?.primaryId;
  for(const [p,limit,side] of [[lb,22,'LB'],[rb,46,'RB']]){
    if(allowPrimary&&p.id===primary){assert.equal(p.tacticalTask,'CHASE_LOOSE',`${label}: ${side} selected responder keeps chase`);assert.equal(m._defensiveResponsibility?.[defence]?.records?.[p.id]?.reason,'PRIMARY_LOOSE_BALL_CHASE');continue;}
    const y=point(p,defence).y;
    assert(side==='LB'?y<=limit:y>=limit,`${label}: ${side} target ${y.toFixed(2)} remains outside CB band`);
    assert.equal(p.tacticalTask,'FREE_KICK_WALL_RECOVERY',`${label}: ${side} has current wall-to-role handoff`);
    const r=m._defensiveResponsibility?.[defence]?.records?.[p.id];
    assert.equal(r?.type,'RECOVERY',`${label}: ${side} semantic owner is recovery`);
    assert.equal(r?.targetId,null,`${label}: ${side} has no retained mark`);
    assert.equal(r?.reason,'FREE_KICK_WALL_ROLE_RECOVERY',`${label}: ${side} role recovery reason`);
    assert.equal(p.responsibilityRewriteReason,'FREE_KICK_WALL_CURRENT_ROLE_ANCHOR');
    assert(Math.hypot(p.tx-r.motion.actualTarget.x,p.ty-r.motion.actualTarget.y)<1e-8,`${label}: record and executable target agree`);
  }
  if(primary!==lb.id&&primary!==rb.id)assert(point(lb,defence).y<point(rb,defence).y,`${label}: LB/RB own-team lane order`);
}

const rows=[];
for(const attack of ['HOME','AWAY']){
  // Follow the real kick through its live flight and eventual causal release.
  // The +0.5s checkpoint may still be SET_PIECE_LIVE while the CROSS is airborne.
  const live=kickedStrongWall(attack),seen=new Set();
  E.step(live.m,0);
  assert(['SET_PIECE_LIVE','OPEN_PLAY'].includes(live.m.phase),`${attack}: first real post-kick tactical assignment`);
  assertOwnSide(live,`${attack} first live assignment`);
  const kickEpisode=live.m.setPieceLive;
  assert(kickEpisode&&kickEpisode.kind==='FREE_KICK',`${attack}: actual kick begins a live free-kick episode`);
  let release=null;
  const first=live.m._defensiveResponsibility[live.defence];
  for(const t of first.threats.filter(t=>t.material&&t.kind==='CENTRAL_RUNNER')){
    assert(!t.owners.some(id=>id===`${live.defence[0]}-LB`||id===`${live.defence[0]}-RB`),`${attack}: central runner cannot take wall FB`);
    assert(t.owners.length<=1,`${attack}: one explicit central owner`);
    assert(!t.owners.includes(first.coverOwnerId),`${attack}: cover body is not a second marker`);
  }
  for(let tick=0;tick<50&&seen.size<3;tick++){
    E.step(live.m,.05);
    if(!release&&live.m.setPieceLive!==kickEpisode)release={at:live.m.time,reason:kickEpisode.firstOutcome,phase:live.m.phase};
    for(const offset of [.5,1,2]){
      if(seen.has(offset)||live.m.time+1e-7<live.rec.startedAt+offset)continue;
      if(live.m.restart){
        assert.equal(live.m.ball.mode,'DEAD',`${attack} +${offset}: new restart follows a dead ball`);
        rows.push({attack,phase:'NEXT_RESTART',offset,kind:live.m.restart.kind});seen.add(offset);
        continue;
      }
      assert(['SET_PIECE_LIVE','OPEN_PLAY'].includes(live.m.phase),`${attack} +${offset}: real kick remains in a live phase`);
      if(live.m.phase==='SET_PIECE_LIVE'){
        assert.equal(live.m.setPieceLive,kickEpisode,`${attack} +${offset}: live direct kick retains its episode`);
        assert.equal(live.m.ball.mode,'FLIGHT',`${attack} +${offset}: unreleased live kick is still in flight`);
      }else assert(release,`${attack} +${offset}: open play follows a causal live release`);
      const lb=live.m.playersById[`${live.defence[0]}-LB`],rb=live.m.playersById[`${live.defence[0]}-RB`];
      const left=point(lb,live.defence).y,right=point(rb,live.defence).y;
      assert(left<=22&&right>=46&&left<right,`${attack} +${offset}: live targets stay outside the CB band (${left.toFixed(2)}, ${right.toFixed(2)})`);
      for(const p of [lb,rb]){
        const r=live.m._defensiveResponsibility?.[live.defence]?.records?.[p.id];
        assert(!(r?.type==='PRESS'&&!r.targetId),`${attack} +${offset}: no empty-target wall press`);
        if(r?.reason==='FREE_KICK_WALL_ROLE_RECOVERY'&&live.m._defensiveResponsibility?.[live.defence]?.at===live.m.time)assert(Math.hypot(p.tx-r.motion.actualTarget.x,p.ty-r.motion.actualTarget.y)<1e-8,`${attack} +${offset}: current-tick responsibility and final target agree`);
      }
      rows.push({attack,phase:live.m.phase,offset,lbY:left,rbY:right});seen.add(offset);
    }
  }
  assert.equal(seen.size,3,`${attack}: all #2057 phase checkpoints sampled`);
  while(!release&&live.m.time<kickEpisode.maxUntil+.05){
    E.step(live.m,.05);
    if(live.m.setPieceLive!==kickEpisode)release={at:live.m.time,reason:kickEpisode.firstOutcome,phase:live.m.phase};
  }
  // A dead-ball restart may compress the clock forward, so its recorded match
  // time need not fit the original live window even though release was causal.
  assert(release&&(release.reason==='NEXT_RESTART'||release.at<=kickEpisode.maxUntil+.05),
    `${attack}: direct-kick episode has a bounded causal release ${JSON.stringify({time:live.m.time,maxUntil:kickEpisode.maxUntil,phase:live.m.phase,restart:live.m.restart?.kind,ball:live.m.ball.mode,reason:kickEpisode.firstOutcome})}`);
  assert(['FIRST_CONTROL','FIRST_LOOSE_BALL','DEAD_BALL','NEXT_RESTART','MAX_WINDOW'].includes(release.reason),
    `${attack}: release records its actual ball or restart cause (${release.reason})`);
  rows.push({attack,phase:'ORIGINAL_KICK_RELEASE',...release});

  // A stale press lock, empty target and prior touch do not become a carrier.
  const stale=isolateCurrentHandoff(kickedStrongWall(attack));
  stale.m.time=stale.rec.startedAt+.5;
  setBall(stale,'LOOSE',35,34);
  stale.m.ball.lastTouchPlayer=`${attack[0]}-CM`;
  stale.m._defenceRoleLocks={[stale.defence]:{pressId:`${stale.defence[0]}-RB`,coverId:`${stale.defence[0]}-LB`,until:stale.rec.until}};
  T.assign(stale.m);
  assertOwnSide(stale,`${attack} stale lock and last touch`);
  assert(!['LB','RB'].some(slot=>stale.m._defensiveResponsibility[stale.defence].primaryPressureOwnerId===`${stale.defence[0]}-${slot}`));

  // A central carrier can be physically close to a wall body. Selection must
  // hand its current duty to an eligible centre-back or midfielder this tick.
  const central=isolateCurrentHandoff(kickedStrongWall(attack));
  const cm=central.m.playersById[`${attack[0]}-CM`],cw=world(central.defence,20,34);
  Object.assign(cm,{x:cw.x,y:cw.y,vx:0,vy:0});
  central.m.time=central.rec.startedAt+.5;central.m.possession=attack;
  setBall(central,'CONTROLLED',20,34,cm.id);T.assign(central.m);
  const centralState=central.m._defensiveResponsibility[central.defence];
  for(const slot of ['LB','RB']){
    const p=central.m.playersById[`${central.defence[0]}-${slot}`],r=centralState.records[p.id];
    assert.equal(r.reason,'FREE_KICK_WALL_ROLE_RECOVERY',`${attack}: central carrier cannot commandeer ${slot}`);
    assert.equal(p.markTargetId,null,`${attack}: no stale central mark on ${slot}`);
  }
  const centralThreat=centralState.threats.find(t=>t.id===cm.id);
  assert.equal(centralThreat.owners.length,1,`${attack}: eligible body takes central carrier`);
  assert(['CB','CM'].includes(central.m.playersById[centralThreat.owners[0]].role),`${attack}: central handoff stays with CB/CM`);
  assert(!centralThreat.owners.includes(centralState.coverOwnerId),`${attack}: cover is not a second mark`);

  const locked=isolateCurrentHandoff(kickedStrongWall(attack)),lockedCm=locked.m.playersById[`${attack[0]}-CM`],lockedLb=locked.m.playersById[`${locked.defence[0]}-LB`],lockedPos=world(locked.defence,20,34);
  Object.assign(lockedCm,{x:lockedPos.x,y:lockedPos.y});locked.m.time=locked.rec.startedAt+.5;
  locked.m.offBallPolicy='LOCKED_MARK';locked.m._lastTacticalPossession=attack;
  locked.m._defensiveResponsibility={[locked.defence]:{threats:[{id:lockedCm.id,owners:[lockedLb.id]}],records:{[lockedLb.id]:{ownerId:lockedLb.id,type:'MARK',targetId:lockedCm.id,assignmentAt:locked.m.time-.1,holdUntil:locked.rec.until}}}};
  lockedLb.markTargetId=lockedCm.id;setBall(locked,'CONTROLLED',20,34,lockedCm.id);T.assign(locked.m);
  assert.equal(locked.m._defensiveResponsibility[locked.defence].records[lockedLb.id].reason,'FREE_KICK_WALL_ROLE_RECOVERY',`${attack}: prior locked central mark yields`);
  assert.equal(lockedLb.markTargetId,null,`${attack}: stale explicit mark cleared`);

  const distant=isolateCurrentHandoff(kickedStrongWall(attack)),distantRunner=distant.m.playersById[`${attack[0]}-RW`],distantCm=distant.m.playersById[`${attack[0]}-CM`];
  const dw=world(distant.defence,48,10),dm=world(distant.defence,35,34);
  Object.assign(distantRunner,{x:dw.x,y:dw.y});Object.assign(distantCm,{x:dm.x,y:dm.y});
  distant.m.time=distant.rec.startedAt+.5;setBall(distant,'CONTROLLED',35,34,distantCm.id);T.assign(distant.m);
  assert.equal(distant.m._defensiveResponsibility[distant.defence].records[`${distant.defence[0]}-LB`].reason,'FREE_KICK_WALL_ROLE_RECOVERY',`${attack}: distant material winger does not cancel recovery`);

  for(const slot of ['LB','RB']){
    const runnerId=`${attack[0]}-${slot==='LB'?'RW':'LW'}`;
    for(const [label,x,expected] of [['near',33,true],['outside',39,false]]){
      const wide=isolateCurrentHandoff(kickedStrongWall(attack)),fb=wide.m.playersById[`${wide.defence[0]}-${slot}`],runner=wide.m.playersById[runnerId];
      const y=slot==='LB'?10:58,fw=world(wide.defence,30,slot==='LB'?12:56),rw=world(wide.defence,x,y);
      Object.assign(fb,{x:fw.x,y:fw.y,vx:0,vy:0});
      Object.assign(runner,{x:rw.x,y:rw.y,vx:0,vy:0,controlledSince:wide.rec.startedAt-.5,action:'CARRY_FORWARD'});
      wide.m.time=wide.rec.startedAt+.5;wide.m.possession=attack;
      setBall(wide,'CONTROLLED',x,y,runner.id);T.assign(wide.m);
      const r=wide.m._defensiveResponsibility[wide.defence].records[fb.id];
      if(expected){assert(['PRESS','COVER'].includes(r.type),`${attack} ${slot}: current near carrier may override recovery`);assert.notEqual(fb.tacticalTask,'FREE_KICK_WALL_RECOVERY');
        const gone=world(wide.defence,70,y);Object.assign(runner,{x:gone.x,y:gone.y,vx:0,vy:0});
        wide.m.time+=.05;setBall(wide,'CONTROLLED',35,34,'INVALID_OWNER');T.assign(wide.m);
        assert.equal(wide.m._defensiveResponsibility[wide.defence].records[fb.id].reason,'FREE_KICK_WALL_ROLE_RECOVERY',`${attack} ${slot}: temporary urgent duty resumes recovery`);
      }
      else{assert.equal(r.reason,'FREE_KICK_WALL_ROLE_RECOVERY',`${attack} ${slot}: outside carrier does not override`);assert.equal(fb.tacticalTask,'FREE_KICK_WALL_RECOVERY');}
    }
  }

  const released=isolateCurrentHandoff(kickedStrongWall(attack));
  released.m.time=released.rec.startedAt+.5;setBall(released,'CONTROLLED',35,34,'INVALID_OWNER');T.assign(released.m);
  const releasedFb=released.m.playersById[`${released.defence[0]}-LB`];
  Object.assign(releasedFb,{x:releasedFb.tx,y:releasedFb.ty,vx:0,vy:0});
  released.m.time+=.05;T.assign(released.m);
  assert(released.rec.releasedFullbackIds?.includes(releasedFb.id),`${attack}: physical lane arrival releases this episode`);
  setBall(released,'CONTROLLED',20,34,'INVALID_OWNER');released.m.time+=.05;T.assign(released.m);
  assert.notEqual(released.m._defensiveResponsibility[released.defence].records[releasedFb.id].reason,'FREE_KICK_WALL_ROLE_RECOVERY',`${attack}: released FB does not re-enter when anchor moves`);

  const f=isolateCurrentHandoff(kickedStrongWall(attack)),{m,defence,rec}=f;
  for(const offset of [.5,1,2]){
    m.time=rec.startedAt+offset;setBall(f,'LOOSE',35,34);T.assign(m);
    const primary=m.looseBallArbitration.teams[defence].primaryId;
    assert(!['LB','RB'].some(slot=>primary===`${defence[0]}-${slot}`),`${attack} +${offset}: zone handoff fixture has a separate responder`);
    assertOwnSide(f,`${attack} loose +${offset}`);
    rows.push({attack,phase:'LOOSE',offset,primary,lbY:point(m.playersById[`${defence[0]}-LB`],defence).y,rbY:point(m.playersById[`${defence[0]}-RB`],defence).y});
  }
  // A wall fullback who is actually closest to the loose ball retains authority.
  m.time=rec.startedAt+2.1;m.possession=defence;const lb=m.playersById[`${defence[0]}-LB`],lbPos=local(defence,lb.x,lb.y);
  setBall(f,'LOOSE',lbPos.x,lbPos.y);T.assign(m);
  assert.equal(m.looseBallArbitration.teams[defence].primaryId,lb.id,`${attack}: nearest LB is selected`);
  assertOwnSide(f,`${attack} LB primary`,true);
  assert(Math.hypot(lb.tx-m.ball.x,lb.ty-m.ball.y)<1e-8,`${attack}: chase targets current ball`);

  // Invalid owner is an ownerless controlled tick, not a valid attacking action.
  m.time=rec.startedAt+2.3;m.possession=attack;setBall(f,'CONTROLLED',35,34,'INVALID_OWNER');T.assign(m);
  assertOwnSide(f,`${attack} invalid owner`);
  rows.push({attack,phase:'INVALID_OWNER',lbY:point(lb,defence).y,rbY:point(m.playersById[`${defence[0]}-RB`],defence).y});

  m.time=rec.startedAt+2.45;m.possession=defence;m.protagonistControllerId=lb.id;
  for(const p of m.players)p.hasBall=p.id===lb.id;
  setBall(f,'CONTROLLED',lbPos.x,lbPos.y,lb.id);T.assign(m);
  assert.notEqual(lb.tacticalTask,'FREE_KICK_WALL_RECOVERY',`${attack}: current carrier retains its own authority`);
  assert(!(m.userChoiceLog||[]).length,`${attack}: no unselected protagonist action`);

  m.time=rec.until+.01;m.possession=attack;setBall(f,'LOOSE',35,34);T.assign(m);
  assert.equal(m.setPieceWallRecovery,undefined,`${attack}: recovery expires on tactical tick`);
  for(const slot of ['LB','RB'])assert.notEqual(m.playersById[`${defence[0]}-${slot}`].tacticalTask,'FREE_KICK_WALL_RECOVERY',`${attack}: ${slot} returns to ordinary open play`);
  const after=point(lb,defence).y;
  rows.push({attack,phase:'EXPIRED',lbY:after});

  const stateText=JSON.stringify({wall:rec,responsibility:m._defensiveResponsibility?.[defence],arbitration:m.looseBallArbitration});
  assert(!/"(?:futureOutcome|winner|result)"\s*:/.test(stateText),`${attack}: no outcome or winner precompute`);
  assert(!(m.userChoiceLog||[]).length,`${attack}: no unchosen protagonist action`);
}

// Once the handoff is absent, the established contain-before-beaten guard still
// reacts to a current wide carrier on both defending sides.
for(const defence of ['HOME','AWAY']){
  const attack=other(defence),m=E.createMatch(`V62-CONTAIN-${defence}`),fb=m.playersById[`${defence[0]}-RB`],carrier=m.playersById[`${attack[0]}-LW`];
  const place=(p,x,y)=>{const w=world(defence,x,y);Object.assign(p,{x:w.x,y:w.y,tx:w.x,ty:w.y});};
  m.time=70;m.restart=null;m.phase='OPEN_PLAY';m.possession=attack;
  place(fb,51.41,62.05);place(carrier,53,59);carrier.controlledSince=68;carrier.action='CARRY_FORWARD';
  fb.action=fb.tacticalTask='HOLD_BLOCK';m.ball={...m.ball,mode:'CONTROLLED',ownerId:carrier.id,x:carrier.x,y:carrier.y};
  m._defensiveResponsibility={[defence]:{records:{[fb.id]:{type:'ZONE',targetId:null}}}};
  assert.equal(T.enforceFullbackWideContainBeforeBeaten(m,defence,carrier).length,1,`${defence}: wide contain remains active`);
  assert.equal(fb.tacticalTask,'FB_WIDE_CONTAIN_BEFORE_BEATEN');
  assert(point(fb,defence).x<=49.81,`${defence}: contain target remains goal-side of current winger`);
}

console.log(JSON.stringify({verdict:'PASS_V62_SET_PIECE_OPEN_PLAY_FB_HANDOFF',rows,futureOutcomePrecomputed:false,protagonistControlChanged:false}));
