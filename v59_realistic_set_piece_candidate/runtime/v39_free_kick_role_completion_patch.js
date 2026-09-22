(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v39FreeKickRoleCompletion)return;
const VERSION='V39-FREE-KICK-ROLE-COMPLETION-0.1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const player=(m,id)=>m.playersById?.[id]||m.players.find(p=>p.id===id)||null;
function targetFor(p){
  if(p.role==='FB')return{x:66,y:p.slot==='LB'?18:50,role:'REST_DEFENCE_SUPPORT',task:'FREE_KICK_REST_DEFENCE_SUPPORT_HOLD'};
  if(p.role==='CB')return{x:61,y:p.slot==='LCB'?28:40,role:'REST_DEFENCE_3',task:'FREE_KICK_REST_DEFENCE_3_HOLD'};
  if(p.role==='CM')return{x:79,y:p.slot==='LCM'?25:p.slot==='RCM'?43:34,role:'SECOND_BALL_EDGE',task:'FREE_KICK_SECOND_BALL_EDGE_HOLD'};
  return{x:72,y:p.slot==='LW'?16:p.slot==='RW'?52:34,role:'RECYCLE_SUPPORT',task:'FREE_KICK_RECYCLE_SUPPORT_HOLD'};
}
function applyPlayer(p,t){
  p.tx=t.x;p.ty=t.y;p.action=t.task;p.tacticalTask=t.task;p.sprint=Math.hypot(p.x-t.x,p.y-t.y)>2.4;
}
function complete(m,setup){
  const r=m?.restart,plan=setup?.freeKickPlan;if(!r||r.kind!=='FREE_KICK'||!plan)return setup;
  const team=r.team,roles=plan.roles||{},kickerId=setup.kickerId;
  plan.targetsByResponsibility=plan.targetsByResponsibility||{};
  for(const p of m.players.filter(x=>x.team===team&&x.role!=='GK'&&x.id!==kickerId)){
    if(roles[p.id])continue;
    const q=targetFor(p),w=world(team,q.x,q.y);
    roles[p.id]=q.role;
    setup.targets[p.id]={x:clamp(w.x,1,104),y:clamp(w.y,1,67),task:q.task,required:false,sprint:false};
    plan.targetsByResponsibility[p.id]=`${p.slot||p.role}_${q.role}`;
    applyPlayer(p,setup.targets[p.id]);
  }
  plan.roles=roles;plan.v39RoleCompletion=VERSION;return setup;
}
const begin=R.begin.bind(R),assign=R.assign.bind(R),debug=R.debugSummary?.bind(R);
R.begin=function(m){const out=begin(m);complete(m,out);return out;};
R.assign=function(m){const out=assign(m);complete(m,m.restart?.setup);return out;};
if(debug)R.debugSummary=function(m){const d=debug(m);if(d&&m.restart?.setup?.freeKickPlan)d.freeKickPlan=m.restart.setup.freeKickPlan;return d;};
R.V39_FREE_KICK_ROLE_COMPLETION_VERSION=VERSION;R.__v39FreeKickRoleCompletion=true;
})(typeof globalThis!=='undefined'?globalThis:this);
