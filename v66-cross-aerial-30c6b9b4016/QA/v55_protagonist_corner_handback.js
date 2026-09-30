#!/usr/bin/env node
'use strict';

// #1677: a protagonist SHOT may factually become BLOCK -> CORNER, but the
// same-team CORNER_KICK must not hand the scene back on its flight tick.
const assert=require('assert');
const E=require('../runtime/continuous_match_core.js');
const P=require('../runtime/protagonist_match_controller.js');
const deep=value=>JSON.parse(JSON.stringify(value));

function event(t,type,extra={}){return{t,type,text:type,...extra};}
function tracker(){return{sceneId:'HW0006',startedAt:939.2,minimumUntil:940.0,deadline:949.2,maxPresentationSeconds:10,presentationElapsed:34.6,lastPresentationTime:973.8,choiceId:'SHOT',targetId:null,targetName:null,label:'슈팅',family:'슈팅',action:null,intentUntil:null,seen:new Set(),newEvents:[],startScore:{HOME:0,AWAY:0},startPossession:'HOME',startOwnerId:'H-ST',terminalEvent:null,terminalAt:null,possessionChangedAt:null,done:false};}
function stateAtKick(){const s=P.create('V55-HW0006',{heroPlayerId:'H-ST',mode:'PLAYER_ALL'}),m=s.m;m.time=973.9;m.possession='HOME';m.restart=null;m.ball.mode='FLIGHT';m.ball.ownerId=null;m.ball.lastTouchTeam='HOME';m.events=[event(939.2,'SHOT',{actorId:'H-ST',team:'HOME'}),event(939.3,'BLOCK',{actorId:'A-LCB',team:'AWAY'}),event(940.0,'CORNER',{team:'HOME'}),event(973.9,'CORNER_KICK',{actorId:'H-LW'})];s.resultTracker=tracker();return s;}
function run(){const s=stateAtKick(),ordering=s.m.events.map(e=>`${e.type} ${e.t.toFixed(1)}`);assert.deepEqual(ordering,['SHOT 939.2','BLOCK 939.3','CORNER 940.0','CORNER_KICK 973.9'],'HW0006_ORDERING_DRIFT');P.__test.updateResultTracker(s);assert(s.resultTracker,'HANDBACK_ON_SAME_TEAM_CORNER_KICK_FLIGHT');assert.equal(s.resultTracker.cornerDelivery?.kickAt,973.9,'CORNER_DELIVERY_KICK_TIME_MISSING');assert.equal(s.resultTracker.cornerDelivery?.endReason,null,'FLIGHT_WRONGLY_TERMINATED');assert.equal(s.lastResult,null,'RESULT_FINALIZED_BEFORE_FACTUAL_CONTEST');assert.equal(s.m.ball.mode,'FLIGHT','FIXTURE_FLIGHT_DRIFT');
 s.m.time=974.1;s.m.ball.mode='LOOSE';s.m.ball.lastTouchTeam='HOME';s.m.events.push(event(974.1,'AERIAL_DUEL',{team:'HOME'}));P.__test.updateResultTracker(s);assert(!s.resultTracker,'SCENE_DID_NOT_HAND_BACK_AFTER_FACTUAL_CONTEST');assert.equal(s.lastResult?.at,974.1,'HANDBACK_NOT_AFTER_FACTUAL_CONTEST');assert.equal(s.lastResult?.choiceId,'SHOT','CHOICE_ID_DRIFT');assert.equal(s.lastResult?.targetId,null,'TARGET_ID_DRIFT');assert.equal(s.lastResult?.events.some(e=>e.type==='CORNER_KICK'),true,'CORNER_KICK_MISSING_FROM_CAUSAL_RESULT');assert.equal(s.lastResult?.events.some(e=>e.type==='AERIAL_DUEL'),true,'FACTUAL_CONTEST_MISSING_FROM_CAUSAL_RESULT');assert.equal(s.futureOutcomePrecomputed,false,'STATE_PRECOMPUTED');assert.equal(s.lastResult?.events.some(e=>e.type==='USER_CHOICE'),false,'UNSELECTED_ACTION_INJECTED');
 const capped=stateAtKick();P.__test.updateResultTracker(capped);capped.m.time=977.9;P.__test.updateResultTracker(capped);assert(!capped.resultTracker,'CORNER_DELIVERY_SAFETY_CAP_DID_NOT_HAND_BACK');assert.equal(capped.lastResult?.at,977.9,'CORNER_DELIVERY_SAFETY_CAP_TIME_DRIFT');
 const staleRestart=stateAtKick();staleRestart.m.restart={kind:'CORNER',team:'HOME'};P.__test.updateResultTracker(staleRestart);assert(staleRestart.resultTracker,'FLIGHT_WITH_STALE_RESTART_HANDBACK');const opponentKick=stateAtKick();opponentKick.m.ball.lastTouchTeam='AWAY';P.__test.updateResultTracker(opponentKick);assert(!opponentKick.resultTracker,'OPPONENT_CORNER_DELIVERY_WAS_HELD');
 return{schemaVersion:'V55_PROTAGONIST_CORNER_HANDBACK_1.0',verdict:'PASS',fixture:{sceneId:'HW0006',ordering,flightAtKick:true,handbackAt:s.lastResult.at,firstContestAt:974.1,safetyCapAt:capped.lastResult.at,cornerDelivery:deep(s.lastResult?.events.filter(e=>['CORNER_KICK','AERIAL_DUEL'].includes(e.type))||[])},scope:{sameTeamOnly:true,staleRestartFlightGuard:true},authority:{choiceId:s.lastResult.choiceId,targetId:s.lastResult.targetId,futureOutcomePrecomputed:false}};
}
if(require.main===module)try{console.log(JSON.stringify(run(),null,2));}catch(error){console.error(error.stack||error);process.exitCode=1;}
module.exports={run};
