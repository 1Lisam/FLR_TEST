import {clamp,length,distance,angleDelta,unit,local,world,teammates,segmentPoint,event} from './math.mjs';
import {byId} from './model.mjs';

export function movePlayers(m,dt){
  for(const p of m.players){
    const dx=p.intention.x-p.x,dy=p.intention.y-p.y,d=length(dx,dy),dir=unit(dx,dy);
    let max=p.maxSpeed*(m.ball.owner===p.id?.79:1);
    if(p.intention.kind==='keeper')max*=.85;
    const desired=Math.min(max,Math.sqrt(2*3.8*Math.max(0,d-.12)),d*2.5);
    let tx=dir.x*desired,ty=dir.y*desired;
    // Physical personal space blends into one motor command, not a second tactic.
    for(const q of m.players){
      if(q===p)continue;const ox=p.x-q.x,oy=p.y-q.y,od=length(ox,oy);
      if(od>.01&&od<1.5){const f=(1.5-od)*2.5;tx+=ox/od*f;ty+=oy/od*f;}
    }
    const wanted=length(tx,ty);if(wanted>max){tx*=max/wanted;ty*=max/wanted;}
    const ax=tx-p.vx,ay=ty-p.vy,change=length(ax,ay),cap=4.8*dt;
    p.vx+=ax*Math.min(1,cap/(change||1));p.vy+=ay*Math.min(1,cap/(change||1));
    p.x=clamp(p.x+p.vx*dt,.4,104.6);p.y=clamp(p.y+p.vy*dt,.4,67.6);
    const speed=length(p.vx,p.vy),watch=p.role==='GK'||speed<.7||['press','cover','protect'].includes(p.intention.kind);
    const desiredFacing=watch?Math.atan2(m.ball.y-p.y,m.ball.x-p.x):Math.atan2(p.vy,p.vx);
    p.facing+=clamp(angleDelta(p.facing,desiredFacing),-Math.PI*1.5*dt,Math.PI*1.5*dt);
  }
  // Contact exclusion is bounded by actual disc penetration, never by formation targets.
  for(let i=0;i<m.players.length;i++)for(let j=i+1;j<m.players.length;j++){
    const a=m.players[i],b=m.players[j],dx=b.x-a.x,dy=b.y-a.y,d=length(dx,dy);
    if(d<.62){const n=d>.0001?{x:dx/d,y:dy/d}:{x:1,y:0},push=(.62-d)*.5;
      a.x-=n.x*push;a.y-=n.y*push;b.x+=n.x*push;b.y+=n.y*push;
      const approach=(b.vx-a.vx)*n.x+(b.vy-a.vy)*n.y;
      if(approach<0){a.vx+=n.x*approach*.5;a.vy+=n.y*approach*.5;b.vx-=n.x*approach*.5;b.vy-=n.y*approach*.5;}
    }
  }
}
export function restart(m,type,team,point){
  const targets=teammates(m,team).filter(p=>type==='goalKick'?p.role==='GK':p.role!=='GK');
  const taker=targets.sort((a,b)=>distance(a,point)-distance(b,point))[0];
  m.restart={type,team,x:clamp(point.x,0,105),y:clamp(point.y,0,68),since:m.time,taker:taker.id};
  Object.assign(m.ball,{x:m.restart.x,y:m.restart.y,z:0,vx:0,vy:0,vz:0,owner:null,target:null,kind:'restart',offside:[],heldByKeeper:false});
  m.lastTouchTeam=team;m.nextPlan=m.time;event(m,'restart',{team,restart:type,x:m.restart.x,y:m.restart.y});
}
function receive(m,p){
  const b=m.ball;
  if(b.offside.includes(p.id)){event(m,'offside',{team:p.team,playerId:p.id});restart(m,'freeKick',1-p.team,p);return;}
  const kicker=byId(m,b.lastKicker),shot=b.kind==='shot';
  if(kicker&&p.team===kicker.team&&p.id!==kicker.id&&b.kind==='pass'){
    m.stats[p.team].completed++;event(m,'receive',{team:p.team,playerId:p.id,from:kicker.id});
  }else if(kicker&&p.team!==kicker.team){
    const type=p.role==='GK'&&shot?'save':b.kind==='pass'?'interception':shot?'block':'recovery';
    if(type==='save')m.stats[p.team].saves++;if(type==='interception')m.stats[p.team].interceptions++;
    event(m,type,{team:p.team,playerId:p.id,from:kicker.id});
  }
  b.heldByKeeper=p.role==='GK'&&local(p.team,p).x<16.5&&Math.abs(p.y-34)<20&&kicker?.team!==p.team;
  b.owner=p.id;b.vx=p.vx;b.vy=p.vy;b.vz=0;b.z=0;b.offside=[];b.kind='controlled';
  p.controlledSince=m.time;p.nextAction=m.time+.4;m.lastTouchTeam=p.team;m.nextPlan=m.time;
}
export function moveBall(m,dt){
  if(m.restart)return;
  const b=m.ball,owner=byId(m,b.owner);
  if(owner){
    const speed=length(owner.vx,owner.vy),f=speed>.4?unit(owner.vx,owner.vy):{x:Math.cos(owner.facing),y:Math.sin(owner.facing)};
    const foot={x:owner.x+f.x*.58,y:owner.y+f.y*.58};
    b.vx=owner.vx+(foot.x-b.x)*9;b.vy=owner.vy+(foot.y-b.y)*9;
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.z=0;
    const challengers=b.heldByKeeper?[]:m.players.filter(p=>p.team!==owner.team&&m.time-p.lastChallenge>.8&&distance(p,b)<(p.role==='GK'?1.2+p.keeping*.2:.8+p.defence*.3));
    const p=challengers.sort((a,c)=>distance(a,b)-distance(c,b))[0];
    if(p){
      p.lastChallenge=m.time;
      if(p.role==='GK'&&local(p.team,p).x<16.5&&Math.abs(p.y-34)<20){
        event(m,'smother',{team:p.team,playerId:p.id,from:owner.id});b.owner=p.id;b.heldByKeeper=true;p.controlledSince=m.time;p.nextAction=m.time+.5;m.lastTouchTeam=p.team;m.nextPlan=m.time;
      }else{
        const normal=unit(b.x-p.x,b.y-p.y);b.owner=null;b.vx=normal.x*3.5+p.vx*.4;b.vy=normal.y*3.5+p.vy*.4;
        b.lastKicker=p.id;b.kickTime=m.time;b.kind='loose';b.offside=[];m.lastTouchTeam=p.team;
        event(m,'tackle',{team:p.team,playerId:p.id,from:owner.id});m.nextPlan=m.time;
      }
    }
  }else{
    const before={x:b.x,y:b.y};b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.z>0||b.vz>0){b.z+=b.vz*dt;b.vz-=9.81*dt;if(b.z<0){b.z=0;b.vz=Math.abs(b.vz)>.9?-b.vz*.35:0;}}
    const speed=length(b.vx,b.vy),slow=b.z>.02?.12:.85,scale=Math.max(0,speed-slow*dt)/(speed||1);b.vx*=scale;b.vy*=scale;
    let nearest=null,first=Infinity;
    for(const p of m.players){
      if(p.id===b.lastKicker&&m.time-b.kickTime<.3)continue;
      const keeper=p.role==='GK'&&local(p.team,p).x<16.5&&Math.abs(p.y-34)<20;
      if(b.z>(keeper?1.7+p.keeping*.4:.75))continue;
      const c=segmentPoint(p,before,b),reach=keeper?1.05+p.keeping*.25:.68;
      if(c.d<reach&&c.t<first){first=c.t;nearest=p;}
    }
    if(nearest)receive(m,nearest);
  }
  if(m.restart)return;
  if(b.x<0||b.x>105){
    const right=b.x>105,scoring=right?0:1;
    if(Math.abs(b.y-34)<3.66&&b.z<2.44){
      m.score[scoring]++;event(m,'goal',{team:scoring,playerId:b.lastKicker,score:[...m.score]});
      restart(m,'kickoff',1-scoring,{x:52.5,y:34});
    }else if(m.lastTouchTeam===scoring)restart(m,'goalKick',1-scoring,{x:right?99:6,y:34});
    else restart(m,'corner',scoring,{x:right?104.5:.5,y:b.y<34?.5:67.5});
  }else if(b.y<0||b.y>68)restart(m,'throw',1-m.lastTouchTeam,{x:clamp(b.x,1,104),y:b.y<0?.1:67.9});
}
