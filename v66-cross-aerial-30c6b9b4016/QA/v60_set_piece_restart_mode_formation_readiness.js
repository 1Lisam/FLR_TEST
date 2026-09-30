'use strict';
const assert=require('assert'),R=require('../runtime/restart_movement.js');
global.FLRPG_RESTART_MOVEMENT=R;
require('../runtime/free_kick_templates.js');
require('../runtime/free_kick_wall_model.js');
require('../runtime/corner_templates.js');
const E=require('../runtime/continuous_match_core.js');
const ARRIVAL_TOLERANCE=R.SETTLED_FORMATION_ARRIVAL_TOLERANCE;
const STABLE_DWELL=R.SETTLED_FORMATION_STABLE_DWELL;
assert(STABLE_DWELL>=.40&&STABLE_DWELL<=.60,'settled dwell stays within approved bounds');
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const copyPlayers=m=>Object.fromEntries(m.players.map(p=>[p.id,{x:p.x,y:p.y,vx:p.vx||0,vy:p.vy||0,team:p.team,role:p.role}]));
function planFor(setup){return setup.kind==='FREE_KICK'?setup.freeKickPlan:setup.cornerPlan;}
function settledArrivalActors(m,setup,positions){
 const plan=planFor(setup),family=setup.kind==='FREE_KICK'?/^(?:TARGET_|SECOND_BALL_|REST_DEFENCE(?:_|$)|SHORT_OPTION$)/:/^(?:FIRST_WAVE_|SECOND_WAVE_|EDGE_|REST_DEFENCE(?:_|$)|SHORT_OPTION$)/;
 return Object.entries(plan.roles).flatMap(([id,role])=>{const p=positions[id],t=setup.targets[id];if(id===setup.kickerId||p?.team!==setup.team||p?.role==='GK'||!t||!family.test(role))return[];if(role==='REST_DEFENCE_SUPPORT'&&!/_HOLD$/.test(String(t.task||'')))return[];return[{id,role,distance:distance(p,t),speed:Math.hypot(p.vx,p.vy)}];});
}
function arrivalComplete(m,setup,positions,label){const actors=settledArrivalActors(m,setup,positions);assert(actors.length>0,`${label}: authored settled-arrival actor set`);for(const actor of actors)assert(actor.distance<=ARRIVAL_TOLERANCE+1e-8,`${label}: ${actor.role}/${actor.id} ${actor.distance.toFixed(3)}m from HOLD target at readiness (tolerance ${ARRIVAL_TOLERANCE}m; speed ${actor.speed.toFixed(3)}m/s)`);return actors;}
function semanticCounts(m,setup,positions){const plan=planFor(setup),close=pattern=>Object.entries(plan.roles).filter(([id,role])=>{const p=positions[id],t=setup.targets[id];return p?.team===setup.team&&pattern.test(role)&&t&&distance(p,t)<=6;}).length;if(setup.kind==='FREE_KICK'){const short=Object.entries(plan.roles).some(([id,role])=>positions[id]?.team===setup.team&&role==='SHORT_OPTION'&&setup.targets[id]);return{primary:close(/^TARGET_/),secondBall:close(/^SECOND_BALL_/),restDefence:close(/^REST_DEFENCE(?:_|$)/),shortOption:close(/^SHORT_OPTION$/),shortRequired:short};}return{primary:close(/^(?:FIRST_WAVE|SECOND_WAVE)_/),edge:close(/^EDGE_/),restDefence:close(/^REST_DEFENCE(?:_|$)/)};}
function assertSettledDiagnostics(m,setup,positions,label){const c=semanticCounts(m,setup,positions);if(setup.kind==='FREE_KICK'){assert(c.primary>=3,`${label}: primary target wave (${c.primary}/3)`);assert(c.secondBall>=1,`${label}: second-ball layer (${c.secondBall}/1)`);assert(c.restDefence>=1,`${label}: rest-defence (${c.restDefence}/1)`);if(c.shortRequired)assert(c.shortOption>=1,`${label}: short option (${c.shortOption}/1)`);}else{assert(c.primary>=4,`${label}: contest/arrival wave (${c.primary}/4)`);assert(c.edge>=1,`${label}: edge layer (${c.edge}/1)`);assert(c.restDefence>=1,`${label}: rest-defence (${c.restDefence}/1)`);}return c;}
function assertFreeKickAllocation(m,setup,label){
 const plan=setup.freeKickPlan,semantic=Object.entries(plan.roles).filter(([,role])=>/^(?:KICKER|SHORT_OPTION|TARGET_|REST_DEFENCE_[12]|SECOND_BALL_[12])$/.test(role)),ids=semantic.map(([id])=>id);
 assert.equal(new Set(ids).size,ids.length,`${label}: duplicate settled semantic actor`);
 const groups={target:[],rest:[],secondBall:[],wall:[],mark:[],box:[],edge:[],counter:[]};
 for(const [id,role] of Object.entries(plan.roles)){
  const p=m.playersById[id],row={id,role:p.role,slot:p.slot,target:setup.targets[id]&&{x:setup.targets[id].x,y:setup.targets[id].y}};
  if(role.startsWith('TARGET_'))groups.target.push(row);
  else if(role.startsWith('REST_DEFENCE'))groups.rest.push(row);
  else if(role.startsWith('SECOND_BALL_'))groups.secondBall.push(row);
  else if(role==='WALL')groups.wall.push(row);
  else if(role==='MARK_CONTEST'){row.markTargetId=p.markTargetId;groups.mark.push(row);}
  else if(role==='BOX_ZONE')groups.box.push(row);
  else if(role==='DEFENSIVE_SECOND_BALL'||role==='WIDE_EDGE_CLEARANCE')groups.edge.push(row);
  else if(role==='COUNTER_OUTLET')groups.counter.push(row);
 }
 for(const key of ['TARGET_CENTRAL','TARGET_NEAR','TARGET_FAR','REST_DEFENCE_1','REST_DEFENCE_2','SECOND_BALL_1','SECOND_BALL_2']){
  const a=plan.allocation?.roles?.[key];assert(a&&Number.isFinite(a.distance)&&Number.isFinite(a.score)&&typeof a.rationale==='string',`${label}: ${key} allocation debug`);
 }
 for(const p of groups.target)assert(['ST','WF','CM'].includes(p.role),`${label}: primary danger role ${p.id}/${p.role}`);
 const restStructural=groups.rest.filter(p=>['CB','FB'].includes(p.role));
 assert(restStructural.length>=2,`${label}: two structural rest defenders`);
 const attackLocal=t=>world(setup.team,t.x,t.y);
 for(const p of restStructural)for(const q of [...groups.target,...groups.secondBall])assert(attackLocal(p.target).x<attackLocal(q.target).x,`${label}: rest defender behind ${q.id}`);
 for(const slot of ['LCB','RCB']){const p=m.players.find(q=>q.team===setup.team&&q.slot===slot);assert(/^REST_DEFENCE/.test(plan.roles[p.id]),`${label}: ${slot} stays structural`);}
 const left=m.players.find(p=>p.team===setup.team&&p.slot==='LCB'),right=m.players.find(p=>p.team===setup.team&&p.slot==='RCB');
 assert(attackLocal(setup.targets[left.id]).y<attackLocal(setup.targets[right.id]).y,`${label}: CB lanes preserve left/right identity`);
 const wall=setup.freeKickWall;assert.deepEqual(groups.wall.map(p=>p.id).sort(),[...wall.wallPlayerIds].sort(),`${label}: wall ownership`);
 if(wall.count)assert(groups.wall.length>0,`${label}: wall layer`);else assert.equal(groups.wall.length,0,`${label}: no pseudo-wall`);
 assert(groups.mark.length>=1&&groups.edge.length>=1&&groups.counter.length>=1,`${label}: mark/edge/outlet layers`);
 for(const p of groups.mark){assert(p.markTargetId&&groups.target.some(q=>q.id===p.markTargetId),`${label}: actual mark target`);assert(['CB','FB','CM'].includes(p.role),`${label}: mark priority`);}
 for(const p of [...groups.mark,...groups.box,...groups.edge])for(const q of wall.wallPoints)assert(distance(p.target,q)>=2.15,`${label}: ${p.id} clear of wall`);
 for(const p of m.players.filter(q=>q.team!==setup.team&&q.role==='WF'&&!wall.wallPlayerIds.includes(q.id)))assert.equal(plan.roles[p.id],'WIDE_EDGE_CLEARANCE',`${label}: non-wall winger stays wide`);
 const cmEdge=groups.edge.filter(p=>p.role==='CM');for(const wf of groups.edge.filter(p=>p.role==='WF'))if(cmEdge.length)assert(cmEdge.some(cm=>Math.abs(attackLocal(wf.target).y-34)>Math.abs(attackLocal(cm.target).y-34)),`${label}: WF wider than a CM`);
 return{roles:plan.allocation.roles,shape:groups,wallCount:wall.count};
}
function assertSetupLanes(m,setup,label){
 const wallIds=new Set(setup.freeKickWall?.wallPlayerIds||[]);
 for(const team of ['HOME','AWAY'])for(const [l,r] of [['LW','RW'],['LB','RB'],['LCB','RCB'],['LCM','RCM']]){
  const left=m.players.find(p=>p.team===team&&p.slot===l),right=m.players.find(p=>p.team===team&&p.slot===r),lt=setup.targets[left.id],rt=setup.targets[right.id];
  if(!lt||!rt)continue;
  const toL=world(team,lt.x,lt.y).y,toR=world(team,rt.x,rt.y).y;
  assert(toL<toR,`${label}: ${team} ${l}/${r} preserve actor order`);
  if(!wallIds.has(left.id))assert(toL<=34.5,`${label}: ${team} ${l} retains own-side target`);
  if(!wallIds.has(right.id))assert(toR>=33.5,`${label}: ${team} ${r} retains own-side target`);
 }
 for(const team of ['HOME','AWAY'])for(const [fbSlot,cbSlot,sign] of [['LB','LCB',-1],['RB','RCB',1]]){
  const fb=m.players.find(p=>p.team===team&&p.slot===fbSlot),cb=m.players.find(p=>p.team===team&&p.slot===cbSlot);
  if(wallIds.has(fb.id)||wallIds.has(cb.id))continue;
  const fy=world(team,setup.targets[fb.id].x,setup.targets[fb.id].y).y,cy=world(team,setup.targets[cb.id].x,setup.targets[cb.id].y).y;
  assert(sign*(fy-cy)>=.35,`${label}: ${team} ${fbSlot} outside ${cbSlot}`);
  assert(Math.abs(fy-34)>=Math.abs(cy-34)-.15,`${label}: ${team} ${cbSlot} remains the central defender`);
 }
 if(label==='ATTACK_DIRECT'){
  const wall=setup.freeKickWall,def=wall.defendingTeam;
  assert.equal(wall.count,5,`${label}: strong wall count unchanged`);
  const sideRank=id=>m.playersById[id].slot?.startsWith('L')?-1:m.playersById[id].slot?.startsWith('R')?1:0;
  assert.deepEqual(wall.wallPlayerIds,[...wall.wallPlayerIds].sort((a,b)=>sideRank(a)-sideRank(b)||world(def,m.playersById[a].x,m.playersById[a].y).y-world(def,m.playersById[b].x,m.playersById[b].y).y),`${label}: selected wall players in own-side order`);
  for(let i=1;i<wall.wallPoints.length;i++)assert(world(def,wall.wallPoints[i-1].x,wall.wallPoints[i-1].y).y<world(def,wall.wallPoints[i].x,wall.wallPoints[i].y).y,`${label}: wall target order`);
  const lb=m.players.find(p=>p.team===def&&p.slot==='LB'),rb=m.players.find(p=>p.team===def&&p.slot==='RB');
  if(wall.wallPlayerIds.includes(lb.id)&&wall.wallPlayerIds.includes(rb.id))assert(wall.wallPlayerIds.indexOf(lb.id)<wall.wallPlayerIds.indexOf(rb.id),`${label}: wall LB before RB`);
  for(const p of m.players.filter(q=>q.team===setup.team&&q.role==='WF')){
   const t=setup.targets[p.id],v=world(setup.team,t.x,t.y),ball=world(setup.team,m.restart.x,m.restart.y);
   if(t.task.endsWith('_HOLD')&&v.x>ball.x)assert(Math.abs(v.y-34)>=5,`${label}: ${p.id} clears central shot corridor`);
  }
 }
}
function runScenario(spec){
 const m=E.createMatch(spec.seed||`V61-${spec.id}`),bridge=E.choiceActionBridge(),point=spec.worldPoint||world('AWAY',spec.x,spec.y);m.time=spec.time||30;m.protagonistControllerId=spec.protagonistControllerId||'NO_USER_CHOICE';bridge.startDeadRestart(m,spec.kind,'AWAY',point.x,point.y,null,spec.metadata);
 const setup=m.restart.setup,plan=planFor(setup),startAt=m.restart.setupStartedAt,start=copyPlayers(m);assert.equal(startAt,setup.createdAt,`${spec.id}: restart start is the constructed setup time`);assert.equal(startAt,m.time,`${spec.id}: restart starts after dead-clock adjustment`);assert.equal(plan.restartMode||'SETTLED_RESTART',spec.mode,`${spec.id}: restart mode`);if(spec.mode==='QUICK_RESTART'){assert(Object.keys(setup.targets).length<22,`${spec.id}: no full set-piece map`);assert.equal(Object.entries(setup.targets).filter(([id])=>m.playersById[id].role!=='GK').length,1,`${spec.id}: only kicker outfield target`);}else assert.equal(plan.complete,true,`${spec.id}: complete settled template`);
 if(['ATTACK_DIRECT','NO_WALL_INDIRECT','CORNER_TOP','CORNER_BOTTOM'].includes(spec.id))assertSetupLanes(m,setup,spec.id);
 const allocation=spec.kind==='FREE_KICK'&&spec.mode==='SETTLED_RESTART'?assertFreeKickAllocation(m,setup,spec.id):null;
 if(spec.exactTargetWave){const targets=Object.entries(plan.roles).filter(([,role])=>role.startsWith('TARGET_')).map(([id])=>id),short=Object.entries(plan.roles).find(([,role])=>role==='SHORT_OPTION')?.[0];assert.equal(targets.length,3,`${spec.id}: three target roles authored`);assert.equal(new Set(targets).size,3,`${spec.id}: target roles are unique`);for(const id of targets){assert.notEqual(id,setup.kickerId,`${spec.id}: target is not kicker`);if(short)assert.notEqual(id,short,`${spec.id}: target is not short option`);}}
 let beforeTaken=null,firstReadyFrame=null,continuousSince=null,maxJump=0;
 const originalReadiness=R.readiness;
 if(spec.mode==='SETTLED_RESTART')R.readiness=function(sample){
  const rd=originalReadiness(sample);
  if(sample===m&&rd.ready&&!firstReadyFrame){
   const positions=copyPlayers(m),arrived=settledArrivalActors(m,setup,positions).every(actor=>actor.distance<=ARRIVAL_TOLERANCE+1e-8);
   assert(['SETUP','SET_HOLD'].includes(m.restart.stage),`${spec.id}: first readiness remains pre-delivery`);
   assert(arrived,`${spec.id}: all authored actors arrived at first readiness`);
   assert(continuousSince!==null&&m.time-continuousSince+1e-8>=STABLE_DWELL,`${spec.id}: continuous observed arrival lasted ${STABLE_DWELL}s`);
   assert(rd.formationStableDuration+1e-8>=STABLE_DWELL,`${spec.id}: runtime dwell complete`);
   firstReadyFrame={positions,stage:m.restart.stage,readiness:rd,continuousDuration:m.time-continuousSince};
  }
  return rd;
 };
 for(let i=0;i<360;i++){
  const before=copyPlayers(m),r=m.restart;
  if(r&&spec.mode==='SETTLED_RESTART'&&['SETUP','SET_HOLD'].includes(r.stage)){
   const arrived=settledArrivalActors(m,setup,before).every(actor=>actor.distance<=ARRIVAL_TOLERANCE+1e-8);
   continuousSince=arrived?(continuousSince??m.time):null;
  }
  const rd=r?R.readiness(m):null;
  if(r){
   beforeTaken={positions:before,stage:r.stage,readiness:rd};
   if(spec.mode==='SETTLED_RESTART'){
    const arrived=settledArrivalActors(m,setup,before).every(actor=>actor.distance<=ARRIVAL_TOLERANCE+1e-8);
    if(['APPROACH','RUN_UP'].includes(r.stage)){assert(arrived,`${spec.id}: ${r.stage} starts only after full settled arrival`);assert(firstReadyFrame&&firstReadyFrame.readiness.formationStableDuration+1e-8>=STABLE_DWELL,`${spec.id}: no ${r.stage} before dwell-complete readiness`);}
   }
  }
  E.step(m,.05);
  for(const p of m.players){const d=distance(before[p.id],p);maxJump=Math.max(maxJump,d);assert(d<=.8+1e-8,`${spec.id}: coordinate jump ${p.id} ${d.toFixed(3)}m`);}
  if((m.events||[]).some(e=>e.type===spec.event))break;
 }
 R.readiness=originalReadiness;
 const taken=(m.events||[]).find(e=>e.type===spec.event);assert(taken,`${spec.id}: ${spec.event} occurs`);assert(taken.t-startAt<(spec.mode==='QUICK_RESTART'?6:14),`${spec.id}: bounded setup ${(taken.t-startAt).toFixed(2)}s`);assert(beforeTaken,`${spec.id}: pre-taken frame`);
 let formation=null;if(spec.mode==='QUICK_RESTART'){for(const team of ['HOME','AWAY']){const moved=Object.entries(start).filter(([,p])=>p.team===team&&p.role!=='GK').filter(([id,p])=>distance(p,beforeTaken.positions[id])>=18).length;assert(moved<6,`${spec.id}: ${team} mass rematerialisation (${moved}/10)`);}}else{assert(firstReadyFrame,`${spec.id}: captures first SETUP/SET_HOLD ready frame`);assert(firstReadyFrame.readiness.formationReady,`${spec.id}: formation readiness at first ready frame`);assert.equal(firstReadyFrame.readiness.formationArrival?.tolerance,ARRIVAL_TOLERANCE,`${spec.id}: runtime arrival tolerance`);formation={diagnostics:assertSettledDiagnostics(m,setup,firstReadyFrame.positions,spec.id),arrival:arrivalComplete(m,setup,firstReadyFrame.positions,spec.id),stage:firstReadyFrame.stage,readyAt:Number(firstReadyFrame.readiness.elapsed.toFixed(3)),continuousDuration:Number(firstReadyFrame.continuousDuration.toFixed(3))};}
 assert(!(m.events||[]).some(e=>e.type==='USER_CHOICE'),`${spec.id}: no USER_CHOICE`);assert(!(m.userChoiceLog||[]).length,`${spec.id}: no unchosen hero action`);const text=JSON.stringify({restart:m.restart,setPieceLive:m.setPieceLive,events:m.events,userChoiceLog:m.userChoiceLog});assert(!/(futureOutcome|winner|result)/i.test(text),`${spec.id}: no future result`);
 return{id:spec.id,takenAt:Number((taken.t-startAt).toFixed(3)),maxJump:Number(maxJump.toFixed(3)),formation,allocation};
}
function assertTransientArrivalCannotRelease(){
 const m=E.createMatch('V61-TRANSIENT-ARRIVAL');m.time=600;m.protagonistControllerId='NO_USER_CHOICE';
 E.choiceActionBridge().startDeadRestart(m,'FREE_KICK','AWAY',27,50,null,{freeKickType:'DIRECT'});
 const setup=m.restart.setup,actors=settledArrivalActors(m,setup,copyPlayers(m));
 assert(actors.length>0,'transient regression has authored actors');
 R.readiness(m); // Configure the normal formation timing before exercising forced readiness.
 for(const {id} of actors){const p=m.playersById[id],t=setup.targets[id];p.x=t.x;p.y=t.y;p.vx=4.1;p.vy=0;}
 const kicker=m.playersById[setup.kickerId],kt=setup.targets[setup.kickerId];kicker.x=kt.x;kicker.y=kt.y;
 setup.maxReadyAt=setup.createdAt;m.time=setup.createdAt+20;
 let rd=R.readiness(m);assert(rd.forced&&rd.formationArrival.ready,'transient sample is all-inside and forced');assert(!rd.formationReady&&!rd.ready,'one all-inside sample cannot release settled readiness, even when forced');
 m.time+=STABLE_DWELL-.05;rd=R.readiness(m);assert(!rd.formationReady&&!rd.ready,'sub-dwell sample stays blocked');
 const interrupted=m.playersById[actors[0].id],target=setup.targets[actors[0].id];interrupted.x=target.x+ARRIVAL_TOLERANCE+.25;m.time+=.05;
 rd=R.readiness(m);assert(!rd.formationArrival.ready&&!rd.formationReady&&!rd.ready,'leaving arrival radius resets dwell');assert.equal(rd.formationStableSince,null,'dwell origin cleared');
 interrupted.x=target.x;m.time+=.05;rd=R.readiness(m);assert(!rd.formationReady&&!rd.ready,'returning inside starts a new dwell');
 m.time+=STABLE_DWELL-.05;rd=R.readiness(m);assert(!rd.formationReady&&!rd.ready,'old dwell time is not carried over');
 m.time+=.05;rd=R.readiness(m);assert(rd.formationReady&&rd.ready,'continuous dwell completes without a speed gate');
 return{forcedBypassBlocked:true,transientBlocked:true,exitResetsDwell:true,highSpeedAllowed:true};
}
const scenarios=[
 {id:'DEEP_DIRECT',kind:'FREE_KICK',x:52,y:14,metadata:{freeKickType:'DIRECT'},mode:'QUICK_RESTART',event:'FREE_KICK_TAKEN'},
 {id:'DEEP_INDIRECT',kind:'FREE_KICK',x:52,y:54,metadata:{freeKickType:'INDIRECT'},mode:'QUICK_RESTART',event:'FREE_KICK_TAKEN'},
 {id:'ATTACK_DIRECT',kind:'FREE_KICK',x:88,y:34,metadata:{freeKickType:'DIRECT'},mode:'SETTLED_RESTART',event:'FREE_KICK_TAKEN'},
 {id:'ATTACK_INDIRECT',kind:'FREE_KICK',x:88,y:34,metadata:{freeKickType:'INDIRECT'},mode:'SETTLED_RESTART',event:'FREE_KICK_TAKEN'},
 {id:'NO_WALL_INDIRECT',kind:'FREE_KICK',x:70,y:14,metadata:{freeKickType:'INDIRECT'},mode:'SETTLED_RESTART',event:'FREE_KICK_TAKEN'},
 {id:'EXACT_V59_AD',seed:'V59-AD',time:600,protagonistControllerId:'H-ST',kind:'FREE_KICK',worldPoint:{x:27,y:50},metadata:{freeKickType:'DIRECT'},mode:'SETTLED_RESTART',event:'FREE_KICK_TAKEN',exactTargetWave:true},
 {id:'EXACT_V59_AI',seed:'V59-AI',time:600,protagonistControllerId:'H-ST',kind:'FREE_KICK',worldPoint:{x:27,y:50},metadata:{freeKickType:'INDIRECT'},mode:'SETTLED_RESTART',event:'FREE_KICK_TAKEN',exactTargetWave:true},
 {id:'GENERIC_CENTRAL_INDIRECT',seed:'V60-ATTACK_INDIRECT',time:600,protagonistControllerId:'H-ST',kind:'FREE_KICK',worldPoint:{x:17,y:34},metadata:{freeKickType:'INDIRECT'},mode:'SETTLED_RESTART',event:'FREE_KICK_TAKEN',exactTargetWave:true},
 {id:'CORNER_TOP',kind:'CORNER',x:104,y:1.2,metadata:{cornerType:'DELIVERED'},mode:'SETTLED_RESTART',event:'CORNER_KICK'},
 {id:'CORNER_BOTTOM',kind:'CORNER',x:104,y:66.8,metadata:{cornerType:'DELIVERED'},mode:'SETTLED_RESTART',event:'CORNER_KICK'}
];
const negative=assertTransientArrivalCannotRelease(),first=scenarios.map(runScenario),second=scenarios.map(runScenario);assert.deepEqual(second,first,'same seed deterministic restart signature');
console.log(JSON.stringify({verdict:'PASS_V61_SETTLED_STABLE_DWELL_GATE',arrivalTolerance:ARRIVAL_TOLERANCE,stableDwell:STABLE_DWELL,negative,scenarios:first,futureOutcomePrecomputed:false,unchosenHeroAction:false}));
