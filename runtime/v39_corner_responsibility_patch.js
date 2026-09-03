(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v39CornerResponsibility)return;
const VERSION='V39-CORNER-RESPONSIBILITY-0.6';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const other=t=>t==='HOME'?'AWAY':'HOME';
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const local=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const player=(m,id)=>m.playersById?.[id]||m.players.find(p=>p.id===id)||null;
const dist=(a,b)=>Math.hypot((a?.x||0)-(b?.x||0),(a?.y||0)-(b?.y||0));
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
function setTarget(p,t,x,y,taskName){if(!p||!t)return;t.x=clamp(x,1,104);t.y=clamp(y,1,67);t.task=taskName;t.sprint=false;p.tx=t.x;p.ty=t.y;p.action=taskName;p.tacticalTask=taskName;p.sprint=false;}
function localChannelY(team,p){return team==='HOME'?p.y:68-p.y;}
function outletSpec(p,sideY){if(p.role==='ST')return{role:'COUNTER_OUTLET',x:68,y:34,task:'CORNER_COUNTER_OUTLET_HOLD'};const left=sideY<34;return{role:left?'COUNTER_OUTLET_LEFT':'COUNTER_OUTLET_RIGHT',x:70,y:left?14:54,task:left?'CORNER_COUNTER_OUTLET_LEFT_HOLD':'CORNER_COUNTER_OUTLET_RIGHT_HOLD'};}
function assignOutlet(m,setup,p,sideY){const team=p.team,q=outletSpec(p,sideY),w=world(team,q.x,q.y);setup.cornerPlan.roles[p.id]=q.role;setup.targets[p.id]={...(setup.targets[p.id]||{}),x:w.x,y:w.y,task:q.task,required:false,sprint:false};setTarget(p,setup.targets[p.id],w.x,w.y,q.task);p.markTargetId=null;p.targetId=null;}
function assignCounterLink(setup,p){const w=world(p.team,62,34),taskName='CORNER_COUNTER_LINK_SUPPORT';setup.cornerPlan.roles[p.id]='COUNTER_LINK_SUPPORT';setup.targets[p.id]={...(setup.targets[p.id]||{}),x:w.x,y:w.y,task:taskName,required:false,sprint:false};setTarget(p,setup.targets[p.id],w.x,w.y,taskName);p.markTargetId=null;p.targetId=null;}
function ensureDefendingForwardLayer(m,setup,defTeam){const plan=setup.cornerPlan,defs=m.players.filter(p=>p.team===defTeam&&p.role!=='GK'),st=defs.find(p=>p.role==='ST'&&!p.markTargetId&&!p.targetId);if(!st)return;const role=plan.roles[st.id]||'';if(!['','ZONE','NEAR_POST_PROTECT'].includes(role))return;const outlets=defs.filter(p=>/COUNTER_OUTLET/.test(plan.roles[p.id]||''));if(outlets.length>=2)assignCounterLink(setup,st);else assignOutlet(m,setup,st,34);}
function reconcileSetup(m,setup){const r=m?.restart,plan=setup?.cornerPlan;if(!r||r.kind!=='CORNER'||!plan)return setup;const defTeam=other(r.team),defs=m.players.filter(p=>p.team===defTeam&&p.role!=='GK');
  plan.v39MarkerOwners=plan.v39MarkerOwners||{};
  const markerOwners=new Map();
  for(const [id,role] of Object.entries(plan.roles||{})){if(role!=='MARKER')continue;const p=player(m,id);if(!p?.markTargetId)continue;const prior=markerOwners.get(p.markTargetId);if(prior){p.markTargetId=null;p.targetId=null;plan.roles[p.id]=`CLEARANCE_EDGE_${p.slot||'CM'}`;if(setup.targets[p.id]){setup.targets[p.id].task='CORNER_CLEARANCE_EDGE_HOLD';setup.targets[p.id].sprint=false;}continue;}markerOwners.set(p.markTargetId,p.id);plan.v39MarkerOwners[id]=p.markTargetId;}
  const protect=Object.entries(plan.roles||{}).filter(([,role])=>role==='NEAR_POST_PROTECT').map(([id])=>player(m,id)).filter(Boolean);
  if(protect.length>1){const keeper=protect.find(p=>!['ST','WF'].includes(p.role))||protect[0];for(const p of protect){if(p.id===keeper.id)continue;assignOutlet(m,setup,p,localChannelY(p.team,p));}}
  const zonePlayers=defs.filter(p=>(plan.roles[p.id]||'')==='ZONE');
  const bySide=[zonePlayers.filter(p=>localChannelY(p.team,p)<34),zonePlayers.filter(p=>localChannelY(p.team,p)>=34)];
  for(const side of bySide){const wf=side.find(p=>p.role==='WF'),fb=side.find(p=>p.role==='FB');if(!wf||!fb)continue;const dy=Math.abs(localChannelY(wf.team,wf)-localChannelY(fb.team,fb));if(dy<=10)assignOutlet(m,setup,wf,localChannelY(wf.team,wf));}
  ensureDefendingForwardLayer(m,setup,defTeam);plan.v39ResponsibilityOwnership=VERSION;return setup;
}
function restDefenceCandidates(m,sp){const team=sp.team,plan=sp.cornerPlan;return m.players.filter(p=>p.team===team&&p.role!=='GK'&&/^REST_DEFENCE/.test(plan.roles?.[p.id]||'')).map(p=>({p,l:local(team,p.x,p.y)}));}
function ensureWideCounterOwnership(m,sp){const team=sp.team,opp=other(team),plan=sp.cornerPlan;if(!plan)return;const live=String(m.ball?.mode||'').toUpperCase()!=='DEAD';const threats=m.players.filter(p=>p.team===opp&&p.role==='WF'&&/COUNTER_OUTLET|LOOSE_RECEIVER|WIDE_OUTLET|RECEIVER_LANE/.test(`${plan.roles?.[p.id]||''} ${task(p)}`)).filter(p=>{const al=local(team,p.x,p.y);return live&&Math.abs(al.y-34)>=12;});if(!threats.length)return;const candidates=restDefenceCandidates(m,sp),used=new Set();plan.v39WideOutletOwners=plan.v39WideOutletOwners||{};
  for(const a of threats){const existing=m.players.find(d=>d.team===team&&d.role!=='GK'&&(d.markTargetId===a.id||d.targetId===a.id));if(existing){used.add(existing.id);plan.v39WideOutletOwners[a.id]=existing.id;continue;}const al=local(team,a.x,a.y),desired=al.y<34?'LB':'RB';let rows=candidates.filter(x=>!used.has(x.p.id)).map(x=>({x,score:(x.p.slot===desired?0:4)+Math.abs(x.l.y-al.y)*.18+Math.abs(x.l.x-al.x)*.06})).sort((u,v)=>u.score-v.score);if(!rows.length)continue;const q=rows[0].x.p;used.add(q.id);const tx=clamp(al.x-3.2,50,88),ty=clamp(al.y+(al.y<34?1.0:-1.0),5,63),w=world(team,tx,ty);q.tx=w.x;q.ty=w.y;q.action='CORNER_WIDE_OUTLET_OWNER';q.tacticalTask='CORNER_WIDE_OUTLET_OWNER';q.markTargetId=a.id;q.targetId=a.id;q.sprint=dist(q,a)>9.5;plan.v39WideOutletOwners[a.id]=q.id;
  }
}
function ensureLiveWideReceiverOwnership(m,sp){
  const plan=sp?.cornerPlan;if(!plan||String(m.ball?.mode||'').toUpperCase()==='DEAD')return;
  const attackTeam=sp.team,defTeam=other(attackTeam),wide=(m.players||[]).filter(p=>p.team===attackTeam&&p.role==='WF'&&/LOOSE_RECEIVER|RECEIVER_LANE|WIDE_OUTLET/.test(task(p)));
  if(!wide.length)return;const used=new Set();plan.v39LiveWideOwners=plan.v39LiveWideOwners||{};
  for(const a of wide){
    const owners=(m.players||[]).filter(d=>d.team===defTeam&&d.role!=='GK'&&(d.markTargetId===a.id||d.targetId===a.id)).sort((x,y)=>(x.role==='FB'?0:x.role==='CB'?1:2)-(y.role==='FB'?0:y.role==='CB'?1:2));
    if(owners.length){
      const existing=owners[0];used.add(existing.id);plan.v39LiveWideOwners[a.id]=existing.id;
      for(const extra of owners.slice(1)){extra.markTargetId=null;extra.targetId=null;if(extra.role==='CM'){extra.action=extra.tacticalTask='CORNER_CLEARANCE_EDGE';}}
      plan.roles[existing.id]='LIVE_WIDE_OWNER';
      continue;
    }
    const al=local(attackTeam,a.x,a.y),candidates=(m.players||[]).filter(d=>d.team===defTeam&&d.role!=='GK'&&!used.has(d.id)&&!d.markTargetId&&!d.targetId).map(d=>{
      const dl=local(attackTeam,d.x,d.y),channel=(al.y<34)===(dl.y<34),roleBias=d.role==='FB'?0:d.role==='CB'?1.5:3.0;
      return{d,score:dist(d,a)+roleBias+(channel?0:5)+Math.abs(dl.y-al.y)*.12};
    }).sort((x,y)=>x.score-y.score);
    const q=candidates[0]?.d;if(!q)continue;used.add(q.id);
    const w=world(defTeam,Math.max(4,Math.min(96,al.x+1.2)),Math.max(5,Math.min(63,al.y+(al.y<34?.45:-.45))));
    q.tx=w.x;q.ty=w.y;q.action=q.tacticalTask='CORNER_LIVE_WIDE_OWNER';q.markTargetId=a.id;q.targetId=a.id;q.sprint=dist(q,w)>2.4;plan.roles[q.id]='LIVE_WIDE_OWNER';
    plan.v39LiveWideOwners[a.id]=q.id;
  }
  for(const [id,role] of Object.entries(plan.roles||{}))if(role==='LIVE_WIDE_OWNER'){
    const q=player(m,id),aid=plan.v39LiveWideOwners&&Object.keys(plan.v39LiveWideOwners).find(x=>plan.v39LiveWideOwners[x]===id),a=aid&&player(m,aid);if(!q||!a)continue;
    const al=local(attackTeam,a.x,a.y),w=world(defTeam,Math.max(4,Math.min(96,al.x+1.2)),Math.max(5,Math.min(63,al.y+(al.y<34?.45:-.45))));q.tx=w.x;q.ty=w.y;q.action=q.tacticalTask='CORNER_LIVE_WIDE_OWNER';q.markTargetId=a.id;q.targetId=a.id;q.sprint=dist(q,w)>2.4;
  }
}
const begin=R.begin.bind(R),assign=R.assign.bind(R),live=R.cornerLiveUpdate?.bind(R),debug=R.debugSummary?.bind(R);
R.begin=function(m){const out=begin(m);reconcileSetup(m,out);return out;};
R.assign=function(m){const ok=assign(m);reconcileSetup(m,m.restart?.setup);return ok;};
if(live)R.cornerLiveUpdate=function(m,sp){const ok=live(m,sp),plan=sp?.cornerPlan;if(!plan||sp.kind!=='CORNER')return ok;const sign=sp.team==='HOME'?1:-1;
  for(const [id,role] of Object.entries(plan.roles||{})){
    const q=player(m,id);if(!q)continue;
    if(role==='MARKER'){
      const owner=q.markTargetId||plan.v39MarkerOwners?.[id]||null,a=owner?player(m,owner):null;if(!a)continue;q.markTargetId=owner;q.targetId=owner;
      q.tx=clamp(a.x+sign*1.15,1,104);q.ty=clamp(a.y+(a.y<34?.45:-.45),1,67);q.action='CORNER_MARK_TRACK';q.tacticalTask='CORNER_MARK_TRACK';q.sprint=Math.hypot(q.x-q.tx,q.y-q.ty)>1.4;
    }else if(role==='COUNTER_OUTLET'||role==='COUNTER_OUTLET_LEFT'||role==='COUNTER_OUTLET_RIGHT'){
      const left=role.endsWith('LEFT'),right=role.endsWith('RIGHT'),w=world(q.team,role==='COUNTER_OUTLET'?68:70,left?14:right?54:34);q.tx=w.x;q.ty=w.y;q.action=role==='COUNTER_OUTLET'?'CORNER_COUNTER_OUTLET':left?'CORNER_COUNTER_OUTLET_LEFT':'CORNER_COUNTER_OUTLET_RIGHT';q.tacticalTask=q.action;q.sprint=false;
    }else if(role==='COUNTER_LINK_SUPPORT'){
      const w=world(q.team,62,34);q.tx=w.x;q.ty=w.y;q.action='CORNER_COUNTER_LINK_SUPPORT';q.tacticalTask='CORNER_COUNTER_LINK_SUPPORT';q.sprint=Math.hypot(q.x-w.x,q.y-w.y)>2.8;
    }
  }
  ensureWideCounterOwnership(m,sp);ensureLiveWideReceiverOwnership(m,sp);return ok;};
if(debug)R.debugSummary=function(m){const d=debug(m);if(d&&m.restart?.setup?.cornerPlan)d.cornerPlan=m.restart.setup.cornerPlan;return d;};
R.V39_CORNER_RESPONSIBILITY_VERSION=VERSION;R.__v39CornerResponsibility=true;
})(typeof globalThis!=='undefined'?globalThis:this);
