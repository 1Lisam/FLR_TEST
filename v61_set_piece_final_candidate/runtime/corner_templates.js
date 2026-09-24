(function(root){'use strict';
const R=root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v59CornerTemplates)return;
const O=t=>t==='HOME'?'AWAY':'HOME',C=(v,a,b)=>Math.max(a,Math.min(b,v)),L=(t,x,y)=>t==='HOME'?{x,y}:{x:105-x,y:68-y},P=(m,id)=>m.playersById[id];
function take(a,u,rs){const p=a.filter(q=>!u.has(q.id)&&rs.includes(q.role)).sort((x,y)=>x.id.localeCompare(y.id))[0];if(p)u.add(p.id);return p}
function put(s,p,w,r,q=false){if(!p)return;s.targets[p.id]={x:C(w.x,1,104),y:C(w.y,1,67),task:`CORNER_${r}_HOLD`,required:q,sprint:false};if(q)s.requiredIds.push(p.id);s.cornerPlan.roles[p.id]=r}
function defend(m,s,ds,t,top,short,danger){
 const used=new Set(),shortDefender=short?take(ds,used,['FB','CM','WF','CB']):null;
 if(shortDefender)put(s,shortDefender,L(t,99,top?16:52),'SHORT_DEFENDER',true);
 for(const at of danger){
  const v=s.targets[at.id],al=L(t,v.x,v.y),mark={x:C(al.x+1.1,91,99),y:al.y};
  const rank=p=>p.role==='CB'||p.role==='FB'?0:p.role==='CM'?1:p.role==='WF'?2:3;
  const candidates=ds.filter(p=>!used.has(p.id)&&p.role!=='ST').sort((a,b)=>rank(a)-rank(b)||Math.hypot(L(t,a.x,a.y).x-mark.x,L(t,a.x,a.y).y-mark.y)-Math.hypot(L(t,b.x,b.y).x-mark.x,L(t,b.x,b.y).y-mark.y)||a.id.localeCompare(b.id));
  const marker=candidates[0];if(!marker)continue;used.add(marker.id);marker.markTargetId=at.id;put(s,marker,L(t,mark.x,mark.y),'BOX_MARK',true);
 }
 let wide=0,box=0;
 for(const p of ds.filter(q=>!used.has(q.id)).sort((a,b)=>a.id.localeCompare(b.id))){
  p.markTargetId=null;
  if(p.role==='ST'){put(s,p,L(O(t),52,34),'COUNTER_OUTLET');continue;}
  if(p.role==='CM'){const lane=L(t,p.x,p.y).y,y=lane<31?25:lane>37?43:25;put(s,p,L(t,lane>=31&&lane<=37?84:82,top?y:68-y),'EDGE_CLEARANCE');continue;}
  if(p.role==='WF'){const n=wide++;const side=/^L/.test(p.slot||'')?0:/^R/.test(p.slot||'')?1:n%2;put(s,p,L(t,82-Math.floor(n/2)*2,side?51:17),'WIDE_EDGE_CLEARANCE');continue;}
  const n=box++;put(s,p,L(t,97,25+(n%4)*6),'BOX_ZONE');
 }
}
function build(m,s){
 const r=m.restart;if(!r||r.kind!=='CORNER'||s.cornerPlan)return s;
 const t=r.team,d=O(t),top=L(t,r.x,r.y).y<34,short=String(r.cornerType||'').toUpperCase()==='SHORT',plan=s.cornerPlan={version:'V59-CORNER-SPATIAL-BASELINE-1.0',family:short?'SHORT_CORNER':'DELIVERED_CORNER',roles:{},complete:false,launched:false};
 const kt=s.targets[s.kickerId],k=P(m,s.kickerId);s.targets={};s.requiredIds=[];if(k&&kt){s.targets[k.id]=kt;s.requiredIds.push(k.id);plan.roles[k.id]='KICKER';}
 const a=m.players.filter(p=>p.team===t&&p.role!=='GK'),ds=m.players.filter(p=>p.team===d&&p.role!=='GK'),u=new Set([s.kickerId]),add=(p,x,y,role,q=false)=>put(s,p,L(t,x,y),role,q);
 const first=[take(a,u,['ST']),take(a,u,['WF']),take(a,u,['WF'])],second=short?[take(a,u,['CM'])]:[take(a,u,['CM']),take(a,u,['CM'])],edge=[take(a,u,['CM','FB']),take(a,u,['CM','FB'])],rest=[take(a,u,['CB','FB']),take(a,u,['CB','FB'])],sp=short?take(a,u,['CM','WF','FB']):null;
 add(sp,98,top?11:57,'SHORT_OPTION');first.forEach((p,i)=>add(p,97-i,top?[28,34,41][i]:[40,34,27][i],`FIRST_WAVE_${i}`,true));second.forEach((p,i)=>add(p,91-i*2,top?[26,42][i]:[42,26][i],`SECOND_WAVE_${i}`,true));edge.forEach((p,i)=>add(p,84-i*3,top?[24,44][i]:[44,24][i],`EDGE_${i}`));rest.forEach((p,i)=>add(p,62-i*8,[27,41][i],`REST_DEFENCE_${i}`));
 let z=0;for(const p of a)if(!plan.roles[p.id])add(p,58+(z%2)*6,24+(z++%3)*10,'REST_DEFENCE_SUPPORT');put(s,m.players.find(p=>p.team===t&&p.role==='GK'),L(t,5,34),'ATTACK_GK');
 defend(m,s,ds,t,top,short,first.concat(second).filter(Boolean));put(s,m.players.find(p=>p.team===d&&p.role==='GK'),L(t,102,34),'GK_SET',true);plan.complete=true;return s;
}
// This wrapper still refreshes the other actors during SET_HOLD; restart_movement
// preserves the kicker's wait task until the core enters RUN_UP.
function apply(m,s){if(!s||m.restart?.kind!=='CORNER')return s;build(m,s);return s}
const b=R.begin.bind(R),a=R.assign.bind(R);R.begin=m=>apply(m,b(m));R.assign=m=>{const v=a(m);apply(m,m.restart?.setup);return v};R.prepareCornerLaunch=()=>{};R.cornerLiveStart=(m,r)=>JSON.parse(JSON.stringify(r?.setup?.cornerPlan||null));R.cornerLiveUpdate=()=>false;R.CORNER_TEMPLATE_VERSION='V59-CORNER-SPATIAL-BASELINE-1.0';R.__v59CornerTemplates=true})(globalThis);
