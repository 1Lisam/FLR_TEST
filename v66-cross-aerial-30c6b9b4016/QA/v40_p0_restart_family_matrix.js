'use strict';
const assert=require('assert');
const P=require('./v40_p0_set_piece_wrong_end_detector.js');
const kinds=['CORNER','FREE_KICK','OFFSIDE','GOAL_KICK','THROW_IN','PENALTY'];
const rows=[];
for(const kind of kinds)for(const team of ['HOME','AWAY'])for(const lane of ['LEFT','RIGHT']){
  const c={kind,restartTeam:team,defTeam:team==='HOME'?'AWAY':'HOME',lane},x=P.runtimeSetup(c),goal={restart:{x:P.goalX(team),y:34},defending:{x:P.goalX(c.defTeam),y:34}};
  const targets=[];for(const id of x.setup.requiredIds){const p=x.m.playersById[id],t=x.setup.targets[id];if(!p||!t)continue;targets.push({id,playerRole:p.role,playerTeam:p.team,task:t.task,target:{x:Number(t.x.toFixed(3)),y:Number(t.y.toFixed(3))},distanceToRestartGoal:Number(P.distance(t,goal.restart).toFixed(3)),distanceToOwnGoal:Number(P.distance(t,goal[p.team===team?'restart':'defending']).toFixed(3))});}
  rows.push({kind,restartTeam:team,lane,requiredPlayers:targets.length,targets});
}
const relevant=rows.filter(r=>['CORNER','FREE_KICK','OFFSIDE'].includes(r.kind));
const wrongRelevant=relevant.flatMap(r=>r.targets.filter(t=>t.playerTeam!==r.restartTeam&&t.distanceToOwnGoal>t.distanceToRestartGoal).map(t=>({...t,case:`${r.kind}_${r.restartTeam}_${r.lane}`})));
const out={module:'V40_P0_RESTART_FAMILY_MATRIX',schemaVersion:'V40_P0_RESTART_MATRIX_1.0',verdict:wrongRelevant.length?'BLOCKED':'PASS',matrix:rows,summary:{restartKinds:kinds,rows:rows.length,relevantRequiredTargets:relevant.reduce((n,r)=>n+r.requiredPlayers,0),wrongEndRequiredDefenders:wrongRelevant.length},policy:'All six restart families are generated through runtime/restart_movement.js; wrong-end blocking is limited to restart-relative defensive danger targets.'};
if(require.main===module){console.log(JSON.stringify(out,null,2));if(out.verdict!=='PASS')process.exitCode=11;}
module.exports=out;
