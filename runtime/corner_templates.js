(function(root){'use strict';
const R=root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v59CornerTemplates)return;
const O=t=>t==='HOME'?'AWAY':'HOME',C=(v,a,b)=>Math.max(a,Math.min(b,v)),L=(t,x,y)=>t==='HOME'?{x,y}:{x:105-x,y:68-y},P=(m,id)=>m.playersById[id];
function take(a,u,rs){const p=a.filter(q=>!u.has(q.id)&&rs.includes(q.role)).sort((x,y)=>x.id.localeCompare(y.id))[0];if(p)u.add(p.id);return p}
const side=p=>/^[LR]/.test(p.slot||'')?p.slot[0]:null;
// Target y is in the restart team's frame. Convert it to the candidate's own
// attacking frame before comparing authored L/R slots.
function takeLane(a,u,rs,restartTeam,target){
 const candidates=a.filter(p=>!u.has(p.id)&&rs.includes(p.role));
 const ownY=p=>p.team===restartTeam?target.y:68-target.y,rank=p=>rs.indexOf(p.role);
 candidates.sort((p,q)=>{
  const mismatch=v=>side(v)&&Math.abs(ownY(v)-34)>.5&&((ownY(v)<34?'L':'R')!==side(v))?1:0;
  const cost=v=>Math.hypot(v.x-L(restartTeam,target.x,target.y).x,v.y-L(restartTeam,target.x,target.y).y);
  return rank(p)-rank(q)||mismatch(p)-mismatch(q)||cost(p)-cost(q)||p.id.localeCompare(q.id);
 });
 const pick=candidates[0];if(pick)u.add(pick.id);return pick;
}
function takePair(a,u,rs,restartTeam,targets){
 const result=[],ownY=y=>restartTeam===a[0]?.team?y:68-y;
 // Bind an available symmetric pair before distance or target iteration can
 // give its left lane to the right actor on a mirrored corner.
 for(const role of rs){
  const left=a.find(p=>!u.has(p.id)&&p.role===role&&side(p)==='L'),right=a.find(p=>!u.has(p.id)&&p.role===role&&side(p)==='R');
  if(left&&right&&targets.length===2){const indices=[0,1].sort((i,j)=>ownY(targets[i].y)-ownY(targets[j].y));result[indices[0]]=left;result[indices[1]]=right;u.add(left.id);u.add(right.id);return result;}
 }
 for(const i of targets.map((_,i)=>i).sort((i,j)=>Math.abs(targets[j].y-34)-Math.abs(targets[i].y-34)||i-j))result[i]=takeLane(a,u,rs,restartTeam,targets[i]);return result;
}
function put(s,p,w,r,q=false){if(!p)return;s.targets[p.id]={x:C(w.x,1,104),y:C(w.y,1,67),task:`CORNER_${r}_HOLD`,required:q,sprint:false};if(q)s.requiredIds.push(p.id);s.cornerPlan.roles[p.id]=r}
function defend(m,s,ds,t,top,short,danger){
 const used=new Set(),shortDefender=short?takeLane(ds,used,['FB','CM','WF','CB'],t,{x:99,y:top?16:52}):null;
 if(shortDefender)put(s,shortDefender,L(t,99,top?16:52),'SHORT_DEFENDER',true);
 const ownY=at=>L(O(t),s.targets[at.id].x,s.targets[at.id].y).y;
 const ordered=[...danger].sort((a,b)=>ownY(a)-ownY(b)||a.id.localeCompare(b.id)),paired=new Map();
 if(!short&&ordered.length>=4&&['LB','LCB','RCB','RB'].every(slot=>ds.some(p=>p.slot===slot&&['CB','FB'].includes(p.role)))){
  for(const [slot,index] of [['LB',0],['LCB',1],['RCB',ordered.length-2],['RB',ordered.length-1]])paired.set(ordered[index].id,ds.find(p=>p.slot===slot));
 }
 for(const at of [...danger].sort((a,b)=>Math.abs(L(t,s.targets[b.id].x,s.targets[b.id].y).y-34)-Math.abs(L(t,s.targets[a.id].x,s.targets[a.id].y).y-34)||a.id.localeCompare(b.id))){
  const v=s.targets[at.id],al=L(t,v.x,v.y),mark={x:C(al.x+1.1,91,99),y:al.y};
  const rank=p=>p.role==='CB'||p.role==='FB'?0:p.role==='CM'?1:p.role==='WF'?2:3;
  const candidates=ds.filter(p=>!used.has(p.id)&&p.role!=='ST').sort((a,b)=>{
   const mismatch=p=>side(p)&&Math.abs((p.team===t?mark.y:68-mark.y)-34)>.5&&(((p.team===t?mark.y:68-mark.y)<34?'L':'R')!==side(p))?1:0;
   return rank(a)-rank(b)||mismatch(a)-mismatch(b)||Math.hypot(a.x-L(t,mark.x,mark.y).x,a.y-L(t,mark.x,mark.y).y)-Math.hypot(b.x-L(t,mark.x,mark.y).x,b.y-L(t,mark.x,mark.y).y)||a.id.localeCompare(b.id);
  });
  const marker=paired.get(at.id)||candidates.find(p=>![...paired.values()].includes(p));if(!marker)continue;used.add(marker.id);marker.markTargetId=at.id;put(s,marker,L(t,mark.x,mark.y),'BOX_MARK',true);
 }
 let wide=0,box=0;
 for(const p of ds.filter(q=>!used.has(q.id)).sort((a,b)=>a.id.localeCompare(b.id))){
  p.markTargetId=null;
  if(p.role==='ST'){put(s,p,L(O(t),52,34),'COUNTER_OUTLET');continue;}
  if(p.role==='CM'){const own=side(p),y=own==='L'?25:own==='R'?43:top?43:25;put(s,p,L(O(t),own?23:21,y),'EDGE_CLEARANCE');continue;}
  if(p.role==='WF'){const n=wide++;const lane=side(p)==='L'?51:side(p)==='R'?17:n%2?51:17;put(s,p,L(t,82-Math.floor(n/2)*2,lane),'WIDE_EDGE_CLEARANCE');continue;}
  const n=box++,own=side(p),lane=p.role==='CB'?(own==='L'?40:own==='R'?28:34):p.role==='FB'?(own==='L'?46:own==='R'?22:34):25+(n%4)*6;
  put(s,p,L(t,97,lane),'BOX_ZONE');
 }
}
function preserveLineBands(m,s){
 for(const team of ['HOME','AWAY']){
  const bySlot=slot=>m.players.find(p=>p.team===team&&p.slot===slot),target=p=>p&&s.targets[p.id]&&L(team,s.targets[p.id].x,s.targets[p.id].y);
  const setY=(p,y)=>{const t=s.targets[p.id],own=L(team,t.x,t.y);t.y=L(team,own.x,y).y;};
  for(const [left,right] of [['LCB','RCB'],['LCM','RCM']]){
   const l=bySlot(left),r=bySlot(right),a=target(l),b=target(r);
   if(a&&a.y>33.5)setY(l,33.5);
   if(b&&b.y<34.5)setY(r,34.5);
  }
  for(const [fbSlot,cbSlot,sign] of [['LB','LCB',-1],['RB','RCB',1]]){
   const fb=bySlot(fbSlot),cb=bySlot(cbSlot),f=target(fb),c=target(cb);
   if(!f)continue;
   const limit=c?c.y+sign*.5:sign<0?33.5:34.5;
   if(sign<0&&f.y>limit)setY(fb,limit);
   if(sign>0&&f.y<limit)setY(fb,limit);
  }
 }
}
function build(m,s){
 const r=m.restart;if(!r||r.kind!=='CORNER'||s.cornerPlan)return s;
 const t=r.team,d=O(t),top=L(t,r.x,r.y).y<34,short=String(r.cornerType||'').toUpperCase()==='SHORT',plan=s.cornerPlan={version:'V59-CORNER-SPATIAL-BASELINE-1.0',family:short?'SHORT_CORNER':'DELIVERED_CORNER',roles:{},complete:false,launched:false};
 const kt=s.targets[s.kickerId],k=P(m,s.kickerId);s.targets={};s.requiredIds=[];if(k&&kt){s.targets[k.id]=kt;s.requiredIds.push(k.id);plan.roles[k.id]='KICKER';
  // Lane-aware allocations can settle before the kicker completes the outside
  // approach. Budget that actual route before SET_HOLD freezes the run-up start.
  s.minReadyAt=Math.max(s.minReadyAt,s.createdAt+Math.hypot(k.x-kt.x,k.y-kt.y)/7.2+.5);
 }
 const a=m.players.filter(p=>p.team===t&&p.role!=='GK'),ds=m.players.filter(p=>p.team===d&&p.role!=='GK'),u=new Set([s.kickerId]),add=(p,x,y,role,q=false)=>put(s,p,L(t,x,y),role,q);
 const first=[take(a,u,['ST'])],waveY=top?[28,34,41]:[40,34,27],wideAvailable=a.filter(p=>p.role==='WF'&&!u.has(p.id));
 if(wideAvailable.length>=2){const pair=takePair(a,u,['WF'],t,[{x:96,y:waveY[1]},{x:95,y:waveY[2]}]);first.push(...pair);}else{first.push(takeLane(a,u,['WF'],t,{x:96,y:waveY[1]}),null);}
 const secondY=top?[26,42]:[42,26],edgeY=top?[24,44]:[44,24];
 // Keep the arrival wave for a short pattern too; its separate short option
 // can use a fullback while the remaining back and CB spine protect the counter.
 const second=takePair(a,u,['CM'],t,[{x:91,y:secondY[0]},{x:89,y:secondY[1]}]);
 const edge=takePair(a,u,['CM','WF'],t,[{x:84,y:edgeY[0]},{x:81,y:edgeY[1]}]);
 const rest=takePair(a,u,['CB','FB'],t,[{x:62,y:27},{x:54,y:41}]);
 const sp=short?takeLane(a,u,['CM','WF','FB'],t,{x:98,y:top?11:57}):null;
 add(sp,98,top?11:57,'SHORT_OPTION');first.forEach((p,i)=>add(p,97-i,top?[28,34,41][i]:[40,34,27][i],`FIRST_WAVE_${i}`,true));second.forEach((p,i)=>add(p,91-i*2,top?[26,42][i]:[42,26][i],`SECOND_WAVE_${i}`,true));edge.forEach((p,i)=>add(p,84-i*3,top?[24,44][i]:[44,24][i],`EDGE_${i}`));rest.forEach((p,i)=>add(p,62-i*8,[27,41][i],`REST_DEFENCE_${i}`));
 let z=0;for(const p of a)if(!plan.roles[p.id]){const lane=side(p)==='L'?24:side(p)==='R'?44:34;add(p,58+(z++%2)*6,lane,'REST_DEFENCE_SUPPORT');}put(s,m.players.find(p=>p.team===t&&p.role==='GK'),L(t,5,34),'ATTACK_GK');
 defend(m,s,ds,t,top,short,first.concat(second).filter(Boolean));preserveLineBands(m,s);
 // Share setup and live rest-defence geometry with the tactical authority.
 const tactics=root.FLRPG_TACTICS||(typeof require==='function'?require('./tactical_movement.js'):null);
 tactics?.prepareAttackingSetPieceRestDefence(m,s,plan);put(s,m.players.find(p=>p.team===d&&p.role==='GK'),L(t,102,34),'GK_SET',true);plan.complete=true;return s;
}
// This wrapper still refreshes the other actors during SET_HOLD; restart_movement
// preserves the kicker's wait task until the core enters RUN_UP.
function apply(m,s){if(!s||m.restart?.kind!=='CORNER')return s;build(m,s);return s}
const b=R.begin.bind(R),a=R.assign.bind(R);R.begin=m=>apply(m,b(m));R.assign=m=>{const v=a(m);apply(m,m.restart?.setup);return v};R.prepareCornerLaunch=()=>{};R.cornerLiveStart=(m,r)=>JSON.parse(JSON.stringify(r?.setup?.cornerPlan||null));R.cornerLiveUpdate=()=>false;R.CORNER_TEMPLATE_VERSION='V59-CORNER-SPATIAL-BASELINE-1.0';R.__v59CornerTemplates=true})(globalThis);
