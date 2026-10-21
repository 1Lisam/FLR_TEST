import {clamp,distance,local,world,opponents,teammates,segmentPoint,random,event,passLaneSafety as laneSafety} from './math.mjs';
import {byId,tendencies} from './model.mjs';
import {restartReady} from './rules.mjs';

export function release(m,p,kind,target,targetId=null){
  if(m.ball.owner!==p.id||distance(p,m.ball)>1.6)return false;
  const dx=target.x-m.ball.x,dy=target.y-m.ball.y,d=Math.hypot(dx,dy);
  const error=(random(m)+random(m)-1)*(1-p.skill)*(kind==='shot'?.15:.085);
  const angle=Math.atan2(dy,dx)+error;
  // Short passes retain their rolling delivery. A long delivery has actual
  // launch velocity and gravity, rather than an airborne drawing of a ground pass.
  const forward=(target.x-m.ball.x)*((p.team^(m.match?.period===2?1:0))?-1:1);
  const loft=kind==='pass'&&d>=26&&forward>=12,flightTime=clamp(d/15,1.45,2.2);
  const speed=kind==='shot'?21+p.skill*7:loft?d/flightTime+.06*flightTime:clamp(Math.sqrt(2*.85*d)+6,9,23);
  m.ball.owner=null;m.ball.heldByKeeper=false;m.ball.vx=Math.cos(angle)*speed;m.ball.vy=Math.sin(angle)*speed;
  m.ball.vz=kind==='shot'?1.1+random(m)*5:loft?4.905*flightTime:0;m.ball.z=Math.max(0,m.ball.z);
  m.ball.lastKicker=p.id;m.ball.kickTime=m.time;m.ball.target=targetId;m.ball.kind=kind;
  m.ball.directThrowTeam=null;
  if(m.match)m.ball.restartKicker=null;
  m.lastTouchTeam=p.team;
  const xs=opponents(m,p.team).map(q=>local(p.team,q,m).x).sort((a,b)=>b-a);
  const line=Math.max(52.5,local(p.team,m.ball,m).x,xs[1]??105);
  m.ball.offside=kind==='pass'?teammates(m,p.team).filter(q=>q.id!==p.id&&local(p.team,q,m).x>line+.1).map(q=>q.id):[];
  p.action=kind;p.actionUntil=m.time+.4;p.nextAction=m.time+.6;
  m.stats[p.team][kind==='shot'?'shots':'passes']++;
  event(m,kind,{team:p.team,playerId:p.id,targetId,x:m.ball.x,y:m.ball.y,toX:target.x,toY:target.y,...loft?{delivery:'loft'}:{}});
  m.nextPlan=m.time;return true;
}
export function chooseAction(m){
  if(m.awaitingChoice||m.restart)return;
  const p=byId(m,m.ball.owner);if(!p||m.time<p.nextAction)return;
  p.nextAction=m.time+.35;
  const a=local(p.team,p,m),rivals=opponents(m,p.team);
  const goal=world(p.team,{x:105,y:34},m),goalDist=distance(p,goal);
  const shotLane=laneSafety(m,p,goal,'shot');
  if(p.role!=='GK'&&goalDist<24&&Math.abs(a.y-34)<19&&m.time-p.controlledSince>.4){
    const score=clamp((25-goalDist)/16,0,1)*.9+shotLane*.5;
    if(score>.68||goalDist<11){
      const aimed=world(p.team,{x:105,y:34+(random(m)-.5)*5},m);
      release(m,p,'shot',aimed);return;
    }
  }
  let best=null,bestScore=-Infinity;
  for(const q of teammates(m,p.team)){
    if(q.id===p.id)continue;
    const d=distance(p,q);if(d<4||d>40)continue;
    const b=local(p.team,q,m),lead=clamp(d/20,0,.8);
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
  // An elapsed clock is not a reason to abandon an open carry for a harmless
  // recycling pass. Compare the existing planned carry using the same spatial
  // rewards as a pass; close pressure and keeper distribution retain authority.
  const carry=p.intention,carryLocal=local(p.team,carry,m),carrySpace=Math.min(...rivals.map(q=>distance(q,carry)));
  const carryScore=5+clamp(carrySpace,0,10)*.22+(carryLocal.x-a.x)*.065-distance(p,carry)*.025;
  // A nearby rival the carrier is already escaping is not closing pressure.
  // Keep the existing3m neighbourhood and physical1.5m personal space; retain
  // the urgent escape for closing rivals and anyone ahead on the carry path.
  // Only current relative motion/geometry is read, never a future match result.
  const pressured=rivals.some(q=>{
    const d=distance(p,q);if(d>=3)return false;
    const separating=(p.x-q.x)*(p.vx-q.vx)+(p.y-q.y)*(p.vy-q.vy)>0;
    const path=segmentPoint(q,p,carry);
    return d<1.5||!separating||(path.t>0&&path.d<1.5);
  });
  const shouldRelease=p.role==='GK'?age>1:pressured?age>.45:age>1.8&&bestScore>Math.max(5.1,carryScore);
  if(best&&shouldRelease&&best.safety>.13)release(m,p,'pass',best.target,best.q.id);
  // No forced timed pass. If lanes are shut the actor continues the current carry.
}
export function takeRestart(m){
  const r=m.restart;if(!r||m.time-r.since<1.2)return;
  const p=byId(m,r.taker);if(!p||distance(p,r)>1.1)return;
  if(!restartReady(m))return;
  if(m.players.some(q=>q.team!==r.team&&distance(q,r)<(r.type==='throw'?1.8:8.8)))return;
  m.ball.owner=p.id;p.controlledSince=m.time;
  if(r.type==='penalty'){
    m.restart=null;
    release(m,p,'shot',world(p.team,{x:105,y:34+(random(m)-.5)*5},m));
    m.ball.restartKicker=p.id;
    m.match.penaltyLive=true;
    event(m,'restartTaken',{team:p.team,playerId:p.id,restart:r.type});return;
  }
  let candidates=teammates(m,p.team).filter(q=>q.id!==p.id&&distance(q,p)>5&&distance(q,p)<40);
  if(!candidates.length)return;
  candidates.sort((a,b)=>{
    const score=q=>laneSafety(m,p,q)*5-Math.abs(distance(p,q)-16)*.06;
    return score(b)-score(a);
  });
  const q=candidates[0];m.restart=null;
  release(m,p,'pass',q,q.id);
  if(m.match)m.ball.restartKicker=p.id;
  if(r.type==='throw')m.ball.directThrowTeam=r.team;
  if(['throw','corner','goalKick'].includes(r.type))m.ball.offside=[];
  event(m,'restartTaken',{team:p.team,playerId:p.id,restart:r.type});
}
