import {DT,createMatch,community} from './model.mjs';
import {plan} from './intentions.mjs';
import {movePlayers,moveBall} from './physics.mjs';
import {chooseAction,takeRestart} from './actions.mjs';
import {event} from './math.mjs';
export {DT,createMatch};

export function step(m){
  // This boundary is before RNG, plans, physics and events. A future choice can
  // stop the very same simulation; no hidden continuation or speculative result.
  if(m.status!=='playing'||m.awaitingChoice)return false;
  if(m.time+1e-7>=m.endAt){m.status='ended';event(m,'previewEnd');m.summary=community(m);return false;}
  if(m.time+1e-8>=m.nextPlan){plan(m);m.nextPlan=m.time+.2;}
  if(m.restart)takeRestart(m);else chooseAction(m);
  movePlayers(m,DT);moveBall(m,DT);
  m.tick++;m.time=m.tick*DT;return true;
}
export function advance(m,ticks){for(let n=0;n<ticks;n++)if(!step(m))break;}
export function snapshot(m){return {time:m.time,tick:m.tick,ball:{...m.ball,offside:[...m.ball.offside]},players:m.players.map(p=>({id:p.id,team:p.team,role:p.role,x:p.x,y:p.y,vx:p.vx,vy:p.vy,facing:p.facing,intention:{...p.intention}})),score:[...m.score],restart:m.restart?{...m.restart}:null};}
