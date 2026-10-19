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
export function local(team,p) { return team===0?{x:p.x,y:p.y}:{x:105-p.x,y:68-p.y}; }
export function world(team,p) { return local(team,p); }
export const teammates=(m,team)=>m.players.filter(p=>p.team===team);
export const opponents=(m,team)=>m.players.filter(p=>p.team!==team);
export function event(m,type,data={}) {
  const e={id:++m.eventId,t:m.time,type,...data};m.events.push(e);
  if(m.events.length>500)m.events.shift();return e;
}
