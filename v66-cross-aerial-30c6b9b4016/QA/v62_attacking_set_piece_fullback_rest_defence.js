#!/usr/bin/env node
'use strict';

// Real acceptance: normal attributes/managers, startDeadRestart and .05s motor
// steps. Companion regressions: v62_fullback_central_midfield_chase.js and
// v62_set_piece_fullback_zone_authority.js (includes exact-choice/RNG checks).
// No bodies or post-kick destinations are injected into these runs.
const assert=require('assert'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const R=require('../runtime/restart_movement');global.FLRPG_RESTART_MOVEMENT=R;
for(const name of ['free_kick_templates','free_kick_wall_model','corner_templates','v37_set_piece_liveliness_patch'])require(`../runtime/${name}`);
const E=require('../runtime/continuous_match_core'),A=require('../runtime/attribute_match_adapter'),M=require('../runtime/manager_tendency_adapter'),T=require('../runtime/tactical_movement');
const DT=.05,EPS=1e-6,other=t=>t==='HOME'?'AWAY':'HOME';
const local=(t,p)=>t==='HOME'?{x:p.x,y:p.y}:{x:105-p.x,y:68-p.y};
const target=(t,p)=>local(t,{x:p.tx,y:p.ty}),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const get=(m,t,slot)=>m.players.find(p=>p.team===t&&p.slot===slot),clone=x=>JSON.parse(JSON.stringify(x));
function init(seed){
  const m=E.createMatch(seed);for(const p of m.players)A.assign(m,p.id,A.baseProfile(60));
  M.init(m,{HOME:'BALANCED',AWAY:'BALANCED'});m.offBallPolicy='CURRENT';m.time=30;m.protagonistControllerId='NO_USER_CHOICE';return m;
}
const specs=[
  {id:'NO_WALL_INDIRECT',kind:'FREE_KICK',x:35,y:54,metadata:{freeKickType:'INDIRECT'},event:'FREE_KICK_TAKEN'},
  {id:'CORNER_TOP',kind:'CORNER',x:0,y:0,metadata:{cornerType:'DELIVERED'},event:'CORNER_KICK'},
  {id:'CORNER_BOTTOM',kind:'CORNER',x:0,y:68,metadata:{cornerType:'DELIVERED'},event:'CORNER_KICK'},
  {id:'STRONG_WALL_DIRECT',kind:'FREE_KICK',x:17,y:34,metadata:{freeKickType:'DIRECT'},event:'FREE_KICK_TAKEN'},
  {id:'SHORT_OPTION',kind:'CORNER',x:0,y:0,metadata:{cornerType:'SHORT'},event:'CORNER_KICK'}
];
const high=/^(EDGE_|SECOND_BALL_|SECOND_WAVE_|FIRST_WAVE_|TARGET_)/;
function allocation(m,s,plan,team,label){
  assert(!/"(?:futureOutcome|winner|result)"\s*:/.test(JSON.stringify({plan,rest:m.attackingSetPieceRestDefence})),`${label}: no precomputed outcome fields`);
  for(const p of m.players.filter(p=>p.team===team&&['FB','CB'].includes(p.role))){
    const role=plan.roles[p.id];assert(!high.test(role),`${label}: ${p.id} generic high filler ${role}`);
    assert(role==='KICKER'||role==='SHORT_OPTION'||/^REST_DEFENCE/.test(role),`${label}: real rest allocation`);
    const q=s.targets[p.id];assert(q&&Number.isFinite(q.x)&&Number.isFinite(q.y),`${label}: executable target`);
  }
  const backs=m.players.filter(p=>p.team===team&&p.role==='CB'&&/^REST_DEFENCE/.test(plan.roles[p.id]));
  const mids=m.players.filter(p=>p.team===team&&/^(EDGE_|SECOND_BALL_|SECOND_WAVE_)/.test(plan.roles[p.id]));
  assert(backs.length>=1&&mids.length>=1,`${label}: CB spine and second-ball midfield`);
  for(const fb of m.players.filter(p=>p.team===team&&p.role==='FB'&&/^REST_DEFENCE/.test(plan.roles[p.id]))){
    const q=local(team,s.targets[fb.id]),cb=get(m,team,fb.slot==='LB'?'LCB':'RCB'),c=local(team,s.targets[cb.id]),sg=fb.slot==='LB'?-1:1;
    assert(sg*(q.y-c.y)>=5,`${label}: FB outside same-side CB`);
    assert(q.x<=c.x+4.8+EPS,`${label}: connected CB depth`);
    assert(mids.every(p=>q.x<=local(team,s.targets[p.id]).x-8+EPS),`${label}: shell behind midfield`);
  }
}
function frame(m,team,roles,offset,tick){
  const mids=m.players.filter(p=>p.team===team&&/^(EDGE_|SECOND_BALL_|SECOND_WAVE_)/.test(roles[p.id]||''));
  const sample=p=>({id:p.id,actualLocal:local(team,p),targetLocal:target(team,p),role:roles[p.id]||null});
  const fullbacks=['LB','RB'].map(slot=>{
    const p=get(m,team,slot),cb=get(m,team,slot==='LB'?'LCB':'RCB');
    const mid=mids.slice().sort((a,b)=>dist(a,p)-dist(b,p))[0];
    const outlets=m.players.filter(q=>q.team!==team&&q.role!=='GK'&&local(team,q).x<(mid?local(team,mid).x:80));
    const outlet=outlets.sort((a,b)=>dist(a,p)-dist(b,p))[0];
    const role=roles[p.id]||null,task=p.tacticalTask||p.action;
    return{...sample(p),tacticalTask:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,
      duty:task==='SET_PIECE_FLANK_REST_DEFENCE'?'REST_DEFENCE':task==='SET_PIECE_SECOND_BALL_RESPONSE'?'CURRENT_SECOND_BALL_RESPONSE':m.restart&&m.restart.team===team?role:'NORMAL_OPEN_PLAY_SUPPORT',
      cb:sample(cb),secondBall:mid?sample(mid):null,counterOutlet:outlet?sample(outlet):null,
      finalMovementIntent:p.finalMovementIntent?{type:p.finalMovementIntent.type,targetPoint:p.finalMovementIntent.targetPoint}:null};
  });
  return{tick,offset,time:m.time,phase:m.phase,restartKind:m.restart?.kind||null,restartStage:m.restart?.stage||null,
    restAuthority:!!m.attackingSetPieceRestDefence,ball:{mode:m.ball.mode,ownerId:m.ball.ownerId||null,currentLocal:local(team,m.ball),z:m.ball.z||0},fullbacks};
}
function run(spec,team,seed='V62-EXACT'){
  const m=init(`${seed}-${spec.id}`),point=team==='AWAY'?spec:local('AWAY',spec),label=`${spec.id} ${team} ${seed}`;
  E.choiceActionBridge().startDeadRestart(m,spec.kind,team,point.x,point.y,null,spec.metadata);
  // Explicit pattern fixture: startDeadRestart only forwards freeKickType.
  // Select the existing corner pattern before setup; never change live bodies.
  if(spec.id==='SHORT_OPTION'){m.restart.cornerType='SHORT';delete m.restart.setup;R.begin(m);}
  let roles=null,kickTick=null,kickAt=null,wallIds=[],captured=false;const frames=[];
  for(let tick=0;tick<1000;tick++){
    const s=m.restart?.setup,plan=s?.cornerPlan||s?.freeKickPlan;
    if(plan&&!captured){allocation(m,s,plan,team,label);roles=clone(plan.roles);wallIds=plan.defensiveWallIds||[];captured=true;}
    frames.push(frame(m,team,roles||{},kickTick===null?null:Number(((tick-kickTick)*DT).toFixed(2)),tick));
    if(kickTick!==null&&tick-kickTick>=50)break;
    E.step(m,DT);
    if(kickTick===null&&m.events.some(e=>e.type===spec.event)){kickTick=tick+1;kickAt=m.time;}
  }
  assert(captured&&kickTick!==null,`${label}: setup and real kick`);
  const live=frames.filter(f=>f.offset!==null);assert(live.length>=51&&live.at(-1).offset>=2.5,`${label}: +2.5s capture`);
  assert(frames.some(f=>f.restartStage==='SETUP'),`${label}: SETUP capture`);
  for(const f of frames){
    assert(f.fullbacks.every(p=>Number.isFinite(p.targetLocal.x)&&Number.isFinite(p.targetLocal.y)),`${label}: no no-target freeze`);
    for(const p of f.fullbacks){
      assert(p.id.endsWith('LB')?p.actualLocal.y<34:p.actualLocal.y>34,`${label}: actual side identity`);
      assert(p.id.endsWith('LB')?p.targetLocal.y<34:p.targetLocal.y>34,`${label}: target side identity`);
      if(p.duty==='REST_DEFENCE'&&f.offset!==null){
        assert.equal(p.markTargetId,null,`${label}: zonal rather than CM mark`);
        assert.equal(p.finalMovementIntent?.type,'SET_PIECE_FLANK_REST_DEFENCE',`${label}: motor consumes final rest target`);
        assert(dist(p.finalMovementIntent.targetPoint,team==='HOME'?p.targetLocal:local('AWAY',p.targetLocal))<EPS,`${label}: sealed destination`);
        assert(p.targetLocal.x<=p.cb.actualLocal.x+4.8+2.0+EPS,`${label}: current CB relationship (2m motor travel allowance)`);
        assert(p.id.endsWith('LB')?p.targetLocal.y<p.cb.targetLocal.y:p.targetLocal.y>p.cb.targetLocal.y,`${label}: outside CB spine`);
      }
    }
    if(f.offset!==null&&f.restAuthority&&!f.restartKind){
      const rest=f.fullbacks.filter(p=>p.duty==='REST_DEFENCE'),exceptions=f.fullbacks.filter(p=>p.role==='SHORT_OPTION'||p.duty==='CURRENT_SECOND_BALL_RESPONSE');
      assert(rest.length+exceptions.length===2&&rest.length>=1,`${label}: neither both high nor generic support overwrite`);
      for(const p of rest){
        if(p.secondBall)assert(p.targetLocal.x<p.secondBall.actualLocal.x-5,`${label}: executable rest target remains behind second-ball actor`);
      }
    }
  }
  assert(live.some(f=>f.fullbacks.some(p=>p.duty==='REST_DEFENCE')),`${label}: active post-kick rest protection`);
  for(const id of ['LB','RB'].map(slot=>get(m,team,slot).id)){
    if(roles[id]==='SHORT_OPTION')continue;
    const moving=live.flatMap(f=>f.fullbacks.filter(p=>p.id===id&&p.duty==='REST_DEFENCE'));
    assert(moving.length>1&&moving.some(p=>dist(p.actualLocal,moving[0].actualLocal)>.1),`${label}: ${id} physically executes its rest rail`);
    assert(moving.some(p=>dist(p.targetLocal,moving[0].targetLocal)>.1),`${label}: ${id} target follows live geometry`);
  }
  if(spec.id==='SHORT_OPTION'){
    assert(Object.entries(roles).some(([id,role])=>role==='SHORT_OPTION'&&m.playersById[id].role==='FB'),`${label}: explicit FB short option`);
    assert(Object.entries(roles).filter(([id,role])=>/^REST_DEFENCE/.test(role)&&m.playersById[id].role==='CB').length>=2,`${label}: short option preserves CB spine`);
  }
  if(spec.id==='STRONG_WALL_DIRECT'){
    assert(wallIds.includes(`${other(team)[0]}-LB`)&&wallIds.includes(`${other(team)[0]}-RB`),`${label}: accepted wall fullback membership`);
  }
  assert(!(m.userChoiceLog||[]).length&&!m.events.some(e=>e.type==='USER_CHOICE'),`${label}: no unchosen action`);
  return{id:spec.id,team,seed,kickAt,roles,wallIds,frames};
}

// Isolated current-state fixtures, separate from the untouched motor runs.
// Their positions describe a clearance now, never a forced acceptance outcome.
function currentFixture(team,slot){
  const m=init(`V62-CURRENT-${team}-${slot}`),point=local(team,{x:105,y:0});
  E.choiceActionBridge().startDeadRestart(m,'CORNER',team,point.x,point.y);
  const roles=clone(m.restart.setup.cornerPlan.roles);
  const authority=m.attackingSetPieceRestDefence;R.begin(m);
  assert.strictEqual(m.attackingSetPieceRestDefence,authority,'re-entering the same setup preserves rest authority');
  m.restart=null;m.setPieceLive=null;m.phase='OPEN_PLAY';m.time=100;m.possession=team;
  const sg=slot==='LB'?-1:1,fb=get(m,team,slot),cb=get(m,team,slot==='LB'?'LCB':'RCB');
  const put=(p,x,y)=>{const q=local(team,{x,y});Object.assign(p,{x:q.x,y:q.y,tx:q.x,ty:q.y,vx:0,vy:0,markTargetId:null});};
  for(const p of m.players)put(p,p.team===team?82:95,34);
  for(const p of m.players.filter(p=>p.team===team&&['FB','CB','CM'].includes(p.role))){
    const sign=p.slot.startsWith('L')?-1:p.slot.startsWith('R')?1:0;
    put(p,p.role==='CM'?75:36,34+sign*(p.role==='FB'?20:p.role==='CB'?7:10));
  }
  const outlet=get(m,other(team),slot==='LB'?'RW':'LW'),central=get(m,other(team),'CM');
  put(outlet,48,34+sg*18);put(central,59,34);put(get(m,other(team),'ST'),54,34);
  const setBall=(mode,x,y,owner=null)=>{const q=local(team,{x,y});Object.assign(m.ball,{...q,mode,z:mode==='FLIGHT'?4:0,ownerId:owner?.id||null,lastTouchTeam:team,lastTouchPlayer:get(m,team,'CM').id});};
  setBall('FLIGHT',87,34);
  return{m,team,slot,sg,fb,cb,outlet,central,put,setBall,roles};
}
function currentFixtures(){
  const rows=[];
  for(const team of ['HOME','AWAY'])for(const slot of ['LB','RB']){
    const f=currentFixture(team,slot),{m,fb,cb,outlet,central,sg}=f,label=`CURRENT ${team} ${slot}`;
    T.assign(m);
    const first=target(team,fb);
    assert.equal(fb.tacticalTask,'SET_PIECE_FLANK_REST_DEFENCE',`${label}: real flank rail`);
    assert.equal(fb.markTargetId,null,`${label}: no central marker`);
    assert(sg*(first.y-local(team,cb).y)>5,`${label}: outside CB`);
    assert(first.x<=local(team,outlet).x-3.2,`${label}: goal-side of current outlet`);
    assert(dist(first,local(team,central))>15,`${label}: no central CM pursuit`);
    // Intended endpoints alone cannot recruit a fullback out of the shell.
    const changed=m;changed.ball.intendedReceiverId=fb.id;
    changed.ball.targetX=changed.ball.intendedTargetX=local(team,{x:98,y:34}).x;
    changed.ball.targetY=changed.ball.intendedTargetY=34;
    T.assign(changed);
    assert(dist(first,target(team,get(changed,team,slot)))<EPS,`${label}: future intent has no rest authority`);
    f.put(outlet,40,34+sg*18);m.time+=DT;T.assign(m);
    const retreat=target(team,fb);
    assert(retreat.x<first.x-2,`${label}: current outlet changes depth`);
    assert(sg*(retreat.y-34)>12,`${label}: still flank protection`);
    // Actual playable clearance: one nearest FB may respond if both the CB
    // spine and opposite flank are physically behind the ball.
    f.put(fb,47,34+sg*20);f.setBall('LOOSE',48,34+sg*20);m.time+=DT;
    T.assignLooseBallArbitration(m);
    assert.equal(fb.tacticalTask,'SET_PIECE_SECOND_BALL_RESPONSE',`${label}: current nearest responder`);
    const opposite=get(m,team,slot==='LB'?'RB':'LB');
    assert.equal(opposite.tacticalTask,'SET_PIECE_FLANK_REST_DEFENCE',`${label}: other flank still covered`);
    assert(dist(target(team,fb),local(team,m.ball))<EPS,`${label}: respond to current ball`);
    // Shell not covered: proximity alone must not send both FBs forward.
    f.put(opposite,60,34-sg*20);m.time+=DT;T.assignLooseBallArbitration(m);
    assert.equal(fb.tacticalTask,'SET_PIECE_FLANK_REST_DEFENCE',`${label}: uncovered shell denies release`);
    assert.notEqual(m.looseBallArbitration.teams[team].primaryId,fb.id,`${label}: denied responder is not nominated for execution`);
    const primary=m.playersById[m.looseBallArbitration.teams[team].primaryId];
    assert(primary&&primary.tacticalTask==='CHASE_LOOSE',`${label}: an eligible teammate still pursues the clearance`);
    // Own recycle produces ordinary support immediately, with no new timer.
    const cm=get(m,team,'CM');f.put(cm,64,34);f.setBall('CONTROLLED',64,34,cm);m.time+=DT;T.assign(m);
    assert(!m.attackingSetPieceRestDefence,`${label}: recycle hands off authority`);
    assert.notEqual(fb.tacticalTask,'SET_PIECE_FLANK_REST_DEFENCE',`${label}: ordinary attack support resumes`);
    const counter=currentFixture(team,slot);counter.m.possession=other(team);
    counter.setBall('CONTROLLED',48,34+sg*18,counter.outlet);T.assign(counter.m);
    assert(!counter.m.attackingSetPieceRestDefence,`${label}: counter hands off to defensive authority`);
    assert(!/^SET_PIECE_.*REST_DEFENCE/.test(counter.fb.tacticalTask),`${label}: defence is executable`);
    const next=currentFixture(team,slot);
    E.choiceActionBridge().startDeadRestart(next.m,'THROW_IN',team,52,0);
    assert(!next.m.attackingSetPieceRestDefence,`${label}: next restart clears provenance`);
    rows.push({team,slot,first,retreat,currentResponse:true,uncoveredReleaseDenied:true,recycleReleased:true,counterReleased:true,nextRestartCleared:true});
  }
  return rows;
}

const real=specs.slice(0,4).flatMap(spec=>['AWAY','HOME'].map(team=>run(spec,team)));
const seedSample=['V62-SAMPLE-7','V62-SAMPLE-13'].flatMap(seed=>specs.slice(0,3).map(spec=>run(spec,'AWAY',seed)));
const shortOption=['AWAY','HOME'].map(team=>run(specs[4],team));
const current=currentFixtures();
const sources=['corner_templates.js','free_kick_templates.js','tactical_movement.js'].map(name=>{
  const source=fs.readFileSync(path.join(__dirname,'../runtime',name),'utf8');
  assert(!/\b(?:futureOutcome|winner)\s*[:=]|\.result\s*=/.test(source),`${name}: outcome precompute`);
  return{name,sha256:crypto.createHash('sha256').update(source).digest('hex')};
});
console.log(JSON.stringify({verdict:'PASS_V62_ATTACKING_SET_PIECE_FULLBACK_REST_DEFENCE',sampleInterval:DT,
  clock:'MOTOR_STEPS (dead-clock compression separately recorded as time)',sources,real,seedSample,shortOption,current,userVisualPass:false},null,2));
