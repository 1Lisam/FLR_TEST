(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v36FreeKickWallModel)return;
const VERSION='V37-FREE-KICK-WALL-GEOMETRY-ONLY-1.0';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(Number(a.x)-Number(b.x),Number(a.y)-Number(b.y));
const other=t=>t==='HOME'?'AWAY':'HOME';
const worldToLocal=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const localToWorld=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
function hash32(str){let h=2166136261>>>0;for(let i=0;i<String(str).length;i++){h^=String(str).charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function stableSign(m,salt){return(hash32(`${m.seed}|${salt}`)&1)?1:-1;}
function wallCountFor(lp,r){
  const indirect=r?.indirect===true||r?.isIndirect===true||String(r?.freeKickType||'').toUpperCase()==='INDIRECT';
  const d=Math.hypot(105-lp.x,34-lp.y),lat=Math.abs(lp.y-34);
  if(indirect){if(d<=22&&lat<=16)return 2;if(d<=30)return 1;return 0;}
  let n=0;
  if(d<=19)n=lat<=9?5:lat<=18?4:3;
  else if(d<=24)n=lat<=9?4:lat<=18?3:2;
  else if(d<=30)n=lat<=10?3:lat<=19?2:1;
  else if(d<=36)n=lat<=11?2:1;
  else if(d<=42)n=lat<=9?1:0;
  return clamp(n,0,5);
}
function wallGeometry(m,team,count){
  const r=m.restart,lp=worldToLocal(team,r.x,r.y),goal={x:105,y:34},dx=goal.x-lp.x,dy=goal.y-lp.y,len=Math.max(.001,Math.hypot(dx,dy)),ux=dx/len,uy=dy/len,px=-uy,py=ux;
  const nearSign=lp.y<32?-1:lp.y>36?1:stableSign(m,'FK_WALL_SIDE'),sideBias=count>=2?nearSign*.48:0;
  const centre={x:lp.x+ux*9.25+px*sideBias,y:lp.y+uy*9.25+py*sideBias};
  const spacing=.82,points=[];
  for(let i=0;i<count;i++){
    const offset=(i-(count-1)/2)*spacing;let q={x:centre.x+px*offset,y:centre.y+py*offset};
    q.x=clamp(q.x,1,104);q.y=clamp(q.y,1,67);
    const dd=Math.hypot(q.x-lp.x,q.y-lp.y);if(dd<9.17){const rx=(q.x-lp.x)/(dd||1),ry=(q.y-lp.y)/(dd||1),push=9.18-dd;q.x=clamp(q.x+rx*push,1,104);q.y=clamp(q.y+ry*push,1,67);}
    points.push(q);
  }
  const gkShift=count?clamp(1.15+count*.18,1.2,2):.45,gkY=clamp(34-nearSign*gkShift,30.5,37.5),gk={x:103,y:gkY};
  return{lp,distanceToGoal:len,lateral:Math.abs(lp.y-34),count,nearSign,centre,points,gk};
}
function rolePenalty(p){if(p.role==='CM')return 0;if(p.role==='FB')return .35;if(p.role==='WF')return .7;if(p.role==='ST')return .9;if(p.role==='CB')return 1.8;return 2;}
function planKey(r,count){return`${r.team}|${Number(r.x).toFixed(2)}|${Number(r.y).toFixed(2)}|${count}|${r.indirect===true||r.isIndirect===true||String(r.freeKickType||'').toUpperCase()==='INDIRECT'?'I':'D'}`;}
function reservedCoverageIds(candidates){
  const ids=new Set();for(const p of candidates)if(p.role==='CB')ids.add(p.id);
  const central=candidates.find(p=>p.role==='CM'&&p.slot==='CM')||candidates.find(p=>p.role==='CM');if(central)ids.add(central.id);
  return ids;
}
function selectWallPlayers(m,defTeam,geom,setup,key){
  const previous=setup?.freeKickWall;if(previous?.planKey===key&&Array.isArray(previous.wallPlayerIds)){
    const reused=previous.wallPlayerIds.map(id=>m.playersById?.[id]||m.players.find(p=>p.id===id)).filter(p=>p&&p.team===defTeam&&p.role!=='GK');
    if(reused.length===geom.count)return reused;
  }
  const candidates=m.players.filter(p=>p.team===defTeam&&p.role!=='GK'),centreW=localToWorld(m.restart.team,geom.centre.x,geom.centre.y),reserved=reservedCoverageIds(candidates),selected=[];
  const score=p=>dist(p,centreW)+rolePenalty(p)*2.1;
  for(const p of candidates.filter(p=>!reserved.has(p.id)).sort((a,b)=>score(a)-score(b))){if(selected.length>=geom.count)break;selected.push(p);}
  if(selected.length<geom.count){for(const p of candidates.filter(p=>reserved.has(p.id)).sort((a,b)=>score(a)-score(b))){if(selected.includes(p))continue;selected.push(p);if(selected.length>=geom.count)break;}}
  return selected;
}
function setTarget(setup,id,w,task,required=true,sprint=true){if(!id||!w)return;setup.targets[id]={x:w.x,y:w.y,task,required:!!required,sprint:!!sprint};if(required&&!setup.requiredIds.includes(id))setup.requiredIds.push(id);}
function defendFromAttackLocal(team,p,lx,ly){const own={x:clamp(105-lx,1,104),y:clamp(ly,1,67)};return localToWorld(p.team,own.x,own.y);}
function keepAttackersAwayFromWall(m,setup,team,geom,wallWorld){
  if(geom.count<3)return;const kickerId=setup.kickerId;
  for(const p of m.players.filter(p=>p.team===team&&p.id!==kickerId)){
    const t=setup.targets[p.id];if(!t)continue;let nearest=null,nd=Infinity;for(const w of wallWorld){const d=dist(t,w);if(d<nd){nd=d;nearest=w;}}
    if(!nearest||nd>=1.05)continue;let dx=t.x-nearest.x,dy=t.y-nearest.y,n=Math.hypot(dx,dy);if(n<.01){const ball={x:m.restart.x,y:m.restart.y};dx=ball.x-nearest.x;dy=ball.y-nearest.y;n=Math.hypot(dx,dy)||1;}const push=1.08-nd;t.x=clamp(t.x+dx/n*push,1,104);t.y=clamp(t.y+dy/n*push,1,67);t.task=`${t.task||'FREE_KICK_ATTACK_SETUP'}_WALL_CLEARANCE`;
  }
}
function repair(m,setup){
  const r=m?.restart;if(!r||r.kind!=='FREE_KICK'||!setup||!setup.targets)return setup;
  const team=r.team,defTeam=other(team),lp=worldToLocal(team,r.x,r.y),count=wallCountFor(lp,r),geom=wallGeometry(m,team,count),key=planKey(r,count),wallPlayers=selectWallPlayers(m,defTeam,geom,setup,key),wallIds=new Set(wallPlayers.map(p=>p.id));
  // This wrapper owns legal wall/GK geometry only; the template layer owns all other roles.
  const oldRequired=new Set(setup.requiredIds||[]);setup.requiredIds=[...oldRequired].filter(id=>!m.players.some(p=>p.id===id&&p.team===defTeam&&wallIds.has(id)));
  const wallWorld=[];wallPlayers.forEach((p,i)=>{const w=localToWorld(team,geom.points[i].x,geom.points[i].y);wallWorld.push(w);setTarget(setup,p.id,w,'FREE_KICK_WALL',true,true);p.markTargetId=null;});
  const gk=m.players.find(p=>p.team===defTeam&&p.role==='GK');if(gk)setTarget(setup,gk.id,localToWorld(team,geom.gk.x,geom.gk.y),'FREE_KICK_GK_COMPLEMENT',true,true);
  keepAttackersAwayFromWall(m,setup,team,geom,wallWorld);
  const gkWorld=localToWorld(team,geom.gk.x,geom.gk.y);setup.freeKickWall={version:VERSION,planKey:key,count,defendingTeam:defTeam,ball:{x:r.x,y:r.y},distanceToGoal:Number(geom.distanceToGoal.toFixed(2)),lateral:Number(geom.lateral.toFixed(2)),wallPlayerIds:[...wallIds],wallPoints:wallWorld.map(w=>({x:Number(w.x.toFixed(3)),y:Number(w.y.toFixed(3))})),gkTarget:{x:Number(gkWorld.x.toFixed(3)),y:Number(gkWorld.y.toFixed(3))},minDistance:9.15,attackerWallClearance:count>=3?1:0,wallReady:false};
  for(const [id,t] of Object.entries(setup.targets)){const p=m.playersById?.[id]||m.players.find(q=>q.id===id);if(!p)continue;if(id===setup.kickerId&&r.stage==='APPROACH'){p.tx=r.x;p.ty=r.y;p.action='FREE_KICK_APPROACH';p.tacticalTask='FREE_KICK_APPROACH';p.sprint=false;continue;}p.tx=t.x;p.ty=t.y;p.action=t.task;p.tacticalTask=t.task;p.sprint=!!t.sprint&&Math.hypot(p.x-t.x,p.y-t.y)>2.4;}
  return setup;
}
function wallReadyState(m,setup){
  const w=setup?.freeKickWall;if(!w||!w.wallPlayerIds?.length)return{ready:true,readyCount:0,total:0};let n=0,total=0;
  for(const id of w.wallPlayerIds){const p=m.playersById?.[id]||m.players.find(q=>q.id===id),t=setup.targets[id];if(!p||!t)continue;total++;if(dist(p,t)<=1.15)n++;}
  return{ready:total===0||n===total,readyCount:n,total};
}
const begin=R.begin.bind(R),assign=R.assign.bind(R),baseReadiness=typeof R.readiness==='function'?R.readiness.bind(R):null,baseIsReady=typeof R.isReady==='function'?R.isReady.bind(R):null,debug=typeof R.debugSummary==='function'?R.debugSummary.bind(R):null;
R.begin=function(m){return repair(m,begin(m));};
R.assign=function(m){const ok=assign(m);if(m?.restart?.setup)repair(m,m.restart.setup);return ok;};
if(baseReadiness)R.readiness=function(m){const out=baseReadiness(m),setup=m?.restart?.setup,w=wallReadyState(m,setup);if(setup?.freeKickWall){setup.freeKickWall.wallReady=w.ready;setup.freeKickWall.wallReadyCount=w.readyCount;setup.freeKickWall.wallTotal=w.total;if(!out.forced&&!w.ready)out.ready=false;out.wallReady=w.ready;out.wallReadyCount=w.readyCount;out.wallTotal=w.total;}return out;};
if(baseIsReady)R.isReady=function(m){return baseReadiness?R.readiness(m).ready:baseIsReady(m);};
if(debug)R.debugSummary=function(m){const d=debug(m);if(d&&m?.restart?.setup?.freeKickWall)d.freeKickWall=m.restart.setup.freeKickWall;return d;};
R.FREE_KICK_WALL_VERSION=VERSION;R.__v36FreeKickWallModel=true;
  function markWallRoles(setup){
    const roles=setup?.freeKickPlan?.roles;if(!roles)return;
    for(const id of setup.freeKickWall?.wallPlayerIds||[])roles[id]='WALL';
  }
  const wrappedBegin=R.begin,wrappedAssign=R.assign;
  R.begin=function(m){const out=wrappedBegin(m);markWallRoles(out);return out;};
  R.assign=function(m){const out=wrappedAssign(m);markWallRoles(m?.restart?.setup);return out;};
})(typeof globalThis!=='undefined'?globalThis:this);
