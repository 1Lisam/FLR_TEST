(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FLRPG_FULL_TIME_PRESENTATION=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const deep=v=>v==null?v:JSON.parse(JSON.stringify(v));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(s){let h=2166136261>>>0;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function walkoffFrames(finalSnapshot,opts={}){
  if(!finalSnapshot)return[];const duration=Number(opts.duration)||4.5,dt=Number(opts.dt)||0.10,start=Number(finalSnapshot.time)||5400,base=deep(finalSnapshot),frames=[];
  const origins=Object.fromEntries((base.players||[]).map(p=>[p.id,{x:p.x,y:p.y}]));
  for(let t=0;t<=duration+.001;t+=dt){const f=deep(base);f.time=start+t;f.completed=true;f.phase='FULL_TIME_WALKOFF';f.presentation={kind:'LOCKER_ROOM_WALKOFF',elapsed:Number(t.toFixed(2)),duration};f.ball={...f.ball,mode:'DEAD',vx:0,vy:0,vz:0,ownerId:null};
    f.players=(f.players||[]).map((p,i)=>{const o=origins[p.id],delay=(hash(p.id)%9)*0.09,tt=clamp((t-delay)/Math.max(.1,duration-delay),0,1),lane=((hash(p.id+'lane')%1000)/1000-.5)*22,target={x:52.5+lane,y:72.5};const dx=target.x-o.x,dy=target.y-o.y,d=Math.hypot(dx,dy)||1,pace=1.15+((hash(p.id+'pace')%35)/100),travel=Math.min(d,pace*Math.max(0,t-delay)),x=o.x+dx/d*travel,y=o.y+dy/d*travel;return{...p,x,y,vx:tt>0?dx/d*pace:0,vy:tt>0?dy/d*pace:0,tx:target.x,ty:target.y,action:'FULL_TIME_WALK_OFF',tacticalTask:'FULL_TIME_WALK_OFF',sprint:false,hasBall:false};});frames.push(f);}
  return frames;
}
return{walkoffFrames};
});
