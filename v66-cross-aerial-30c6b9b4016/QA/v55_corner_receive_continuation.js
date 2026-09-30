#!/usr/bin/env node
'use strict';

const assert=require('assert');
const E=require('../runtime/continuous_match_core.js');
const P=require('../runtime/protagonist_match_controller.js');
const B=E.choiceActionBridge();

function tracker(){return{sceneId:'HW0006',startedAt:939.2,minimumUntil:940.0,deadline:981.0,maxPresentationSeconds:10,presentationElapsed:34.6,lastPresentationTime:973.8,choiceId:'SHOT',targetId:null,targetName:null,label:'슈팅',family:'슈팅',action:null,intentUntil:null,seen:new Set(),newEvents:[],startScore:{HOME:2,AWAY:0},startPossession:'HOME',startOwnerId:'H-ST',terminalEvent:null,terminalAt:null,possessionChangedAt:null,done:false};}
function fixture(){
  const s=P.create('LIVE-V03-1-H-ST',{heroPlayerId:'H-ST',mode:'PLAYER_ALL'}),m=s.m,h=B.playerById(m,'H-ST');
  h.x=h.tx=94;h.y=h.ty=34;h.bodyAngle=0;
  for(const p of m.players.filter(p=>p.team==='AWAY')){p.x=p.tx=70;p.y=p.ty=10+(p.id.charCodeAt(2)%48);}
  s.currentScene={sceneId:'HW0006',episodeId:'HW0006-EP',postFrames:[],checkpointInspect:{team:'HOME'}};
  s.activeEpisode={id:'HW0006-EP',team:'HOME',startedAt:939.2,hardUntil:985,until:980,lastChoiceAt:939.2};
  s.resultTracker=tracker();m.protagonistExplicitActionRequired=true;m.score={HOME:2,AWAY:0};m.possession='HOME';
  return{s,m,h};
}

const {s,m,h}=fixture();
m.time=939.2;B.event(m,'SHOT','블루팀 ST이 슈팅을 시도합니다.');
m.time=939.3;B.event(m,'BLOCK','레드팀 RCB이 슈팅을 막았습니다.');
m.time=940.0;B.event(m,'CORNER','블루팀의 코너킥입니다.');
m.time=973.9;B.event(m,'CORNER_KICK','블루팀 LW이 코너킥 크로스를 올립니다.');
m.ball={...m.ball,mode:'FLIGHT',kind:'CROSS',ownerId:null,lastTouchTeam:'HOME',lastTouchPlayer:'H-LW',x:95,y:34,vx:12,vy:0};
P.__test.updateResultTracker(s);
assert(s.resultTracker,'R1693_FLIGHT_GUARD_REGRESSED');
assert.strictEqual(s.lastResult,null,'R1693_FLIGHT_CREATED_RESULT');
assert.strictEqual(s.forceNextChoice,false,'R1693_FLIGHT_OPENED_FOLLOWUP');

m.time=975.0;B.setControlled(m,h,false);B.event(m,'CROSS_RECEIVE','블루팀 ST이 박스 안에서 크로스를 받아냈습니다.');
P.__test.updateResultTracker(s);
assert.strictEqual(s.resultTracker,null,'R1693_SHOT_ORIGIN_RECEIVE_STILL_TERMINAL');
assert.strictEqual(s.lastResult,null,'R1693_RECEIVE_EMITTED_SCENE_RESULT');
assert.strictEqual(s.forceNextChoice,true,'R1693_RECEIVE_DID_NOT_ARM_CONTINUATION');
assert.strictEqual(s.forceFromSceneId,'HW0006','R1693_CONTINUATION_LOST_SCENE_ID');
assert.strictEqual(s.activeEpisode?.id,'HW0006-EP','R1693_RECEIVE_ENDED_2D_EPISODE');
assert.strictEqual(m.ball.mode,'CONTROLLED','R1693_RECEIVE_NOT_CONTROLLED');
assert.strictEqual(m.ball.ownerId,'H-ST','R1693_RECEIVE_OWNER_DRIFT');
assert.strictEqual(m.possession,'HOME','R1693_RECEIVE_POSSESSION_DRIFT');
assert.strictEqual(m.userChoiceLog?.length||0,0,'R1693_UNSELECTED_ACTION_INJECTED');
assert.strictEqual(s.futureOutcomePrecomputed,false,'R1693_FUTURE_OUTCOME_PRECOMPUTED');

h.action='HOLD_BALL';h.tacticalTask='HOLD_BALL';h.nextThink=m.time;
P.step(s,.10);
assert(s.pending?.chained,'R1693_RECEIVE_DID_NOT_REOPEN_CHAINED_CHOICE');
assert.strictEqual(s.pending?.continuationFromSceneId,'HW0006','R1693_CHAINED_SCENE_LINK_LOST');
assert.strictEqual(m.userChoiceLog?.length||0,0,'R1693_CHAIN_INJECTED_UNSELECTED_ACTION');
assert.strictEqual(s.pending?.futureOutcomePrecomputed,false,'R1693_CHAIN_PRECOMPUTED_OUTCOME');

console.log(JSON.stringify({module:'V55_R1693_SHOT_CORNER_RECEIVE_CONTINUATION',verdict:'PASS',ordering:[['SHOT',939.2],['BLOCK',939.3],['CORNER',940.0],['CORNER_KICK',973.9],['CROSS_RECEIVE',975.0]],checks:{shotOriginPathExercised:true,flightGuardPreserved:true,sameTeamControlledReceiveContinues:true,episodeRetained:true,chainedChoiceReopened:true,noUnselectedAction:true,noFutureOutcomePrecomputed:true}},null,2));
