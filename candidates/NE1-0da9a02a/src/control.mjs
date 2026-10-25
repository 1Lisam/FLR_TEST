// Opt-in ST play. The autonomous match has no playerControl and stays unchanged.
// Choices read current geometry only. No branch rollout, RNG draw or future result.
import {byId} from './model.mjs';
import {clamp,distance,local,world,teammates,opponents,event,passLaneSafety} from './math.mjs';
import {release,canTakeRestart} from './actions.mjs';

export function enablePlayerControl(m,actorId='H-ST'){
  if(m.tick!==0||m.playerControl||!byId(m,actorId))throw Error('CONTROL_MUST_START_WITH_MATCH');
  m.playerControl={actorId,serial:0,command:null,log:[],count:0,episodeStage:0,restartKey:null};
}
// Scene entry is based only on the present attack, not possession count, a
// time quota, a predicted result, or a scheduled invitation every few seconds.
export function importantMoment(m,p){
  const a=local(p.team,p,m),r=m.restart;
  if(r){
    if(r.taker!==p.id)return null;
    if(r.type==='penalty')return {stage:3,reason:'페널티킥 기회'};
    if(r.type==='corner'||r.type==='freeKick'&&a.x>=68)return {stage:2,reason:'공격 지역 재시작'};
    return null;
  }
  const goal=world(p.team,{x:105,y:34},m),d=distance(p,goal),origin={...p,x:m.ball.x,y:m.ball.y};
  const lane=passLaneSafety(m,origin,goal,'shot');
  if(d<11&&Math.abs(a.y-34)<12)return {stage:3,reason:'골문 앞 마무리 기회'};
  if(d<24&&Math.abs(a.y-34)<19&&lane>.35)return {stage:2,reason:'슈팅 기회'};
  if(a.x<55)return null;
  const runners=teammates(m,p.team).filter(q=>q.id!==p.id&&q.role!=='GK'&&distance(p,q)>=6&&distance(p,q)<=32&&local(p.team,q,m).x>=Math.max(75,a.x+6));
  if(runners.some(q=>passLaneSafety(m,origin,q,'pass',true)>.4))return {stage:1,reason:'전방 동료에게 연결할 기회'};
  if(a.x>=68&&opponents(m,p.team).some(q=>distance(p,q)<3))return {stage:1,reason:'공격 지역에서 압박 대응'};
  return null;
}
function options(m,p){
  const r=m.restart,items=[];
  if(r?.type!=='penalty')for(const q of teammates(m,p.team)){
    const d=distance(p,q);if(q.id===p.id||d<(r?5:4)||d>40)continue;
    const bounded=t=>({x:clamp(t.x,1,104),y:clamp(t.y,2,66)}),a=local(p.team,p,m),b=local(p.team,q,m);
    items.push({id:'pass',targetId:q.id,kind:'pass',delivery:'ground',target:bounded(q),label:`발앞 패스 → ${q.role}`,shortLabel:'발앞 패스',detail:'현재 발앞으로 낮게 연결'});
    if(!r&&q.role!=='GK'&&b.x>=a.x-2&&b.x<100){
      const target=world(p.team,{x:Math.min(103,b.x+clamp(d*.2,3,8)),y:b.y},m);
      items.push({id:'through',targetId:q.id,kind:'pass',delivery:'ground',target:bounded(target),label:`공간 패스 → ${q.role}`,shortLabel:'앞 공간 패스',detail:'동료 앞 공간으로 낮게 보내기'});
    }
    if(d>=12&&r?.type!=='throw')items.push({id:'loft',targetId:q.id,kind:'pass',delivery:'loft',target:bounded({x:q.x+q.vx*.6,y:q.y+q.vy*.6}),label:`띄워 보내기 → ${q.role}`,shortLabel:'띄워 보내기',detail:'공을 띄워 동료 쪽으로 보내기'});
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
  const restartKey=m.restart?`${m.restart.type}:${m.restart.since}:${m.restart.team}`:null;
  if(restartKey&&restartKey!==c.restartKey)c.episodeStage=0;
  c.restartKey=restartKey;
  const owner=byId(m,m.ball.owner);
  if(owner&&owner.team!==p.team)c.episodeStage=0;
  if(c.command){
    if(m.restart||m.ball.owner!==p.id||p.controlledSince!==c.command.possessionSince)c.command=null;
    else if(m.time<c.command.until&&distance(p,c.command.target)>(c.command.kind==='hold'?-1:.7))return false;
    else c.command=null;
  }
  if(m.restart){if(m.restart.taker!==p.id||!canTakeRestart(m))return false;}
  else if(m.ball.owner!==p.id||distance(p,m.ball)>1.6)return false;
  const moment=importantMoment(m,p);
  if(!moment||moment.stage<=c.episodeStage)return false;
  const available=options(m,p);if(!available.length)return false;
  m.awaitingChoice={choiceId:`ST-${++c.serial}`,actorId:p.id,tick:m.tick,time:m.time,restart:m.restart?.type??null,moment,options:available};
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
    if(!release(m,p,item.kind,item.target,item.targetId,item.delivery??null))throw Error('VALIDATED_PLAYER_RELEASE_FAILED');
    if(r){
      if(m.match)m.ball.restartKicker=p.id;
      if(r.type==='throw')m.ball.directThrowTeam=r.team;
      if(['throw','corner','goalKick'].includes(r.type))m.ball.offside=[];
      if(r.type==='penalty'&&m.match)m.match.penaltyLive=true;
      event(m,'restartTaken',{team:p.team,playerId:p.id,restart:r.type});
    }
  }
  c.episodeStage=Math.max(c.episodeStage,pending.moment.stage);
  const record={choiceId,actionId,targetId,label:item.label,t:m.time,tick:m.tick,restart:pending.restart,moment:pending.moment.reason};
  c.count++;c.log.push(record);if(c.log.length>80)c.log.shift();
  event(m,'playerChoice',{team:p.team,playerId:p.id,choiceId,actionId,targetId});
  m.awaitingChoice=null;m.nextPlan=m.time;applyPlayerCommand(m);return true;
}
