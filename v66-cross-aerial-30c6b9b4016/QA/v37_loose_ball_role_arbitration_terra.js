'use strict';
const path=require('path'),root=path.resolve(__dirname,'..'),runtime=path.join(root,'runtime');
const R=require('../runtime/restart_movement.js');globalThis.FLRPG_RESTART_MOVEMENT=R;
require('../runtime/free_kick_templates.js');require('../runtime/free_kick_wall_model.js');require('../runtime/v37_set_piece_liveliness_patch.js');require('../runtime/corner_templates.js');
const E=require('../runtime/continuous_match_core.js');globalThis.FLRPG_CONTINUOUS_CORE=E;require('../runtime/v37_match_feel_patch.js');
const A=require('../live_v06_scene_authority_browser.js');globalThis.FLRPG_LIVE_V06_SCENE_AUTHORITY=A;const H=require('../final_match_rare_scenario_harness.js');
const checks=[],timelines={},setPieceSmoke={};
const check=(name,ok,detail='')=>{checks.push({name,ok:!!ok,detail});if(!ok)process.exitCode=1;};
const ids=['H-ST','H-LCM','H-CM','H-RCM','H-LB','H-RB','H-LCB','H-RCB'];
function task(f,id){return f.players.find(p=>p.id===id)?.tacticalTask||null;}
function row(f){const a=f.looseBallArbitration?.teams?.HOME||{};return{time:+f.time.toFixed(2),ball:f.ball.mode,owner:a.primaryId||null,budget:a.budget||null,ST:task(f,'H-ST'),LCM:task(f,'H-LCM'),CM:task(f,'H-CM'),RCM:task(f,'H-RCM'),LB:task(f,'H-LB'),LCB:task(f,'H-LCB'),RCB:task(f,'H-RCB'),RB:task(f,'H-RB')};}
for(const key of ['CROSS_LEFT','CROSS_RIGHT']){
  const r=H.run(key,'FINAL-MATCH-TEST-13',{runtimeDir:runtime}),frames=r.frames||[],loose=frames.filter(f=>f.ball.mode==='LOOSE'&&f.looseBallArbitration?.teams?.HOME&&f.looseBallArbitration?.teams?.AWAY),homeOwners=loose.map(f=>f.looseBallArbitration.teams.HOME?.primaryId).filter(Boolean),awayOwners=loose.map(f=>f.looseBallArbitration.teams.AWAY?.primaryId).filter(Boolean),changes=homeOwners.filter((id,i)=>i===0||id!==homeOwners[i-1]);
  const looseStart=loose[0]?.time??Infinity,sample=[];let last=-Infinity;for(const f of frames){if(f.time>looseStart+2.6)break;if(f.time-last>=.19&&f.time>=looseStart-.001) {sample.push(row(f));last=f.time;}}
  timelines[key]=sample;
  check(`${key}:LOOSE_OBSERVED`,loose.length>0);
  check(`${key}:NO_PRECOMPUTE`,r.futureOutcomePrecomputed===false);
  check(`${key}:ONE_PRIMARY_PER_TEAM`,loose.every(f=>['HOME','AWAY'].every(team=>{const a=f.looseBallArbitration.teams[team];return a&&a.budget?.primary===1&&a.budget?.used<=1&&a.secondaryId==null;})));
  check(`${key}:OWNER_REPLACED_NOT_ACCUMULATED`,changes.length>=2,changes.join(' -> '));
  check(`${key}:ST_RELEASED_TO_SCREEN`,loose.some(f=>task(f,'H-ST')==='LOOSE_FORWARD_SCREEN'),changes.join(' -> '));
  check(`${key}:CM_SECOND_BALL_LANES`,loose.some(f=>['H-LCM','H-CM','H-RCM'].every(id=>task(f,id)==='LOOSE_SECOND_BALL_LANE'||f.looseBallArbitration.teams.HOME.primaryId===id)));
  check(`${key}:FB_CB_LINE_COVER`,loose.every(f=>['H-LB','H-RB','H-LCB','H-RCB'].every(id=>task(f,id)==='LOOSE_LINE_COVER'||f.looseBallArbitration.teams.HOME.primaryId===id)));
  const controlled=frames.find(f=>f.ball.mode==='CONTROLLED'&&f.lastLooseBallArbitration);
  check(`${key}:CONTROLLED_RELEASES_LOOSE_AUTHORITY`,!!controlled&&controlled.looseBallArbitration===null,controlled?controlled.lastLooseBallArbitration.releaseReason:'missing');
  check(`${key}:NO_UNSELECTED_HERO_ACTION`,!(r.actualEvents||[]).some(e=>e.actorId==='H-ST'&&['PASS','SHOT','TAKE_ON'].includes(e.type)));
}
for(const key of ['CORNER_ATTACK_RIGHT','FREE_KICK_ATTACK_LEFT']){
  const b=H.boundary(key,'FINAL-MATCH-TEST-13'),r=A.runSetPieceWindow(b,{seed:'FINAL-MATCH-TEST-13|SETPIECE',runtimeDir:runtime,durationSeconds:10}),events=(r.actualEvents||[]).map(e=>e.type),expected=key.startsWith('CORNER')?'CORNER_KICK':'FREE_KICK_TAKEN';
  // This task does not repair set pieces.  Smoke only verifies that this loose-ball
  // change leaves their existing runtime safety boundaries intact; kick presence is
  // reported as observation because the known V37 set-piece workstream remains open.
  setPieceSmoke[key]={expected,kickSeen:events.includes(expected),phase:r.snapshot.phase,ballMode:r.snapshot.ball.mode,events};
  check(`${key}:SMOKE_WINDOW_COMPLETED`,Number(r.searchSeconds)>=9.9,`seconds=${r.searchSeconds}`);
  check(`${key}:SMOKE_NO_PRECOMPUTE`,r.futureOutcomePrecomputed===false);
  check(`${key}:SMOKE_NO_AUTO_HERO`,!(r.actualEvents||[]).some(e=>e.actorId===b.heroPlayerId&&['PASS','SHOT','TAKE_ON'].includes(e.type)));
}
const failed=checks.filter(x=>!x.ok);
console.log(JSON.stringify({verdict:failed.length?'FAIL':'PASS_V37_LOOSE_BALL_ROLE_ARBITRATION_TERRA',checks,timelines,setPieceSmoke},null,2));
if(failed.length)process.exit(1);
