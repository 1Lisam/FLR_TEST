(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v59FreeKickTemplates)return;
const VERSION='V59-STANDARD-FREE-KICK-BASELINE-1.0',HOME='HOME',other=t=>t===HOME?'AWAY':HOME;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),local=(t,x,y)=>t===HOME?{x,y}:{x:105-x,y:68-y},world=(t,x,y)=>t===HOME?{x,y}:{x:105-x,y:68-y};
const player=(m,id)=>m.playersById?.[id]||m.players.find(p=>p.id===id);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),structural=p=>['CB','FB','CM'].includes(p.role);
function type(r){return String(r.freeKickType||'DIRECT').toUpperCase()==='INDIRECT'?'INDIRECT':'DIRECT';}
function family(lp,k){if(lp.x<58)return`DEEP_${k}`;if(lp.y<=18||lp.y>=50)return k==='DIRECT'?'WIDE_DIRECT_DELIVERY':'INDIRECT_DELIVERY';if(k==='INDIRECT')return'INDIRECT_DELIVERY';const d=Math.hypot(105-lp.x,34-lp.y);return d<=22?'DIRECT_SHOT_CLOSE':d<=30?'DIRECT_SHOT_MID':'DIRECT_LONG_DELIVERY';}
function corridorPenalty(m,p,target){
 const dx=target.x-p.x,dy=target.y-p.y,len=Math.hypot(dx,dy);if(len<.1)return 0;let penalty=0;
 for(const q of m.players){if(q.id===p.id||q.team!==p.team||q.role==='GK')continue;const progress=((q.x-p.x)*dx+(q.y-p.y)*dy)/(len*len);if(progress<.025||progress>.16)continue;const lateral=Math.abs((q.x-p.x)*dy-(q.y-p.y)*dx)/len;if(lateral>=3)continue;penalty+=(3-lateral)*1.35*8.2;
 }
 return penalty;
}
function choose(m,ps,used,roles,target,plan,key,reserveStructural=0){
 const available=ps.filter(p=>!used.has(p.id)&&roles.includes(p.role)),structuralLeft=available.filter(structural).length,
  candidates=available.filter(p=>!(reserveStructural&&structural(p)&&structuralLeft<=reserveStructural&&available.some(q=>!structural(q))));
 const scored=(candidates.length?candidates:available).map(p=>{const rank=roles.indexOf(p.role),travel=distance(p,target),congestion=key==='TARGET_CENTRAL'?corridorPenalty(m,p,target):0,score=rank*14+travel*.48+congestion;return{p,rank,travel,congestion,score};}).sort((a,b)=>a.score-b.score||a.rank-b.rank||a.congestion-b.congestion||a.travel-b.travel||a.p.id.localeCompare(b.p.id));
 const pick=scored[0];if(!pick)return null;used.add(pick.p.id);
 const preferred=scored.filter(x=>x.rank===0)[0];plan.allocation.roles[key]={actorId:pick.p.id,role:pick.p.role,rank:pick.rank,distance:Number(pick.travel.toFixed(3)),corridorPenalty:Number(pick.congestion.toFixed(3)),score:Number(pick.score.toFixed(3)),rationale:pick.rank?'fallback_current_route_feasibility':'preferred_role_route_feasible',preferredCandidate:preferred&&{actorId:preferred.p.id,role:preferred.p.role,distance:Number(preferred.travel.toFixed(3)),corridorPenalty:Number(preferred.congestion.toFixed(3)),score:Number(preferred.score.toFixed(3))}};
 return pick.p;
}
function put(s,plan,p,w,role,required=false){if(!p)return;const formationRun=/^(?:TARGET_|SECOND_BALL_|SHORT_OPTION)/.test(role);s.targets[p.id]={x:clamp(w.x,1,104),y:clamp(w.y,1,67),task:`FREE_KICK_${role}_HOLD`,required,sprint:formationRun};if(required)s.requiredIds.push(p.id);plan.roles[p.id]=role;}
function build(m,s){const r=m.restart;if(!r||r.kind!=='FREE_KICK'||s.freeKickPlan)return s;const team=r.team,def=other(team),lp=local(team,r.x,r.y),k=type(r),f=family(lp,k),restartMode=f.startsWith('DEEP')?'QUICK_RESTART':'SETTLED_RESTART',plan=s.freeKickPlan={version:VERSION,freeKickType:k,family:f,restartMode,geometry:f.startsWith('DEEP')?'DEEP_QUICK_CONTINUITY':'FREE_KICK_SPATIAL_BASELINE',roles:{},principalRunnerIds:[],stage:'SETTLE',launched:false,allocation:{model:'V60_CURRENT_STATE_ROLE_ROUTE',roles:{}}};s.restartMode=restartMode;
 const kicker=player(m,s.kickerId),kt=s.targets[s.kickerId];s.targets={};s.requiredIds=[];if(kicker&&kt){s.targets[kicker.id]=kt;s.requiredIds.push(kicker.id);plan.roles[kicker.id]='KICKER';}
 if(restartMode==='QUICK_RESTART'){plan.complete=false;return s;}
 const atk=m.players.filter(p=>p.team===team&&p.role!=='GK'),defs=m.players.filter(p=>p.team===def&&p.role!=='GK'),used=new Set([s.kickerId]),add=(p,x,y,role,req=false)=>put(s,plan,p,world(team,x,y),role,req),pick=(key,roles,x,y,reserve=0)=>choose(m,atk,used,roles,world(team,x,y),plan,key,reserve);
 {const shortTarget={x:clamp(lp.x-6,6,96),y:clamp(lp.y+(lp.y<34?7:-7),7,61)},short=(f==='INDIRECT_DELIVERY'||f==='WIDE_DIRECT_DELIVERY')?pick('SHORT_OPTION',['CM','WF','FB'],shortTarget.x,shortTarget.y):null,
  // Role rank leads the choice, while travel and a current-position corridor
  // penalty prevent a nominal forward from being assigned through a blocked route.
  // Keep four structural players available for the rest-defence/second-ball layers.
  st=pick('TARGET_CENTRAL',['ST','CB','WF','CM','FB'],91,34,4),wf1=pick('TARGET_NEAR',['WF','ST','CB','CM','FB'],89,26,4),wf2=pick('TARGET_FAR',['CB','ST','WF','CM','FB'],92,42,4),
  rd1=pick('REST_DEFENCE_1',['CB','FB','CM'],60,27),rd2=pick('REST_DEFENCE_2',['CB','FB','CM'],55,41),sb1=pick('SECOND_BALL_1',['CM','FB','CB'],83,28),sb2=pick('SECOND_BALL_2',['CM','FB','CB'],81,41);
  add(short,shortTarget.x,shortTarget.y,'SHORT_OPTION');add(st,91,34,'TARGET_CENTRAL',true);add(wf1,89,26,'TARGET_NEAR',true);add(wf2,92,42,'TARGET_FAR',true);add(rd1,60,27,'REST_DEFENCE_1');add(rd2,55,41,'REST_DEFENCE_2');add(sb1,83,28,'SECOND_BALL_1');add(sb2,81,41,'SECOND_BALL_2');}
 let i=0;for(const p of atk)if(!plan.roles[p.id])add(p,58+(i%2)*6,25+(i++%3)*10,'REST_DEFENCE_SUPPORT');const ownGk=m.players.find(p=>p.team===team&&p.role==='GK');if(ownGk)put(s,plan,ownGk,world(team,5,34),'ATTACK_GK');
 const targets=Object.entries(plan.roles).filter(([,v])=>v.startsWith('TARGET_')||v.startsWith('FIRST_CONTEST')).map(([id])=>id);
 // Defensive responsibilities use independent, advancing channels.  Do not use
 // jitter here: each semantic channel has authored deterministic coordinates.
 let markIndex=0,secondBallIndex=0,boxZoneIndex=0;
 for(const d of defs){let role='BOX_ZONE',x,y;
  if(markIndex<targets.length){const a=player(m,targets[markIndex++]),al=a&&local(team,s.targets[a.id].x,s.targets[a.id].y);x=clamp((al?.x||(f.startsWith('DEEP')?80:91))+1.2,f.startsWith('DEEP')?60:88,99);y=al?.y??34;role='MARK_CONTEST';d.markTargetId=a?.id||null;}
  else if(d.role==='CM'){const lane=secondBallIndex++;x=f.startsWith('DEEP')?clamp(lp.x+17+lane*2.4,54,84):84-lane*2.2;y=lane%2?42:26;role='DEFENSIVE_SECOND_BALL';}
  else if(d.role==='ST'){x=f.startsWith('DEEP')?clamp(lp.x-4,40,58):52;y=f.startsWith('DEEP')?(lp.y<34?46:22):34;role='COUNTER_OUTLET';}
  else{const lane=boxZoneIndex++;x=f.startsWith('DEEP')?clamp(lp.x+29+Math.floor(lane/3)*2,62,93):91+Math.floor(lane/3)*2;y=24+(lane%3)*10;role='BOX_ZONE';}
  put(s,plan,d,role==='COUNTER_OUTLET'&&f.startsWith('DEEP')?world(team,x,y):role==='COUNTER_OUTLET'?world(def,52,34):world(team,x,y),role,role==='MARK_CONTEST');}
 const gk=m.players.find(p=>p.team===def&&p.role==='GK');if(gk)put(s,plan,gk,world(team,102,34),'GK_COMPLEMENT',true);plan.complete=true;return s;}
function launch(m,s){const p=s?.freeKickPlan;if(!p||p.launched||m.restart?.stage!=='APPROACH')return;p.launched=true;p.stage='APPROACH';for(const [id,role] of Object.entries(p.roles)){const t=s.targets[id];if(!t||role==='KICKER'||role.includes('REST')||role.includes('SECOND_BALL')||role==='COUNTER_OUTLET'||role==='GK_COMPLEMENT'||role==='BOX_ZONE'||role==='MARK_CONTEST')continue;t.task=`FREE_KICK_${role}_RUN`;t.sprint=true;}}
function apply(m,s){if(!s||m.restart?.kind!=='FREE_KICK')return s;build(m,s);launch(m,s);return s;}
const begin=R.begin.bind(R),assign=R.assign.bind(R);R.begin=m=>apply(m,begin(m));R.assign=m=>{const x=assign(m);apply(m,m.restart?.setup);return x;};R.FREE_KICK_TEMPLATE_VERSION=VERSION;R.__v59FreeKickTemplates=true;
})(typeof globalThis!=='undefined'?globalThis:this);
