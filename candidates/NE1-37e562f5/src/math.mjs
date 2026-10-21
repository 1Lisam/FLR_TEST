export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const length = (x, y) => Math.hypot(x, y);
export const distance = (a, b) => length(a.x-b.x, a.y-b.y);
export const mix = (a,b,t) => a+(b-a)*t;
export const angleDelta = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function unit(x,y) { const d=length(x,y); return d>1e-8?{x:x/d,y:y/d}:{x:0,y:0}; }
export function segmentPoint(p,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
  const x=a.x+dx*t,y=a.y+dy*t;
  return {x,y,t,d:length(p.x-x,p.y-y)};
}
export function random(m) {
  let s=m.rng|0; s^=s<<13;s^=s>>>17;s^=s<<5;m.rng=s>>>0;
  return m.rng/4294967296;
}
export function local(team,p,m) { return (team^(m?.match?.period===2?1:0))===0?{x:p.x,y:p.y}:{x:105-p.x,y:68-p.y}; }
export function world(team,p,m) { return local(team,p,m); }
// A physical flight estimate shared by airborne motion and interception. This
// advances only an unowned ball, never a match, player, RNG or future outcome.
export function freeBallFlight(ball,dt) {
  const b={x:ball.x,y:ball.y,z:Math.max(0,ball.z),vx:ball.vx,vy:ball.vy,vz:ball.vz};
  let left=Math.max(0,dt),bounces=0;
  for(let n=0;n<16&&left>1e-10;n++){
    const air=b.z>1e-9||b.vz>1e-9;
    const impact=air?(b.vz+Math.sqrt(b.vz*b.vz+19.62*b.z))/9.81:Infinity;
    const t=Math.min(left,impact),speed=Math.hypot(b.vx,b.vy),drag=air?.12:.85;
    const travelTime=Math.min(t,speed/drag),d=speed*travelTime-drag*travelTime*travelTime/2;
    b.x+=speed?b.vx/speed*d:0;b.y+=speed?b.vy/speed*d:0;
    const scale=Math.max(0,speed-drag*t)/(speed||1);b.vx*=scale;b.vy*=scale;
    if(air){b.z=Math.max(0,b.z+b.vz*t-4.905*t*t);b.vz-=9.81*t;}
    else {b.z=0;b.vz=0;}
    left-=t;
    if(air&&impact<=t+1e-10){b.z=0;b.vz=Math.abs(b.vz)>.9?-b.vz*.35:0;bounces++;}
  }
  return {...b,bounces};
}
export const teammates=(m,team)=>m.players.filter(p=>p.team===team);
export const opponents=(m,team)=>m.players.filter(p=>p.team!==team);
export function event(m,type,data={}) {
  const e={id:++m.eventId,t:m.time,type,...data};m.events.push(e);
  if(m.match){
    m.match.counts??={};m.match.counts[type]=(m.match.counts[type]??0)+1;
    if(['goal','save','foul','halfTime','secondHalf','fullTime'].includes(type)){
      m.match.facts??=[];m.match.facts.push(e);if(m.match.facts.length>100)m.match.facts.shift();
    }
  }
  if(m.events.length>500)m.events.shift();return e;
}

function approachTime(p,target){
  const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
  let remaining=Math.max(0,d-.8);if(!remaining)return 0;
  let speed=d?(p.vx*dx+p.vy*dy)/d:0,time=0;
  // Use current motion and the existing motor's braking/acceleration limits.
  // This is a one-dimensional arrival estimate, not a simulated match or a
  // guaranteed interception. A receding player must brake and regain ground.
  if(speed<0){time=-speed/9.6;remaining+=speed*speed/19.2;speed=0;}
  speed=Math.min(speed,p.maxSpeed);
  const accelerating=(p.maxSpeed-speed)/4.8,travel=speed*accelerating+2.4*accelerating**2;
  return time+(remaining<=travel?(-speed+Math.sqrt(speed*speed+9.6*remaining))/4.8:accelerating+(remaining-travel)/p.maxSpeed);
}
export function passLaneSafety(m,p,target){
  const d=distance(p,target),speed=clamp(Math.sqrt(1.7*d)+6,9,23);
  let safety=1;
  for(const q of opponents(m,p.team)){
    const s=segmentPoint(q,p,target);
    if(s.t<.04||s.t>.98)continue;
    const available=s.t*d/speed;
    // Current geometry and travel estimates, no simulated future or sampled outcome.
    const intercept=approachTime(q,{x:p.x+(target.x-p.x)*s.t,y:p.y+(target.y-p.y)*s.t});
    safety=Math.min(safety,clamp((intercept-available+.25)/.8,0,1));
  }
  return safety;
}
