'use strict';
const T=require('../runtime/tactical_movement.js');

function assert(ok,msg){if(!ok)throw new Error(msg);}
function near(a,b,e=.001){return Math.abs(a-b)<=e;}
function player(id,team,role,slot,x,y){return{id,team,role,slot,x,y,vx:0,vy:0,tx:x,ty:y,action:'HOLD_BLOCK',tacticalTask:'HOLD_BLOCK',sprint:false};}
function match(){
  const ps=[
    player('D-P','HOME','CB','LCB',28,30),player('D-M','HOME','CB','RCB',27,39),player('D-C','HOME','CM','CM',24,34),player('D-F','HOME','FB','RB',29,55),
    player('A-O','AWAY','CM','CM',30,31),player('A-S','AWAY','ST','ST',35,39),player('A-W','AWAY','WF','LW',38,55)
  ];
  return{time:10,phase:'OPEN_PLAY',restart:null,ball:{mode:'CONTROLLED',ownerId:'A-O',x:30,y:31},players:ps,playersById:Object.fromEntries(ps.map(p=>[p.id,p]))};
}
function state(m,records){const coverOwnerId=Object.keys(records).find(id=>records[id].type==='COVER')||null;return{schemaVersion:'DEFENSIVE_RESPONSIBILITY_1.0',team:'HOME',phase:m.phase,coverOwnerId,records,futureOutcomePrecomputed:false};}
function rec(type,targetId,epoch=1){return{type,targetId,epoch,reason:'FOCUSED_FIXTURE',futureOutcomePrecomputed:false};}
function run(m,records){const s=state(m,records);T.executeDefensiveResponsibilityMotion(m,'HOME',m.playersById['A-O'],s);return s;}
function detectsOscillation(rows){for(let i=2;i<rows.length;i++){const a=rows[i-2],b=rows[i-1],c=rows[i];if(a.epoch===b.epoch&&b.epoch===c.epoch&&Math.hypot(a.x-c.x,a.y-c.y)<.15&&Math.hypot(a.x-b.x,a.y-b.y)>1.2)return true;}return false;}
function detectsPressCoverCollapse(press,cover,emergency=false){return!emergency&&Math.hypot(press.x-cover.x,press.y-cover.y)<1.25;}
function detectsGenericOverride(row){return['MARK','COVER'].includes(row.type)&&!String(row.rewriteReason||'').startsWith(row.type+'_');}
function detectsBoundaryFreeze(a,c){const live=Math.hypot(a.vx,a.vy)>.1||Math.hypot(a.tx-a.x,a.ty-a.y)>.1;return live&&near(c.vx,0)&&near(c.vy,0)&&near(c.tx,c.x)&&near(c.ty,c.y);}
function detectsUncausedConvergence(rows,emergency=false){if(emergency)return false;for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if((rows[i].type!==rows[j].type||rows[i].targetId!==rows[j].targetId)&&Math.hypot(rows[i].x-rows[j].x,rows[i].y-rows[j].y)<1.25)return true;return false;}

