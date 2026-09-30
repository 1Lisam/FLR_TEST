'use strict';

/* Executable P0 gate. It loads the real restart runtime and set-piece
 * overlays. The synthetic mode reintroduces the rejected defender-frame
 * transform in memory and must remain RED. */
const assert=require('assert'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const other=t=>t==='HOME'?'AWAY':'HOME';
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const local=(team,x,y)=>world(team,x,y);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const goalX=team=>team==='HOME'?0:105;
const round=v=>Number(v.toFixed(3));
const SLOTS=['GK','ST','LW','RW','LCM','CM','RCM','LB','RB','LCB','RCB'];
const ROLE_BY_SLOT={GK:'GK',ST:'ST',LW:'WF',RW:'WF',LCM:'CM',CM:'CM',RCM:'CM',LB:'FB',RB:'FB',LCB:'CB',RCB:'CB'};
const CASES=Object.freeze([
  ['CORNER','HOME','LEFT'],['CORNER','HOME','RIGHT'],['CORNER','AWAY','LEFT'],['CORNER','AWAY','RIGHT'],
  ['FREE_KICK','HOME','LEFT'],['FREE_KICK','HOME','RIGHT'],['FREE_KICK','AWAY','LEFT'],['FREE_KICK','AWAY','RIGHT']
].map(([kind,restartTeam,lane])=>({kind,restartTeam,lane,defTeam:other(restartTeam)})));
function loadRuntime(){
  if(loadRuntime.loaded)return loadRuntime.R;
  const R=require(path.join(ROOT,'runtime/restart_movement.js'));global.FLRPG_RESTART_MOVEMENT=R;
  require(path.join(ROOT,'runtime/free_kick_templates.js'));
  require(path.join(ROOT,'runtime/v39_free_kick_channel_owner_patch.js'));
  require(path.join(ROOT,'runtime/v39_free_kick_defensive_layers_patch.js'));
  require(path.join(ROOT,'runtime/corner_templates.js'));
  loadRuntime.loaded=true;loadRuntime.R=R;return R;
}
function makePlayers(team){
  const pos={GK:[102,34],ST:[49,34],LW:[70,15],RW:[70,53],LCM:[53,24],CM:[51,34],RCM:[53,44],LB:[69,10],RB:[69,58],LCB:[73,27],RCB:[73,41]};
  return SLOTS.map(slot=>{const w=world(team,...pos[slot]);return{id:`${team==='HOME'?'H':'A'}-${slot}`,team,slot,role:ROLE_BY_SLOT[slot],x:w.x,y:w.y,tx:w.x,ty:w.y,bodyAngle:0};});
}
function makeCase(c){
  const point=world(c.restartTeam,1.2,c.lane==='LEFT'?8:60),players=[...makePlayers('HOME'),...makePlayers('AWAY')];
  const kicker=players.find(p=>p.team===c.restartTeam&&p.slot==='LW');kicker.x=point.x+1.8;kicker.y=point.y;
  return{seed:'V40-P0-RUNTIME',time:0,players,playersById:Object.fromEntries(players.map(p=>[p.id,p])),managerProfiles:{HOME:{},AWAY:{pressing:1}},ball:{x:point.x,y:point.y,mode:'DEAD'},restart:{kind:c.kind,team:c.restartTeam,x:point.x,y:point.y,stage:'SETUP',setupStartedAt:0}};
}
function runtimeSetup(c){const R=loadRuntime(),m=makeCase(c),setup=R.begin(m);R.assign(m);if(!setup)throw new Error(`runtime setup missing: ${c.kind}`);return{m,setup};}
function targetFor(m,setup,c,role,synthetic){
  const candidates=m.players.filter(p=>p.team===c.defTeam&&p.role===role&&setup.targets[p.id]);
  if(!candidates.length)return null;
  const required=candidates.filter(p=>setup.requiredIds.includes(p.id)),pool=required.length?required:candidates;
  const best=pool.reduce((a,p)=>distance(p,setup.targets[p.id])>distance(a,setup.targets[a.id])?p:a,pool[0]);
  let t={...setup.targets[best.id]};
  if(synthetic){const semantic=local(c.restartTeam,t.x,t.y);t=world(c.defTeam,semantic.x,semantic.y);}
  const own=distance(t,{x:goalX(c.defTeam),y:34}),restart=distance(t,{x:goalX(c.restartTeam),y:34});
  return{playerId:best.id,required:setup.requiredIds.includes(best.id),initialPhysical:{x:round(best.x),y:round(best.y)},targetPhysical:{x:round(t.x),y:round(t.y)},travelDistance:round(distance(best,t)),distanceToDefendingGoal:round(own),distanceToRestartingGoal:round(restart),wrongEnd:own>restart,task:setup.targets[best.id].task};
}
function runFixtures(mode='CURRENT_RUNTIME'){const synthetic=mode==='SYNTHETIC_WRONG';return CASES.flatMap(c=>{const {m,setup}=runtimeSetup(c);return ['CM','FB','CB'].map(role=>{const result=targetFor(m,setup,c,role,synthetic);return{case:`${c.kind}_${c.restartTeam}_${c.lane}`,kind:c.kind,restartTeam:c.restartTeam,lane:c.lane,defendingTeam:c.defTeam,role,result,missing:!result,badDetected:!!result?.wrongEnd};});});}
function count(rows){return{cases:CASES.length,roleChecks:rows.length,missing:rows.filter(r=>r.missing).length,badDetected:rows.filter(r=>r.badDetected).length};}
function forcedWrongEndRegression(){const c=CASES[0],R=loadRuntime(),m=makeCase(c),setup=R.begin(m);for(const id of setup.requiredIds){const t=setup.targets[id],semantic=local(c.restartTeam,t.x,t.y);Object.assign(t,world(c.defTeam,semantic.x,semantic.y));}m.time=setup.maxReadyAt+1;const rd=R.readiness(m);return{forced:rd.forced,wrongEndRequiredTarget:rd.wrongEndRequiredTarget,ready:rd.ready};}
function run(){const current=runFixtures(),synthetic=runFixtures('SYNTHETIC_WRONG'),controlFalsePositives=current.filter(r=>r.badDetected).length,forced=forcedWrongEndRegression(),blocked=controlFalsePositives>0||current.some(r=>r.missing)||synthetic.some(r=>r.missing)||synthetic.some(r=>!r.badDetected)||forced.ready||!forced.wrongEndRequiredTarget;return{module:'V40_P0_SET_PIECE_WRONG_END_DETECTOR',schemaVersion:'V40_P0_WRONG_END_TARGET_2.0',verdict:blocked?'BLOCKED':'PASS',blocked,current:{counts:{...count(current),controlFalsePositives},fixtures:current},syntheticReintroduction:{counts:count(synthetic),fixtures:synthetic,expected:'BLOCKED'},forcedWrongEndRegression:forced,policy:{realRuntimeModules:true,physicalGoalRelationship:true,homeAwayCovered:true,leftRightCovered:true,cornerCovered:true,freeKickCovered:true,badAndControlFixturesRequired:true,requiredRoleMaxTravel:true},rationale:'Defending box/mark/clearance targets must be closer to the defending own goal than the restarting team goal.'};}
function selftest(){const out=run();assert.equal(out.verdict,'PASS');assert.equal(out.current.counts.badDetected,0);assert.equal(out.current.counts.missing,0);assert.equal(out.syntheticReintroduction.counts.badDetected,24);assert.equal(out.syntheticReintroduction.counts.missing,0);assert.equal(out.forcedWrongEndRegression.forced,true);assert.equal(out.forcedWrongEndRegression.wrongEndRequiredTarget,true);assert.equal(out.forcedWrongEndRegression.ready,false);return{module:out.module,selftest:'PASS',current:out.current.counts,synthetic:out.syntheticReintroduction.counts,forcedWrongEndRegression:out.forcedWrongEndRegression};}
if(require.main===module){const out=process.argv.includes('--selftest')?selftest():run();console.log(JSON.stringify(out,null,2));if(out.verdict&&out.verdict!=='PASS')process.exitCode=11;}
module.exports={CASES,run,runFixtures,selftest,makeCase,runtimeSetup,goalX,distance};
