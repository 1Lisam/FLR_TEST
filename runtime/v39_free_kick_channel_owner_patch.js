(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v39FreeKickChannelOwner)return;
const VERSION='V39-FREE-KICK-CHANNEL-OWNER-0.1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const local=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
const player=(m,id)=>m.playersById?.[id]||m.players.find(p=>p.id===id)||null;
const opposite=t=>t==='HOME'?'AWAY':'HOME';
function samePhysicalChannel(a,b){return (Number(a?.y)<34)===(Number(b?.y)<34);}
function assignTracker(m,setup,attacker,fb){
  const plan=setup.freeKickPlan,defs=m.players.filter(p=>p.team===opposite(m.restart.team)&&p.role!=='GK');
  const previous=defs.find(d=>d.id!==fb.id&&d.markTargetId===attacker.id);
  if(previous){
    previous.markTargetId=null;
    if(plan.roles?.[previous.id]==='TRACK_RUNNER')plan.roles[previous.id]='LINE_ZONE';
    const pt=setup.targets?.[previous.id];if(pt){pt.task='FREE_KICK_LINE_HOLD';pt.sprint=false;}
  }
  fb.markTargetId=attacker.id;plan.roles[fb.id]='TRACK_RUNNER';
  const at=setup.targets?.[attacker.id],al=at?local(m.restart.team,at.x,at.y):local(m.restart.team,attacker.x,attacker.y);
  const markX=clamp(al.x+1.3,82,99),markY=clamp(al.y+(al.y<34?.55:-.55),7,61),w=world(m.restart.team,markX,markY);
  setup.targets[fb.id]={...(setup.targets[fb.id]||{}),x:w.x,y:w.y,task:'FREE_KICK_TRACK_RUNNER_HOLD',required:true,sprint:false};
  fb.tx=w.x;fb.ty=w.y;fb.action='FREE_KICK_TRACK_RUNNER_HOLD';fb.tacticalTask='FREE_KICK_TRACK_RUNNER_HOLD';
}
function reconcile(m,setup){
  const r=m?.restart,plan=setup?.freeKickPlan;if(!r||r.kind!=='FREE_KICK'||!plan)return setup;
  const attackTeam=r.team,defTeam=opposite(attackTeam),fbs=m.players.filter(p=>p.team===defTeam&&p.role==='FB');
  const runners=Object.entries(plan.roles||{}).map(([id,role])=>({p:player(m,id),role})).filter(x=>x.p&&x.p.role==='WF'&&/^(PRIMARY|SECONDARY|DECOY)_RUNNER$/.test(x.role));
  for(const {p:a} of runners){
    const physical=[...fbs].filter(f=>samePhysicalChannel(f,a)).sort((x,y)=>Math.abs(x.y-a.y)-Math.abs(y.y-a.y))[0];
    if(!physical)continue;
    const current=m.players.find(d=>d.team===defTeam&&d.markTargetId===a.id)||null;
    const currentAligned=current&&samePhysicalChannel(current,a)&&Math.abs(current.y-a.y)<=18;
    if(!currentAligned)assignTracker(m,setup,a,physical);
  }
  plan.v39PhysicalChannelOwner=VERSION;return setup;
}
const begin=R.begin.bind(R),assign=R.assign.bind(R),debug=R.debugSummary?.bind(R);
R.begin=function(m){const out=begin(m);reconcile(m,out);return out;};
R.assign=function(m){const out=assign(m);reconcile(m,m.restart?.setup);return out;};
if(debug)R.debugSummary=function(m){const d=debug(m);if(d&&m.restart?.setup?.freeKickPlan)d.freeKickPlan=m.restart.setup.freeKickPlan;return d;};
R.V39_FREE_KICK_CHANNEL_OWNER_VERSION=VERSION;R.__v39FreeKickChannelOwner=true;
})(typeof globalThis!=='undefined'?globalThis:this);
