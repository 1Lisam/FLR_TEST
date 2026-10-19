import {clamp,distance,local,world,opponents,teammates,segmentPoint,random,event} from './math.mjs';
import {byId,tendencies} from './model.mjs';

export function release(m,p,kind,target,targetId=null){
  if(m.ball.owner!==p.id||distance(p,m.ball)>1.6)return false;
  const dx=target.x-m.ball.x,dy=target.y-m.ball.y,d=Math.hypot(dx,dy);
  const error=(random(m)+random(m)-1)*(1-p.skill)*(kind==='shot'?.15:.085);
  const angle=Math.atan2(dy,dx)+error;
  const speed=kind==='shot'?21+p.skill*7:clamp(Math.sqrt(2*.85*d)+6,9,23);
  m.ball.owner=null;m.ball.heldByKeeper=false;m.ball.vx=Math.cos(angle)*speed;m.ball.vy=Math.sin(angle)*speed;
  m.ball.vz=kind==='shot'?1.1+random(m)*1.5:0;m.ball.z=Math.max(0,m.ball.z);
  m.ball.lastKicker=p.id;m.ball.kickTime=m.time;m.ball.target=targetId;m.ball.kind=kind;
  m.ball.directThrowTeam=null;
  m.lastTouchTeam=p.team;
  const xs=opponents(m,p.team).map(q=>local(p.team,q).x).sort((a,b)=>b-a);
  const line=Math.max(52.5,local(p.team,m.ball).x,xs[1]??105);
  m.ball.offside=kind==='pass'?teammates(m,p.team).filter(q=>q.id!==p.id&&local(p.team,q).x>line+.1).map(q=>q.id):[];
  p.action=kind;p.actionUntil=m.time+.4;p.nextAction=m.time+.6;
  m.stats[p.team][kind==='shot'?'shots':'passes']++;
  event(m,kind,{team:p.team,playerId:p.id,targetId,x:m.ball.x,y:m.ball.y,toX:target.x,toY:target.y});
  m.nextPlan=m.time;return true;
}
function laneSafety(m,p,target){
  const d=distance(p,target),speed=clamp(Math.sqrt(1.7*d)+6,9,23);
  let safety=1;
  for(const q of opponents(m,p.team)){
    const s=segmentPoint(q,p,target);
    if(s.t<.04||s.t>.98)continue;
    const available=s.t*d/speed;
    // Current geometry and travel estimates, no simulated future or sampled outcome.
    const intercept=(s.d-.8)/q.maxSpeed;
    safety=Math.min(safety,clamp((intercept-available+.25)/.8,0,1));
  }
  return safety;
}
export function chooseAction(m){
  if(m.awaitingChoice||m.restart)return;
  const p=byId(m,m.ball.owner);if(!p||m.time<p.nextAction)return;
  p.nextAction=m.time+.35;
  const a=local(p.team,p),rivals=opponents(m,p.team),nearest=Math.min(...rivals.map(q=>distance(q,p)));
  const goal=world(p.team,{x:105,y:34}),goalDist=distance(p,goal);
  const shotLane=laneSafety(m,p,goal);
  if(p.role!=='GK'&&goalDist<24&&Math.abs(a.y-34)<19&&m.time-p.controlledSince>.4){
    const score=clamp((25-goalDist)/16,0,1)*.9+shotLane*.5;
    if(score>.68||goalDist<11){
      const aimed=world(p.team,{x:105,y:34+(random(m)-.5)*5});
      release(m,p,'shot',aimed);return;
    }
  }
  let best=null,bestScore=-Infinity;
  for(const q of teammates(m,p.team)){
    if(q.id===p.id)continue;
    const d=distance(p,q);if(d<4||d>40)continue;
    const b=local(p.team,q),lead=clamp(d/20,0,.8);
    const target={x:clamp(q.x+q.vx*lead,1,104),y:clamp(q.y+q.vy*lead,2,66)};
    const safety=laneSafety(m,p,target),space=Math.min(...rivals.map(r=>distance(r,q)));
    const progress=b.x-a.x;
    let score=safety*5+clamp(space,0,10)*.22+progress*.065-d*.025;
    if(progress<0)score-=.35;
    if(q.role==='GK'&&a.x>40)score-=3;
    if(m.ball.lastKicker===q.id&&m.time-m.ball.kickTime<4)score-=1.4;
    if(safety<.18)score-=4;
    if(score>bestScore){bestScore=score;best={q,target,safety};}
  }
  const age=m.time-p.controlledSince;
  const shouldRelease=p.role==='GK'?age>1:nearest<3?age>.45:age>1.8&&bestScore>5.1;
  if(best&&shouldRelease&&best.safety>.13)release(m,p,'pass',best.target,best.q.id);
  // No forced timed pass. If lanes are shut the actor continues the current carry.
}
export function takeRestart(m){
  const r=m.restart;if(!r||m.time-r.since<1.2)return;
  const p=byId(m,r.taker);if(!p||distance(p,r)>1.1)return;
  if(m.players.some(q=>q.team!==r.team&&distance(q,r)<(r.type==='throw'?1.8:8.8)))return;
  m.ball.owner=p.id;p.controlledSince=m.time;
  let candidates=teammates(m,p.team).filter(q=>q.id!==p.id&&distance(q,p)>5&&distance(q,p)<40);
  if(!candidates.length)return;
  candidates.sort((a,b)=>{
    const score=q=>laneSafety(m,p,q)*5-Math.abs(distance(p,q)-16)*.06;
    return score(b)-score(a);
  });
  const q=candidates[0];m.restart=null;
  release(m,p,'pass',q,q.id);
  if(r.type==='throw')m.ball.directThrowTeam=r.team;
  if(['throw','corner','goalKick'].includes(r.type))m.ball.offside=[];
  event(m,'restartTaken',{team:p.team,playerId:p.id,restart:r.type});
}
