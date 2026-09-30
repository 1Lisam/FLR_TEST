'use strict';

/* P0 regression for the actual restart planner/assignment path.  This does
 * not replace the full match smoke: it isolates the four physical corners so
 * a future overwrite or clamp mutation fails immediately and explicitly. */
const assert=require('assert'),fs=require('fs'),path=require('path');
const R=require('../runtime/restart_movement.js');
require('../runtime/corner_templates.js');
const P=require('./v40_p0_set_piece_wrong_end_detector.js');

const corners=P.CASES.filter(x=>x.kind==='CORNER');
const round=v=>Number(Number(v).toFixed(3));
function local(team,x,y){return team==='HOME'?{x,y}:{x:105-x,y:68-y};}
function outside(team,corner,t){const q=local(team,t.x,t.y),top=local(team,corner.x,corner.y).y<34;return q.x>105&&((top&&q.y<0)||(!top&&q.y>68));}
function one(c){
  const {m,setup}=P.runtimeSetup(c),k=m.playersById[setup.kickerId],initial={...setup.targets[k.id]};
  assert.equal(initial.task,'CORNER_KICKER_RUNUP_START',`${c.restartTeam}/${c.lane}: outside task overwritten during setup`);
  assert(outside(c.restartTeam,m.restart,initial),`${c.restartTeam}/${c.lane}: kicker setup target is not outside`);
  assert.equal(R.cornerKickerOutsideStart(m),true,`${c.restartTeam}/${c.lane}: invariant rejected`);
  m.restart.stage='RUN_UP';R.assign(m);
  assert.equal(k.tacticalTask,'CORNER_RUN_UP',`${c.restartTeam}/${c.lane}: RUN_UP task missing`);
  assert.deepEqual({x:round(k.tx),y:round(k.ty)},{x:round(m.restart.x),y:round(m.restart.y)},`${c.restartTeam}/${c.lane}: RUN_UP did not approach live ball`);
  return{case:`${c.restartTeam}_${c.lane}`,kicker:k.id,setupTarget:{x:round(initial.x),y:round(initial.y),task:initial.task},runUpTarget:{x:round(k.tx),y:round(k.ty),task:k.tacticalTask},outside:true,causalApproach:true};
}
function mutation(){
  const c=corners[0],{m,setup}=P.runtimeSetup(c),id=setup.kickerId;
  // Reintroduce the rejected overwrite/clamp mutation in memory.
  setup.targets[id]={x:m.restart.x,y:m.restart.y,task:'CORNER_RUN_UP',required:true,sprint:false};
  setup.cornerRunup.start={x:m.restart.x,y:m.restart.y};
  return{mutation:'OLD_OVERWRITE_AND_IN_FIELD_CLAMP',expected:'RED',actual:R.cornerKickerOutsideStart(m)?'GREEN':'RED'};
}
function preservation(){
  for(const kind of ['FREE_KICK','OFFSIDE'])for(const c of P.CASES.filter(x=>x.kind==='FREE_KICK').slice(0,4)){
    const q={...c,kind};const {m,setup}=P.runtimeSetup(q);for(const [id,t] of Object.entries(setup.targets)){if(id===setup.kickerId)continue;assert(t.x>=1&&t.x<=104&&t.y>=1&&t.y<=67,`${kind}: ordinary target bounds changed`);}
  }
  return{freeKick:'PRESERVED',offside:'PRESERVED',ordinaryPlayerClamping:'PRESERVED'};
}
function sourceGuard(){
  const core=fs.readFileSync(path.join(__dirname,'../runtime/continuous_match_core.js'),'utf8');
  assert(core.includes("m.restart.kind==='CORNER'"),'corner integrator exception missing');
  assert(core.includes("['SETUP','SET_HOLD','RUN_UP'].includes(m.restart.stage)"),'corner pre-contact stage guard missing');
  return{continuousRuntime:'CORNER_PRE_CONTACT_OUTSIDE_CLAMP_PRESENT'};
}
function runtimeSmoke(){
  require('./v39_runtime_candidate_loader.js');
  const H=require('../final_match_rare_scenario_harness.js'),A=require('../live_v06_scene_authority_browser.js');
  const rows=[];
  for(const [scenario,team,lane,seed] of [['CORNER_ATTACK_LEFT','HOME','LEFT','V40-CORNER-SMOKE'],['CORNER_ATTACK_RIGHT','HOME','RIGHT','V40-CORNER-SMOKE'],['CORNER_DEFEND_LEFT','AWAY','LEFT','V40-CORNER-SMOKE'],['CORNER_DEFEND_RIGHT','AWAY','RIGHT','V40-CORNER-SMOKE'],['CORNER_ATTACK_RIGHT','HOME','RIGHT','V40-P0-RUNTIME']]){
    const b=H.boundary(scenario,seed),o=A.runSetPieceWindow(b,{seed:`${seed}|SETPIECE`,runtimeDir:path.resolve(__dirname,'../runtime'),durationSeconds:12}),kick=o.actualEvents.find(e=>e.type==='CORNER_KICK');
    assert(kick,`${scenario}: full restart did not reach contact`);
    const start=o.frames.find(f=>f.players.some(p=>p.tacticalTask==='CORNER_KICKER_RUNUP_START')),k=start?.players.find(p=>p.tacticalTask==='CORNER_KICKER_RUNUP_START');
    assert(k&&outside(team,{x:team==='HOME'?103.8:1.2,y:lane==='LEFT'?1.2:66.8},{x:k.tx,y:k.ty}),`${scenario}: runtime smoke lost outside origin`);
    rows.push({scenario,seed,kickTime:round(kick.t),outsideSetupTarget:{x:round(k.tx),y:round(k.ty)},contactReached:true});
  }
  return rows;
}
function run(){
  const four=corners.map(one),mut=mutation();assert.equal(mut.actual,'RED','legacy overwrite mutation survived');
  return{module:'V40_CORNER_KICKER_OUTSIDE_FIELD',schemaVersion:'V40_CORNER_KICKER_OUTSIDE_1.0',verdict:'PASS',priority:'P0',fourCorners:four,mutation:mut,preservation:preservation(),sourceGuard:sourceGuard(),runtimeSmoke:runtimeSmoke(),transition:'SETUP/SET_HOLD outside origin -> RUN_UP live-ball approach -> CORNER_KICK contact; no teleport performed'};
}
if(require.main===module){try{console.log(JSON.stringify(run(),null,2));}catch(e){console.error(e.stack);process.exitCode=15;}}
module.exports={run};
