import {DT,createMatch,community} from './model.mjs';
import {plan} from './intentions.mjs';
import {movePlayers,moveBall,restart} from './physics.mjs';
import {chooseAction,takeRestart} from './actions.mjs';
import {event,world} from './math.mjs';
import {preparePlayerChoice,applyPlayerCommand,updatePlayerScene} from './control.mjs';
export {DT,createMatch};

export function step(m){
  // This boundary is before RNG, plans, physics and events. A future choice can
  // stop the very same simulation; no hidden continuation or speculative result.
  if(m.status!=='playing'||m.awaitingChoice)return false;
  if(m.match?.penaltyLive&&(m.ball.owner||m.restart&&m.restart.type!=='penalty'||Math.hypot(m.ball.vx,m.ball.vy,m.ball.vz)<=.1))m.match.penaltyLive=false;
  const pendingPenalty=m.match&&(m.restart?.type==='penalty'||m.match.penaltyLive&&!m.restart&&!m.ball.owner&&Math.hypot(m.ball.vx,m.ball.vy,m.ball.vz)>.1);
  if(m.time+1e-7>=m.endAt&&!pendingPenalty){m.status='ended';event(m,m.endAt===5400?'fullTime':'previewEnd');m.summary=community(m);updatePlayerScene(m);return false;}
  if(m.match?.period===1&&m.time+1e-7>=m.match.halfAt&&!pendingPenalty){
    event(m,'halfTime',{score:[...m.score]});m.match.period=2;
    // Only the explicit half-time interval resets player positions. All ordinary
    // possession changes and restarts continue through the existing motor.
    for(const p of m.players){Object.assign(p,world(p.team,{x:p.role==='GK'?4:p.base.x*.7,y:p.base.y},m),{vx:0,vy:0,facing:p.team===0?Math.PI:0,lookFacing:p.team===0?Math.PI:0});p.intention={x:p.x,y:p.y,kind:'shape',reason:'하프타임 후 진영 교대'};}
    const taker=m.players.find(p=>p.team===1&&p.role.includes('ST'));
    restart(m,'kickoff',1,{x:52.5,y:34});m.restart.taker=taker.id;
    event(m,'secondHalf',{team:1});
  }
  if(preparePlayerChoice(m))return false;
  if(m.time+1e-8>=m.nextPlan){plan(m);m.nextPlan=m.time+.2;}
  applyPlayerCommand(m);
  if(m.restart)takeRestart(m);else chooseAction(m);
  movePlayers(m,DT);moveBall(m,DT);
  m.tick++;m.time=m.tick*DT;updatePlayerScene(m);return true;
}
export function advance(m,ticks){for(let n=0;n<ticks;n++)if(!step(m))break;}
export function snapshot(m){return {time:m.time,tick:m.tick,...m.match?{period:m.match.period,endAt:m.endAt}:{},ball:{...m.ball,offside:[...m.ball.offside]},players:m.players.map(p=>({id:p.id,team:p.team,role:p.role,x:p.x,y:p.y,vx:p.vx,vy:p.vy,facing:p.facing,lookFacing:p.lookFacing??p.facing,intention:{...p.intention}})),score:[...m.score],restart:m.restart?{...m.restart}:null};}