function main(){
  const controls={},mutations={};
  let m=match(),records={'D-M':rec('MARK','A-S')},s=run(m,records),mark=m.playersById['D-M'];
  assert(mark.tx<m.playersById['A-S'].x,'MARK must remain goal-side');const first={x:mark.tx,y:mark.ty,epoch:1};
  m.time+=.25;m.playersById['A-S'].y+=.28;s=run(m,records);const second={x:mark.tx,y:mark.ty,epoch:1};
  assert(Math.hypot(second.x-first.x,second.y-first.y)<.7,'stable MARK rewrite discontinuity');assert(s.records['D-M'].motion.mode==='GOAL_SIDE_MARK','mark mode missing');controls.stableMarkPursuit='PASS';
  assert(detectsOscillation([{x:33,y:38,epoch:1},{x:33,y:41,epoch:1},{x:33,y:38.02,epoch:1}]),'oscillation mutation survived');mutations.stableEpochABA='HARD_FAIL';

  m=match();records={'D-P':rec('PRESS','A-O')};s=run(m,records);assert(s.records['D-P'].motion.mode==='CONTAIN','approach must contain');
  m.time+=.25;m.playersById['A-O'].x=26;m.ball.x=26;s=run(m,records);assert(s.records['D-P'].motion.mode==='TURN_RUN'&&m.playersById['D-P'].tx<m.playersById['A-O'].x,'beaten presser must turn/run goalward');controls.containTurnRun='PASS';
  const snake={mode:'CONTAIN',defenderX:28,attackerX:26};assert(snake.mode==='CONTAIN'&&snake.defenderX>snake.attackerX,'snake-tail mutation did not remain behind');mutations.lateralMirrorFromBehind='HARD_FAIL';

  m=match();records={'D-P':rec('PRESS','A-O'),'D-C':rec('COVER',null)};s=run(m,records);const press=m.playersById['D-P'],cover=m.playersById['D-C'];
  assert(s.records['D-P'].motion.mode==='CONTAIN'&&s.records['D-C'].motion.mode==='PROTECTIVE_LANE','PRESS/COVER modes collapsed');assert(!detectsPressCoverCollapse(press,cover),'PRESS/COVER targets collapsed');controls.pressVsCover='PASS';
  assert(detectsPressCoverCollapse({x:29,y:31},{x:29,y:31}), 'cover chase mutation survived');mutations.coverBallChase='HARD_FAIL';

  m=match();records={'D-M':rec('MARK','A-S'),'D-F':rec('MARK','A-W'),'D-C':rec('COVER',null)};s=run(m,records);
  const rows=Object.keys(records).map(id=>({type:records[id].type,targetId:records[id].targetId,x:m.playersById[id].tx,y:m.playersById[id].ty}));assert(!detectsUncausedConvergence(rows),'distinct responsibilities converged');controls.distinctResponsibilities='PASS';
  assert(detectsUncausedConvergence([{type:'MARK',targetId:'A-S',x:30,y:30},{type:'COVER',targetId:null,x:30,y:30}]),'convergence mutation survived');mutations.identicalTargets='HARD_FAIL';
  assert(!detectsUncausedConvergence([{type:'PRESS',targetId:'A-O',x:9,y:32},{type:'COVER',targetId:null,x:9,y:32}],true),'emergency compact control rejected');controls.compactEmergency='PASS';

  m=match();records={'D-M':rec('MARK','A-S'),'D-C':rec('COVER',null)};run(m,records);m.playersById['D-M'].tx=m.ball.x;m.playersById['D-M'].ty=m.ball.y;m.playersById['D-M'].tacticalTask='HOLD_BLOCK';m.time+=.25;s=run(m,records);
  assert(s.records['D-M'].motion.rewriteReason==='MARK_CURRENT_GOALSIDE_INTERCEPT'&&m.playersById['D-M'].tacticalTask==='MARK_LANE_SCREEN','generic writer replaced MARK');controls.genericWriterProtected='PASS';
  assert(detectsGenericOverride({type:'MARK',rewriteReason:'GENERIC_BALL_ATTRACTION'}),'generic override mutation survived');mutations.genericLateOverride='HARD_FAIL';

  m=match();m.playersById['D-M'].vx=1.2;m.playersById['D-M'].vy=-.3;records={'D-M':rec('MARK','A-S')};run(m,records);const a={...m.playersById['D-M']};m.time+=.01;s=run(m,records);const c=m.playersById['D-M'];assert(near(a.vx,c.vx)&&near(a.vy,c.vy)&&Math.hypot(a.tx-c.tx,a.ty-c.ty)<.01,'same-epoch choice boundary changed live motion');assert(!detectsBoundaryFreeze(a,c),'choice boundary froze movement');controls.choiceBoundaryMotion='PASS';
  assert(detectsBoundaryFreeze(a,{...a,vx:0,vy:0,tx:a.x,ty:a.y}),'choice freeze mutation survived');mutations.choiceOpeningFreeze='HARD_FAIL';

  m=match();records={'D-F':rec('MARK','A-W'),'D-M':rec('MARK','A-S')};s=run(m,records);assert(Math.abs(m.playersById['D-F'].ty-m.playersById['A-W'].y)<2&&Math.abs(m.playersById['D-F'].ty-m.ball.y)>10,'wide FB attracted centrally');controls.fullbackWide='PASS';
  records['D-F']=rec('COVER',null,2);m.time+=.25;s=run(m,records);assert(s.records['D-F'].motion.continuityReason==='EPOCH_RESET','real handoff did not reset path');controls.realHandoffReset='PASS';

  const out={module:'V42_SOL4_2_DEFENSIVE_MOVEMENT',verdict:'PASS',controls,mutations,telemetrySchema:'DEFENSIVE_RESPONSIBILITY_MOTION_1.0',futureOutcomePrecomputed:false};console.log(JSON.stringify(out,null,2));
}
try{main();}catch(e){console.error(JSON.stringify({module:'V42_SOL4_2_DEFENSIVE_MOVEMENT',verdict:'FAIL',error:e.message},null,2));process.exit(1);}
