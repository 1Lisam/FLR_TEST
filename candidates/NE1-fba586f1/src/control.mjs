// Opt-in ST play. The autonomous match has no playerControl and stays unchanged.
// Choices read current geometry only. No branch rollout, RNG draw or future result.
import {byId} from './model.mjs';
import {clamp,distance,local,world,teammates,event} from './math.mjs';
import {release,canTakeRestart} from './actions.mjs';

export function enablePlayerControl(m,actorId='H-ST'){
  if(m.tick!==0||m.playerControl||!byId(m,actorId))throw Error('CONTROL_MUST_START_WITH_MATCH');
  m.playerControl={actorId,serial:0,command:null,log:[],count:0};
}
function options(m,p){
  const r=m.restart,items=[];
  if(r?.type!=='penalty')for(const q of teammates(m,p.team)){
    const d=distance(p,q);if(q.id===p.id||d<(r?5:4)||d>40)continue;
    // Match the established current-velocity lead for ordinary passes. Restarts
    // target the selected teammate's current location, as existing restarts do.
    const lead=r?0:clamp(d/20,0,.8);
    items.push({id:'pass',targetId:q.id,kind:'pass',target:{x:clamp(q.x+q.vx*lead,1,104),y:clamp(q.y+q.vy*lead,2,66)},label:`패스 → ${q.role}`,detail:`현재 거리 ${Math.round(d)}m`});
  }
  const goal=world(p.team,{x:105,y:34},m);
  if(r?.type==='penalty'||(!r||r.type==='freeKick')&&distance(p,goal)<=35){
    for(const [id,y,label] of [['shot-left',31.6,'왼쪽을 향해 슈팅'],['shot-centre',34,'중앙을 향해 슈팅'],['shot-right',36.4,'오른쪽을 향해 슈팅']])
      items.push({id,targetId:null,kind:'shot',target:world(p.team,{x:105,y},m),label,detail:'공격 방향을 바라본 기준'});
  }
  if(!r){
    const a=local(p.team,p,m);
    for(const [id,dy,label] of [['carry',0,'앞으로 드리블'],['carry-left',-4,'왼쪽으로 드리블'],['carry-right',4,'오른쪽으로 드리블']])
      items.push({id,targetId:null,kind:'carry',target:world(p.team,{x:Math.min(103,a.x+5),y:clamp(a.y+dy,3,65)},m),label,detail:'약 5m 전진 시도 · 경합 가능'});
    items.push({id:'hold',targetId:null,kind:'hold',target:{x:p.x,y:p.y},label:'잠깐 공 지키기',detail:'1초 동안 현재 위치에서 버티기 · 경합 가능'});
  }
  return items;
}
export function preparePlayerChoice(m){
  const c=m.playerControl;if(!c)return false;
  const p=byId(m,c.actorId);if(!p)return false;
  if(c.command){
    if(m.restart||m.ball.owner!==p.id||p.controlledSince!==c.command.possessionSince)c.command=null;
    else if(m.time<c.command.until&&distance(p,c.command.target)>(c.command.kind==='hold'?-1:.7))return false;
    else c.command=null;
  }
  if(m.restart){if(m.restart.taker!==p.id||!canTakeRestart(m))return false;}
  else if(m.ball.owner!==p.id||distance(p,m.ball)>1.6)return false;
  const available=options(m,p);if(!available.length)return false;
  m.awaitingChoice={choiceId:`ST-${++c.serial}`,actorId:p.id,tick:m.tick,time:m.time,restart:m.restart?.type??null,options:available};
  return true;
}
export function applyPlayerCommand(m){
  const c=m.playerControl,command=c?.command,p=c&&byId(m,c.actorId);
  if(!command||!p||m.ball.owner!==p.id||m.restart)return;
  p.intention={...command.target,kind:command.kind==='hold'?'hold':'carry',reason:command.kind==='hold'?'사용자가 선택한 공 지키기':'사용자가 선택한 방향으로 드리블',focus:null};
}
export function commitPlayerChoice(m,choiceId,actionId,targetId){
  const pending=m.awaitingChoice,c=m.playerControl;
  if(m.status!=='playing'||!pending||!c||pending.choiceId!==choiceId||pending.actorId!==c.actorId||pending.tick!==m.tick)return false;
  const item=pending.options.find(o=>o.id===actionId&&o.targetId===targetId);
  if(!item)return false;
  const p=byId(m,c.actorId),r=m.restart;
  if(r){if(r.taker!==p.id||r.type!==pending.restart||!canTakeRestart(m))return false;}
  else if(pending.restart||m.ball.owner!==p.id||distance(p,m.ball)>1.6)return false;
  if(item.kind==='carry'||item.kind==='hold'){
    c.command={kind:item.kind,target:{...item.target},possessionSince:p.controlledSince,until:m.time+(item.kind==='hold'?1:2.2)};
  }else{
    if(r){m.ball.owner=p.id;p.controlledSince=m.time;m.restart=null;}
    if(!release(m,p,item.kind,item.target,item.targetId))throw Error('VALIDATED_PLAYER_RELEASE_FAILED');
    if(r){
      if(m.match)m.ball.restartKicker=p.id;
      if(r.type==='throw')m.ball.directThrowTeam=r.team;
      if(['throw','corner','goalKick'].includes(r.type))m.ball.offside=[];
      if(r.type==='penalty'&&m.match)m.match.penaltyLive=true;
      event(m,'restartTaken',{team:p.team,playerId:p.id,restart:r.type});
    }
  }
  const record={choiceId,actionId,targetId,label:item.label,t:m.time,tick:m.tick,restart:pending.restart};
  c.count++;c.log.push(record);if(c.log.length>80)c.log.shift();
  event(m,'playerChoice',{team:p.team,playerId:p.id,choiceId,actionId,targetId});
  m.awaitingChoice=null;m.nextPlan=m.time;applyPlayerCommand(m);return true;
}
