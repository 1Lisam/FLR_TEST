import {local,world,distance,clamp} from './math.mjs';

// A deliberately small foul model: a fast, late rear challenge through the
// carrier, with the ball beyond the challenger. Never a score/event quota.
export function carelessChallenge(m,p,owner){
  if(!m.match||p.role==='GK'||distance(p,owner)>.85||distance(p,m.ball)<.65)return false;
  const dx=m.ball.x-owner.x,dy=m.ball.y-owner.y,d=Math.hypot(dx,dy);
  if(d<.25)return false;
  const rear=((p.x-owner.x)*dx+(p.y-owner.y)*dy)/d;
  const closing=((p.vx-owner.vx)*(owner.x-p.x)+(p.vy-owner.vy)*(owner.y-p.y))/(distance(p,owner)||1);
  return rear<-.2&&closing>2.8;
}
export const inArea=(m,team,p)=>{const a=local(team,p,m);return a.x<16.5&&Math.abs(a.y-34)<20.16;};

// Constraints are shared by dead-ball positioning and the execution gate.
// They affect destinations; only the normal motor moves players to them.
export function restartTarget(m,p){
  const r=m.restart;if(!m.match||!r||p.id===r.taker)return null;
  const a=local(r.team,p,m),b=local(r.team,r,m);
  if(r.type==='penalty'){
    if(p.team!==r.team&&p.role==='GK')return world(r.team,{x:104.6,y:34},m);
    if(p.team===r.team&&p.role==='GK')return world(p.team,{x:4,y:34},m);
    // Leave a central walking corridor for the keeper/taker. Sending several
    // waiting actors to exactly the same centre-line point traps the keeper.
    const y=Math.abs(a.y-34)<3?34+(p.slot%2?4:-4):clamp(a.y,4,64);
    return world(r.team,{x:Math.min(a.x,84.5),y},m);
  }
  if(r.type==='kickoff'){
    const own=local(p.team,p,m),radius=p.team===r.team?0:9.15;
    if(own.x>52||distance(p,r)<radius){
      const y=clamp(own.y,2,66),dx=Math.sqrt(Math.max(0,(radius+.5)**2-(y-34)**2));
      return world(p.team,{x:Math.min(own.x,52,52.5-dx),y},m);
    }
    return null;
  }
  if(r.type==='goalKick'&&p.team!==r.team&&inArea(m,r.team,p))return world(r.team,{x:18,y:a.y},m);
  if(r.type==='corner'){
    const receivers=m.players.filter(q=>q.team===r.team&&q.id!==r.taker&&(q.role.includes('ST')||['LW','RW','LM','RM'].includes(q.role))).sort((a,b)=>Number(b.role.includes('ST'))-Number(a.role.includes('ST'))).slice(0,2);
    const index=receivers.findIndex(q=>q.id===p.id);
    if(index>=0)return world(r.team,{x:94-index*3,y:30+index*8},m);
  }
  const radius=r.type==='throw'?2:9.15;
  if(p.team!==r.team&&distance(p,r)<radius+.2){
    let dx=p.x-r.x,dy=p.y-r.y,d=Math.hypot(dx,dy);
    if(d<.01){const own=world(p.team,{x:1,y:34},m);dx=own.x-r.x;dy=own.y-r.y;d=Math.hypot(dx,dy);}
    const point={x:clamp(r.x+dx/d*(radius+1),.4,104.6),y:clamp(r.y+dy/d*(radius+1),.4,67.6)};
    // Near a boundary, project towards the field rather than clamp the same
    // outward radial point repeatedly inside the exclusion circle.
    if(distance(point,r)<radius+.2){const centre={x:52.5,y:34},len=distance(centre,r);return {x:r.x+(centre.x-r.x)/len*(radius+1),y:r.y+(centre.y-r.y)/len*(radius+1)};}
    return point;
  }
  return null;
}
export function restartReady(m){
  const r=m.restart;if(!m.match)return true;
  if(r.type==='penalty')return m.players.every(p=>{
    if(p.id===r.taker)return true;
    if(p.team!==r.team&&p.role==='GK'){const a=local(r.team,p,m);return a.x>=104&&Math.abs(a.y-34)<3.66;}
    const a=local(r.team,p,m);return a.x<88.5&&distance(p,r)>=9.15;
  });
  if(r.type==='kickoff'&&m.players.some(p=>p.id!==r.taker&&(local(p.team,p,m).x>52.5||p.team!==r.team&&distance(p,r)<9.15)))return false;
  if(r.type==='goalKick'&&m.players.some(p=>p.team!==r.team&&inArea(m,r.team,p)))return false;
  const radius=r.type==='throw'?2:9.15;
  if(m.players.some(p=>p.team!==r.team&&distance(p,r)<radius))return false;
  if(r.type==='corner'&&m.players.filter(p=>p.team===r.team&&p.id!==r.taker&&p.role!=='GK'&&local(r.team,p,m).x>85&&Math.abs(p.y-34)<22).length<2)return false;
  return true;
}
