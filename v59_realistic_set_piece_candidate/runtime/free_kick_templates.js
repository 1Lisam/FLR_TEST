(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v59FreeKickTemplates)return;
const VERSION='V59-STANDARD-FREE-KICK-BASELINE-1.0',HOME='HOME',other=t=>t===HOME?'AWAY':HOME;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),local=(t,x,y)=>t===HOME?{x,y}:{x:105-x,y:68-y},world=(t,x,y)=>t===HOME?{x,y}:{x:105-x,y:68-y};
const player=(m,id)=>m.playersById?.[id]||m.players.find(p=>p.id===id);
function type(r){return String(r.freeKickType||'DIRECT').toUpperCase()==='INDIRECT'?'INDIRECT':'DIRECT';}
function family(lp,k){if(lp.x<58)return`DEEP_${k}`;if(lp.y<=18||lp.y>=50)return k==='DIRECT'?'WIDE_DIRECT_DELIVERY':'INDIRECT_DELIVERY';if(k==='INDIRECT')return'INDIRECT_DELIVERY';const d=Math.hypot(105-lp.x,34-lp.y);return d<=22?'DIRECT_SHOT_CLOSE':d<=30?'DIRECT_SHOT_MID':'DIRECT_LONG_DELIVERY';}
function choose(ps,used,roles){const p=ps.filter(q=>!used.has(q.id)&&roles.includes(q.role)).sort((a,b)=>a.id.localeCompare(b.id))[0];if(p)used.add(p.id);return p;}
function put(s,plan,p,w,role,required=false){if(!p)return;s.targets[p.id]={x:clamp(w.x,1,104),y:clamp(w.y,1,67),task:`FREE_KICK_${role}_HOLD`,required,sprint:false};if(required)s.requiredIds.push(p.id);plan.roles[p.id]=role;}
function build(m,s){const r=m.restart;if(!r||r.kind!=='FREE_KICK'||s.freeKickPlan)return s;const team=r.team,def=other(team),lp=local(team,r.x,r.y),k=type(r),f=family(lp,k),plan=s.freeKickPlan={version:VERSION,freeKickType:k,family:f,geometry:f.startsWith('DEEP')?'DEEP_FREE_KICK_DELIVERY':'FREE_KICK_SPATIAL_BASELINE',roles:{},principalRunnerIds:[],stage:'SETTLE',launched:false};
 const kicker=player(m,s.kickerId),kt=s.targets[s.kickerId];s.targets={};s.requiredIds=[];if(kicker&&kt){s.targets[kicker.id]=kt;s.requiredIds.push(kicker.id);plan.roles[kicker.id]='KICKER';}
 const atk=m.players.filter(p=>p.team===team&&p.role!=='GK'),defs=m.players.filter(p=>p.team===def&&p.role!=='GK'),used=new Set([s.kickerId]),take=rs=>choose(atk,used,rs),add=(p,x,y,role,req=false)=>put(s,plan,p,world(team,x,y),role,req);
 if(f.startsWith('DEEP')){const cb1=take(['CB']),cb2=take(['CB']),fb=take(['FB']),short=k==='INDIRECT'?take(['CM','FB','WF']):null,cm1=take(['CM']),cm2=take(['CM']),wf1=take(['WF']),wf2=take(['WF']),st=take(['ST']);
  add(cb1,clamp(lp.x-9,23,55),28,'RESIDUAL_COVER_1');add(cb2,clamp(lp.x-7,25,55),40,'RESIDUAL_COVER_2');add(fb,clamp(lp.x+3,30,62),lp.y<34?13:55,'CONNECTING_FB');add(short,clamp(lp.x+3,20,64),clamp(lp.y+(lp.y<34?7:-7),8,60),'SHORT_CONNECTION',k==='INDIRECT');add(cm1,clamp(lp.x+10,38,74),27,'SECOND_BALL_1');add(cm2,clamp(lp.x+12,40,76),41,'SECOND_BALL_2');add(wf1,clamp(lp.x+24,54,86),20,'FIRST_CONTEST_WF_1',true);add(st,clamp(lp.x+26,56,88),34,'FIRST_CONTEST_ST',true);add(wf2,clamp(lp.x+23,53,85),48,'FIRST_CONTEST_WF_2',true);plan.principalRunnerIds=[wf1,st,wf2].filter(Boolean).map(p=>p.id);
 }else{const short=(f==='INDIRECT_DELIVERY'||f==='WIDE_DIRECT_DELIVERY')?take(['CM','WF','FB']):null,st=take(['ST']),wf1=take(['WF']),wf2=take(['WF']),cb=take(['CB']),fb=take(['FB']),cm1=take(['CM']),cm2=take(['CM']);
  add(short,clamp(lp.x-6,6,96),clamp(lp.y+(lp.y<34?7:-7),7,61),'SHORT_OPTION');add(st,91,34,'TARGET_CENTRAL',true);add(wf1,89,26,'TARGET_NEAR',true);add(wf2,92,42,'TARGET_FAR',true);add(cb,83,28,'SECOND_BALL_1');add(fb,81,41,'SECOND_BALL_2');add(cm1,60,27,'REST_DEFENCE_1');add(cm2,55,41,'REST_DEFENCE_2');}
 let i=0;for(const p of atk)if(!plan.roles[p.id])add(p,58+(i%2)*6,25+(i++%3)*10,'REST_DEFENCE_SUPPORT');const ownGk=m.players.find(p=>p.team===team&&p.role==='GK');if(ownGk)put(s,plan,ownGk,world(team,5,34),'ATTACK_GK');
 const targets=Object.entries(plan.roles).filter(([,v])=>v.startsWith('TARGET_')||v.startsWith('FIRST_CONTEST')).map(([id])=>id);
 // Defensive responsibilities use independent, advancing channels.  Do not use
 // jitter here: each semantic channel has authored deterministic coordinates.
 let markIndex=0,secondBallIndex=0,boxZoneIndex=0;
 for(const d of defs){let role='BOX_ZONE',x,y;
  if(markIndex<targets.length){const a=player(m,targets[markIndex++]),al=a&&local(team,s.targets[a.id].x,s.targets[a.id].y);x=clamp((al?.x||(f.startsWith('DEEP')?80:91))+1.2,f.startsWith('DEEP')?60:88,99);y=al?.y??34;role='MARK_CONTEST';d.markTargetId=a?.id||null;}
  else if(d.role==='CM'){const lane=secondBallIndex++;x=f.startsWith('DEEP')?clamp(lp.x+17+lane*2.4,54,84):84-lane*2.2;y=lane%2?42:26;role='DEFENSIVE_SECOND_BALL';}
  else if(d.role==='ST'){x=f.startsWith('DEEP')?clamp(lp.x-4,40,58):52;y=34;role='COUNTER_OUTLET';}
  else{const lane=boxZoneIndex++;x=f.startsWith('DEEP')?clamp(lp.x+29+Math.floor(lane/3)*2,62,93):91+Math.floor(lane/3)*2;y=24+(lane%3)*10;role='BOX_ZONE';}
  put(s,plan,d,role==='COUNTER_OUTLET'?world(def,52,34):world(team,x,y),role,role==='MARK_CONTEST');}
 const gk=m.players.find(p=>p.team===def&&p.role==='GK');if(gk)put(s,plan,gk,world(team,102,34),'GK_COMPLEMENT',true);plan.complete=true;return s;}
function launch(m,s){const p=s?.freeKickPlan;if(!p||p.launched||m.restart?.stage!=='APPROACH')return;p.launched=true;p.stage='APPROACH';for(const [id,role] of Object.entries(p.roles)){const t=s.targets[id];if(!t||role==='KICKER'||role.includes('REST')||role.includes('SECOND_BALL')||role==='COUNTER_OUTLET'||role==='GK_COMPLEMENT'||role==='BOX_ZONE'||role==='MARK_CONTEST')continue;t.task=`FREE_KICK_${role}_RUN`;t.sprint=true;}}
function apply(m,s){if(!s||m.restart?.kind!=='FREE_KICK')return s;build(m,s);launch(m,s);return s;}
const begin=R.begin.bind(R),assign=R.assign.bind(R);R.begin=m=>apply(m,begin(m));R.assign=m=>{const x=assign(m);apply(m,m.restart?.setup);return x;};R.FREE_KICK_TEMPLATE_VERSION=VERSION;R.__v59FreeKickTemplates=true;
})(typeof globalThis!=='undefined'?globalThis:this);
