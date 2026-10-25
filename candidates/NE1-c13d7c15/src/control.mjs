// Opt-in ST play. The autonomous match has no playerControl and stays unchanged.
// Choices read current geometry only. No branch rollout, RNG draw or future result.
import {byId} from './model.mjs';
import {clamp,distance,local,world,teammates,opponents,event,passLaneSafety,segmentPoint} from './math.mjs';
import {release,canTakeRestart} from './actions.mjs';

export function enablePlayerControl(m,actorId='H-ST'){
  if(m.tick!==0||m.playerControl||!byId(m,actorId))throw Error('CONTROL_MUST_START_WITH_MATCH');
  m.playerControl={actorId,serial:0,command:null,log:[],count:0,episodeStage:0,restartKey:null,scene:null,sceneSerial:0,lastSceneEnd:null};
}
// An action is not an attack. Receipts, free balls and rebounds keep the scene
// alive; only facts already realised in this match can close it.
export function updatePlayerScene(m){
  const c=m.playerControl,s=c?.scene;if(!s)return;
  const p=byId(m,c.actorId),owner=byId(m,m.ball.owner);
  const recent=m.events.filter(e=>e.id>s.eventId);
  let code,reason;
  const goal=recent.find(e=>e.type==='goal');
  if(goal){code='goal';reason=goal.team===p.team?'득점으로 공격이 마무리됐습니다.':'상대 득점으로 장면이 끝났습니다.';}
  else if(m.status==='ended'){code='fullTime';reason='경기 종료 휘슬이 울렸습니다.';}
  else if(m.match.period!==s.period){code='halfTime';reason='전반 종료로 공격이 끝났습니다.';}
  else if(m.restart){
    code=m.restart.type;
    const team=m.restart.team===p.team?'우리 팀':'상대 팀';
    if(recent.some(e=>e.type==='offside'))reason='오프사이드가 선언돼 공격이 끝났습니다.';
    else if(recent.some(e=>e.type==='foul'))reason=`파울로 플레이가 멈췄습니다. ${team}의 ${code==='penalty'?'페널티킥':'프리킥'}입니다.`;
    else reason=({throw:`공이 터치라인을 나갔습니다. ${team}의 스로인입니다.`,corner:`공이 골라인을 나갔습니다. ${team}의 코너킥입니다.`,goalKick:`공이 골라인을 나갔습니다. ${team}의 골킥입니다.`,freeKick:`반칙으로 플레이가 멈췄습니다. ${team}의 프리킥입니다.`})[code]??`${team}의 재시작으로 플레이가 멈췄습니다.`;
  }else if(owner&&owner.team!==p.team){code=m.ball.heldByKeeper?'keeper':'possessionLost';reason=m.ball.heldByKeeper?'상대 골키퍼가 공을 확보해 공격이 끝났습니다.':`상대 ${owner.role}이 공을 확보해 공격이 끝났습니다.`;}
  else if(owner&&owner.id!==p.id&&local(p.team,m.ball,m).x<52.5){code='recycle';reason='우리 진영으로 공을 돌려 공격을 다시 준비합니다.';}
  if(!code)return;
  c.lastSceneEnd={id:s.id,code,reason,time:m.time,tick:m.tick,start:s.start,choices:c.count-s.firstChoice+1};
  c.scene=null;c.command=null;c.episodeStage=0;
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
  if(a.x<60)return null;
  const runners=teammates(m,p.team).filter(q=>{const b=local(p.team,q,m);return q.id!==p.id&&q.role!=='GK'&&distance(p,q)>=6&&distance(p,q)<=32&&b.x>=Math.max(88,a.x+6)&&Math.abs(b.y-34)<22;});
  if(runners.some(q=>passLaneSafety(m,origin,q,'pass',true)>.4))return {stage:2,reason:'골문 앞 동료에게 연결할 찬스'};
  if(a.x>=80&&Math.abs(a.y-34)<20&&opponents(m,p.team).some(q=>distance(p,q)<5&&local(p.team,q,m).x>a.x))return {stage:2,reason:'박스 앞 수비와 맞대결'};
  return null;
}
export function interactionOptions(m,p){
  const r=m.restart,items=[],a=local(p.team,p,m),rivals=opponents(m,p.team),origin={...p,x:m.ball.x,y:m.ball.y};
  const candidates=teammates(m,p.team).filter(q=>q.id!==p.id&&q.role!=='GK').map(q=>{const d=distance(p,q),forward=local(p.team,q,m).x-a.x,space=Math.min(...rivals.map(v=>distance(v,q))),safety=passLaneSafety(m,origin,q,'pass',true),blockers=rivals.filter(v=>{const s=segmentPoint(v,origin,q);return s.t>.03&&s.t<.98&&s.d<1.5;}).length;return {q,d,forward,space,safety,blockers};}).filter(c=>c.d>=(r?5:4)&&c.d<=40);
  // Like the legacy target-first controller: current meaningful receivers plus
  // one genuinely open recycling outlet; never the complete team by distance alone.
  const support=candidates.filter(c=>c.forward>=-20&&c.forward< -6&&c.d<=28&&c.space>=3&&c.safety>.6).sort((a,b)=>(b.safety*5+b.space*.2-b.d*.025)-(a.safety*5+a.space*.2-a.d*.025))[0];
  if(r?.type!=='penalty')for(const c of candidates){
    const boxReceiver=r?.type==='corner'&&local(p.team,c.q,m).x>=80&&Math.abs(c.q.y-34)<=22;
    if(!(c===support||boxReceiver||c.forward>=-6&&c.space>=.35&&(c.safety>.15||c.blockers<=1)))continue;
    const {q,d}=c;
    const bounded=t=>({x:clamp(t.x,1,104),y:clamp(t.y,2,66)}),a=local(p.team,p,m),b=local(p.team,q,m);
    items.push({id:'pass',targetId:q.id,kind:'pass',delivery:'ground',target:bounded(q),label:`땅볼 패스 → ${q.role}`,shortLabel:'땅볼 패스',detail:'현재 발앞으로 낮게 연결 · 가로채기 가능'});
    if(!r&&q.role!=='GK'&&b.x>=a.x-2&&b.x<100){
      const target=world(p.team,{x:Math.min(103,b.x+clamp(d*.2,3,8)),y:b.y},m);
      items.push({id:'through',targetId:q.id,kind:'pass',delivery:'ground',target:bounded(target),label:`공간 패스 → ${q.role}`,shortLabel:'앞 공간 패스',detail:'동료 앞 공간으로 낮게 보내기'});
    }
    if(d>=12&&r?.type!=='throw')items.push({id:'loft',targetId:q.id,kind:'pass',delivery:'loft',target:bounded({x:q.x+q.vx*.6,y:q.y+q.vy*.6}),label:`로빙 패스 → ${q.role}`,shortLabel:'로빙 패스',detail:'공을 띄워 동료 쪽으로 보내기 · 경합 가능'});
  }
  const goal=world(p.team,{x:105,y:34},m);
  if(r?.type==='penalty'||(!r||r.type==='freeKick')&&distance(p,goal)<=35){
    for(const [id,y,label] of [['shot-left',31.6,'왼쪽을 향해 슈팅'],['shot-centre',34,'중앙을 향해 슈팅'],['shot-right',36.4,'오른쪽을 향해 슈팅']])
      items.push({id,targetId:null,kind:'shot',target:world(p.team,{x:105,y},m),label,detail:'공격 방향을 바라본 기준'});
  }
  if(!r){
    const a=local(p.team,p,m);
    const facingRival=rivals.some(q=>distance(p,q)<7&&local(p.team,q,m).x>a.x);
    for(const [id,dy,label] of [['carry',0,'볼 전진'],['carry-left',-4,'돌파 시도 · 왼쪽'],['carry-right',4,'돌파 시도 · 오른쪽']]){
      const target=world(p.team,{x:Math.min(103,a.x+5),y:clamp(a.y+dy,3,65)},m);
      if(distance(p,target)<1||id!=='carry'&&!facingRival)continue;
      if(id==='carry'&&rivals.some(q=>{const s=segmentPoint(q,p,target);return s.t>.1&&s.d<.75;}))continue;
      items.push({id,targetId:null,kind:'carry',target,label,detail:'선택 방향으로 실제 이동 · 경합에 지면 공을 잃을 수 있음'});
    }
    if(rivals.some(q=>distance(p,q)<4.5))items.push({id:'hold',targetId:null,kind:'hold',target:{x:p.x,y:p.y},label:'볼 지키기',detail:'1초 동안 현재 위치에서 버티기 · 경합 가능'});
  }
  return items;
}
export function preparePlayerChoice(m){
  const c=m.playerControl;if(!c)return false;
  updatePlayerScene(m);
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
  const moment=c.scene?{stage:importantMoment(m,p)?.stage??1,reason:'같은 공격을 이어갈 선택'}:importantMoment(m,p);
  if(!moment||!c.scene&&moment.stage<=c.episodeStage)return false;
  const available=interactionOptions(m,p);if(!available.length)return false;
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
  if(!c.scene)c.scene={id:++c.sceneSerial,start:m.time,period:m.match.period,eventId:m.eventId,firstChoice:c.count};
  event(m,'playerChoice',{team:p.team,playerId:p.id,choiceId,actionId,targetId});
  m.awaitingChoice=null;m.nextPlan=m.time;applyPlayerCommand(m);return true;
}
