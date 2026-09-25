(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v39FreeKickDefensiveLayers)return;
const VERSION='V39-FREE-KICK-DEFENSIVE-LAYERS-0.2';
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const opposite=t=>t==='HOME'?'AWAY':'HOME';
const restartXDefenderY=(restartTeam,defTeam,x,y)=>({x:world(restartTeam,x,34).x,y:world(defTeam,34,y).y});
// Canonical set-piece contract: defensive box/wall/mark/second-ball targets
// are authored from the restart team's attacking-goal frame. Defending-player
// identity must not select the longitudinal frame. The ST outlet below is a
// deliberate exception: it is a defender attack-local escape slot.
function applyTarget(p,t,task){
  if(!p||!t)return;t.x=Math.max(1,Math.min(104,t.x));t.y=Math.max(1,Math.min(67,t.y));t.task=task;t.sprint=false;
  p.tx=t.x;p.ty=t.y;p.action=task;p.tacticalTask=task;p.sprint=Math.hypot(p.x-t.x,p.y-t.y)>2.4;
}
function reconcile(m,setup){
  const r=m?.restart,plan=setup?.freeKickPlan;if(!r||r.kind!=='FREE_KICK'||!plan)return setup;
  const defTeam=opposite(r.team),defs=m.players.filter(p=>p.team===defTeam),cmIds=Object.entries(plan.roles||{}).filter(([,role])=>role==='SECOND_BALL_DEFENCE').map(([id])=>id),cms=cmIds.map(id=>m.playersById?.[id]||defs.find(p=>p.id===id)).filter(Boolean);
  if(cms.length>=2){
    const laneBySlot={LCM:{x:87,y:21,task:'FREE_KICK_SECOND_BALL_LEFT_HOLD'},CM:{x:84,y:34,task:'FREE_KICK_CENTRAL_SCREEN_HOLD'},RCM:{x:87,y:47,task:'FREE_KICK_SECOND_BALL_RIGHT_HOLD'}};
    for(const p of cms){const q=laneBySlot[p.slot]||{x:85,y:34,task:'FREE_KICK_CENTRAL_SCREEN_HOLD'},w=restartXDefenderY(r.team,defTeam,q.x,q.y);applyTarget(p,setup.targets[p.id],q.task);if(setup.targets[p.id]){setup.targets[p.id].x=w.x;setup.targets[p.id].y=w.y;applyTarget(p,setup.targets[p.id],q.task);}plan.targetsByResponsibility=plan.targetsByResponsibility||{};plan.targetsByResponsibility[p.id]=`${p.slot||'CM'}_DISTINCT_SECOND_BALL_SCREEN`;}
    const st=defs.find(p=>p.role==='ST'&&(plan.roles[p.id]==='LINE_ZONE'||!plan.roles[p.id]));
    const alreadyOutlet=Object.values(plan.roles||{}).includes('COUNTER_OUTLET');
    if(st&&!alreadyOutlet){const w=world(defTeam,63,34);plan.roles[st.id]='COUNTER_OUTLET';setup.targets[st.id]={...(setup.targets[st.id]||{}),x:w.x,y:w.y,task:'FREE_KICK_COUNTER_OUTLET_HOLD',required:false,sprint:false};applyTarget(st,setup.targets[st.id],'FREE_KICK_COUNTER_OUTLET_HOLD');plan.targetsByResponsibility=plan.targetsByResponsibility||{};plan.targetsByResponsibility[st.id]='ST_COUNTER_OUTLET';}
  }
  plan.v39DefensiveLayers=VERSION;return setup;
}
const begin=R.begin.bind(R),assign=R.assign.bind(R),debug=R.debugSummary?.bind(R);
R.begin=function(m){const out=begin(m);reconcile(m,out);return out;};
R.assign=function(m){const out=assign(m);reconcile(m,m.restart?.setup);return out;};
if(debug)R.debugSummary=function(m){const d=debug(m);if(d&&m.restart?.setup?.freeKickPlan)d.freeKickPlan=m.restart.setup.freeKickPlan;return d;};
R.V39_FREE_KICK_DEFENSIVE_LAYERS_VERSION=VERSION;R.__v39FreeKickDefensiveLayers=true;
})(typeof globalThis!=='undefined'?globalThis:this);
