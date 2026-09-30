'use strict';
const assert=require('assert'),path=require('path'),root=path.resolve(__dirname,'..'),runtimeDir=path.join(root,'runtime');
global.FLRPG_RESTART_MOVEMENT=require('../runtime/restart_movement.js');
require('../runtime/free_kick_templates.js');require('../runtime/free_kick_wall_model.js');
require('../runtime/v37_set_piece_liveliness_patch.js');require('../runtime/corner_templates.js');
const E=require('../runtime/continuous_match_core.js');global.FLRPG_CONTINUOUS_CORE=E;
require('../runtime/v37_match_feel_patch.js');
const A=require('../live_v06_scene_authority_browser.js');global.FLRPG_LIVE_V06_SCENE_AUTHORITY=A;
const H=require('../final_match_rare_scenario_harness.js');
require('../final_match_forced_presentation_patch.js');require('../final_match_v37_forced_harness_patch.js');

function trace(r){let previous=null,out=[];for(const frame of r.frames||[]){const g=frame.players.find(p=>p.id==='H-GK');if(!g||g.action===previous)continue;previous=g.action;if(String(g.action).startsWith('GK_DIVE_'))out.push({match:frame.time,visual:frame.visualTime,action:g.action});}return out;}
function event(r,...types){return(r.actualEvents||[]).find(e=>types.includes(e.type));}
function runGk(){
  const goal=H.run('GK_SHOT_CLOSE','FINAL-MATCH-TEST-13',{runtimeDir});
  const gt=trace(goal),names=gt.map(x=>x.action);
  assert.deepStrictEqual(names,['GK_DIVE_REACT','GK_DIVE_PUSH_OFF_TRAVEL','GK_DIVE_RESULT_CONTACT','GK_DIVE_LAND','GK_DIVE_RECOVER','GK_DIVE_RECOVERED']);
  assert.deepStrictEqual(goal.actualEvents.map(e=>e.type),['SHOT','GOAL']);
  assert.deepStrictEqual(goal.snapshot.score,{HOME:0,AWAY:1});
  const react=gt[0],push=gt[1],contact=gt[2],recovered=gt.at(-1);
  assert(push.match-react.match>20,'expected compressed authoritative match-clock gap');
  assert(push.visual-react.visual<.25,'presentation REACT/PUSH gap is not contiguous');
  assert(recovered.visual-contact.visual>=.5&&recovered.visual-contact.visual<=1.3,'post-result visual hold outside contract');
  assert(goal.futureOutcomePrecomputed===false);

  const parry=H.run('GK_SHOT_CLOSE','FINAL-MATCH-TEST-4',{runtimeDir});
  const pe=event(parry,'PARRY','PARRY_SAFE','PARRY_DANGER');
  assert(pe,'representative PARRY missing');assert(parry.futureOutcomePrecomputed===false);
  const pi=parry.frames.findIndex(f=>f.time>=pe.t),live=parry.frames.slice(pi).some(f=>['FLIGHT','LOOSE'].includes(f.ball.mode)&&!f.ball.ownerId);
  assert(live,'PARRY ball did not remain live');
  const save=H.run('GK_SHOT_CLOSE','FINAL-MATCH-TEST-6',{runtimeDir}),se=event(save,'SAVE'),st=trace(save);
  assert(se,'representative SAVE missing');assert(st.some(x=>x.action==='GK_DIVE_PUSH_OFF_TRAVEL'),'SAVE dive lifecycle missing');
  return{goal:{events:goal.actualEvents.map(e=>e.type),score:goal.snapshot.score,matchGap:Number((push.match-react.match).toFixed(2)),visualReactToPush:Number((push.visual-react.visual).toFixed(2)),visualResultToRecovered:Number((recovered.visual-contact.visual).toFixed(2)),trace:gt},save:{event:se.type,trace:st.map(x=>x.action)},parry:{event:pe.type,ballLive:live}};
}
function runCorner(){
  const rows=[];for(const seed of ['FINAL-MATCH-TEST-7','7']){
    const r=H.run('CORNER_ATTACK_RIGHT',seed,{runtimeDir}),kick=event(r,'CORNER_KICK');
    assert(kick,`corner kick missing for ${seed}`);assert(r.futureOutcomePrecomputed===false);
    const post=r.snapshot.time-kick.t;assert(post>=1.5,`post-kick observation too short: ${post}`);
    const frames=r.frames.filter(f=>f.time>=kick.t-.001),tasks=frames.map(f=>f.players.filter(p=>p.team==='HOME').map(p=>p.action||p.tacticalTask));
    assert(tasks.some(xs=>xs.some(x=>/^CORNER_.*_(RUN|RESPONSE|EDGE)/.test(x))));
    assert(!tasks.some(xs=>xs.includes('CORNER_ATTACK_JOSTLE')));
    assert(!tasks.some(xs=>xs.includes('CORNER_MARK_JOSTLE')));
    assert(r.actualEvents.some(e=>e.type==='CLEARANCE'),'corner second phase/clearance missing');
    rows.push({seed,kick:Number(kick.t.toFixed(2)),searchSeconds:r.searchSeconds,postKick:Number(post.toFixed(2)),events:r.actualEvents.map(e=>e.type)});
  }return rows;
}
const result={module:'V37_FINAL_GK_CORNER_GATE',gk:runGk(),corner:runCorner()};
console.log(JSON.stringify(result,null,2));
