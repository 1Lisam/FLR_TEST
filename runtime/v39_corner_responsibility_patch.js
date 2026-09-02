(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v39CornerResponsibility)return;
const VERSION='V39-CORNER-RESPONSIBILITY-0.3';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const other=t=>t==='HOME'?'AWAY':'HOME';
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const player=(m,id)=>m.playersById?.[id]||m.players.find(p=>p.id===id)||null;
function setTarget(p,t,x,y,taskName){if(!p||!t)return;t.x=clamp(x,1,104);t.y=clamp(y,1,67);t.task=taskName;t.sprint=false;p.tx=t.x;p.ty=t.y;p.action=taskName;p.tacticalTask=taskName;p.sprint=false;}
function localChannelY(team,p){return team==='HOME'?p.y:68-p.y;}
function outletSpec(p,sideY){if(p.role==='ST')return{role:'COUNTER_OUTLET',x:68,y:34,task:'CORNER_COUNTER_OUTLET_HOLD'};const left=sideY<34;return{role:left?'COUNTER_OUTLET_LEFT':'COUNTER_OUTLET_RIGHT',x:70,y:left?14:54,task:left?'CORNER_COUNTER_OUTLET_LEFT_HOLD':'CORNER_COUNTER_OUTLET_RIGHT_HOLD'};}
function assignOutlet(m,setup,p,sideY){const team=m.restart.team,q=outletSpec(p,sideY),w=world(team,q.x,q.y);setup.cornerPlan.roles[p.id]=q.role;setup.targets[p.id]={...(setup.targets[p.id]||{}),x:w.x,y:w.y,task:q.task,required:false,sprint:false};setTarget(p,setup.targets[p.id],w.x,w.y,q.task);p.markTargetId=null;}
function reconcileSetup(m,setup){const r=m?.restart,plan=setup?.cornerPlan;if(!r||r.kind!=='CORNER'||!plan)return setup;const defTeam=other(r.team),defs=m.players.filter(p=>p.team===defTeam&&p.role!=='GK');
  plan.v39MarkerOwners=plan.v39MarkerOwners||{};
  for(const [id,role] of Object.entries(plan.roles||{})){if(role!=='MARKER')continue;const p=player(m,id);if(p?.markTargetId)plan.v39MarkerOwners[id]=p.markTargetId;}
  const protect=Object.entries(plan.roles||{}).filter(([,role])=>role==='NEAR_POST_PROTECT').map(([id])=>player(m,id)).filter(Boolean);
  if(protect.length>1){const keeper=protect.find(p=>!['ST','WF'].includes(p.role))||protect[0];for(const p of protect){if(p.id===keeper.id)continue;assignOutlet(m,setup,p,localChannelY(r.team,p));}}
  const zonePlayers=defs.filter(p=>(plan.roles[p.id]||'')==='ZONE');
  const bySide=[zonePlayers.filter(p=>localChannelY(r.team,p)<34),zonePlayers.filter(p=>localChannelY(r.team,p)>=34)];
  for(const side of bySide){const wf=side.find(p=>p.role==='WF'),fb=side.find(p=>p.role==='FB');if(!wf||!fb)continue;const dy=Math.abs(localChannelY(r.team,wf)-localChannelY(r.team,fb));if(dy<=10)assignOutlet(m,setup,wf,localChannelY(r.team,wf));}
  plan.v39ResponsibilityOwnership=VERSION;return setup;
}
const begin=R.begin.bind(R),assign=R.assign.bind(R),live=R.cornerLiveUpdate?.bind(R),debug=R.debugSummary?.bind(R);
R.begin=function(m){const out=begin(m);reconcileSetup(m,out);return out;};
R.assign=function(m){const ok=assign(m);reconcileSetup(m,m.restart?.setup);return ok;};
if(live)R.cornerLiveUpdate=function(m,sp){const ok=live(m,sp),plan=sp?.cornerPlan;if(!plan||sp.kind!=='CORNER')return ok;const sign=sp.team==='HOME'?1:-1;
  for(const [id,role] of Object.entries(plan.roles||{})){
    const q=player(m,id);if(!q)continue;
    if(role==='MARKER'){
      const owner=q.markTargetId||plan.v39MarkerOwners?.[id]||null,a=owner?player(m,owner):null;if(!a)continue;q.markTargetId=owner;
      q.tx=clamp(a.x+sign*1.15,1,104);q.ty=clamp(a.y+(a.y<34?.45:-.45),1,67);q.action='CORNER_MARK_TRACK';q.tacticalTask='CORNER_MARK_TRACK';q.sprint=Math.hypot(q.x-q.tx,q.y-q.ty)>1.4;
    }else if(role==='COUNTER_OUTLET_LEFT'||role==='COUNTER_OUTLET_RIGHT'){
      const left=role.endsWith('LEFT'),w=world(sp.team,70,left?14:54);q.tx=w.x;q.ty=w.y;q.action=left?'CORNER_COUNTER_OUTLET_LEFT':'CORNER_COUNTER_OUTLET_RIGHT';q.tacticalTask=q.action;q.sprint=false;
    }
  }
  return ok;};
if(debug)R.debugSummary=function(m){const d=debug(m);if(d&&m.restart?.setup?.cornerPlan)d.cornerPlan=m.restart.setup.cornerPlan;return d;};
R.V39_CORNER_RESPONSIBILITY_VERSION=VERSION;R.__v39CornerResponsibility=true;
})(typeof globalThis!=='undefined'?globalThis:this);
