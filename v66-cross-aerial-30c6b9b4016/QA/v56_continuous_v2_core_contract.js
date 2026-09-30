#!/usr/bin/env node
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const V2=require('../runtime/continuous_spatial_authority_v2.js');
const H=require('../live_hybrid_session_v02.js');

const sp=V2.createCoarseSpatial();
assert.strictEqual(sp.players.length,22,'V2_PLAYER_COUNT');
for(const p of sp.players){
  assert.notStrictEqual(p.intent?.type,'KICKOFF_RELEASE',`PRE_DRAWN_KICKOFF_RELEASE:${p.id}`);
  assert.notStrictEqual(p.intent?.reasonCode,'KICKOFF_RELEASE_TO_ATTACK_SHAPE',`PRE_DRAWN_KICKOFF_TARGET:${p.id}`);
  const localX=p.team==='HOME'?p.x:105-p.x;
  assert(localX<=50.001,`KICKOFF_PLAYER_OUTSIDE_OWN_HALF:${p.id}:${localX}`);
}

const session=H.createSession({seed:'V56-CONTINUITY-QA',heroTeam:'HOME',heroRole:'ST',heroPlayerId:'H-ST',continuousSpatialAuthorityV2Coarse:true});
const r=H.advanceUntilBoundary(session,{maxActions:1});
assert(['RUNNING','PAUSED','FINISHED'].includes(r.status),`BAD_STATUS:${r.status}`);
assert((r.actionsAdvanced||0)<=1,'V2_CHUNK_EXCEEDED_MAX_ACTIONS');
if(r.status==='RUNNING')assert.strictEqual(r.yielded,true,'V2_RUNNING_DID_NOT_YIELD');

const ui=fs.readFileSync(path.join(__dirname,'..','step71_hybrid_v06_ui.js'),'utf8');
assert(ui.includes("return q.get('flr_qa_force_legacy_reconstruction')!=='1'"),'V2_NOT_DEFAULT_PLAYTEST_PATH');
assert(ui.includes("H.advanceUntilBoundary(world,{maxActions:6})"),'UI_NOT_BOUNDED_CHUNK');
assert(ui.includes("if(r.status==='RUNNING'){setTimeout(searchHybrid,0);return}"),'UI_RUNNING_NOT_YIELDED');
assert(ui.includes("if(!r.boundary)return false"),'RUNNING_STATE_CAN_ENTER_BOUNDARY_HANDLER');

console.log(JSON.stringify({module:'V56_CONTINUOUS_V2_CORE_CONTRACT',verdict:'PASS',checks:{noPredrawnKickoffRelease:true,kickoffOwnHalf:true,boundedProgression:true,v2DefaultPath:true,runningBoundaryGuard:true}},null,2));
