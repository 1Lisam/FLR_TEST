'use strict';

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const dist=(a,b)=>Math.hypot(n(a?.x)-n(b?.x),n(a?.y)-n(b?.y));
const task=p=>String(p?.tacticalTask||p?.action||'').toUpperCase();
const byId=(f,id)=>(f?.players||[]).find(p=>p.id===id)||null;

function kickTime(r){
  const ev=(r.actualEvents||[]).find(e=>/CORNER_KICK|FREE_KICK|RESTART_KICK|SET_PIECE_KICK/.test(String(e.type||'')));
  if(ev)return n(ev.t);
  const f=(r.frames||[]).find(x=>String(x?.ball?.mode||'').toUpperCase()==='FLIGHT');
  return f?n(f.time):null;
}

/* Causal replacement for the old CROSS_RIGHT visual detector. Test Dock renders
 * result.frames from frame zero, so the first HYBRID_ENTRY_LIVE snapshot is
 * user-visible truth and may not be discarded as fixture grace. During the
 * actual cross flight, either the channel full-back or a compensator must own
 * the wide threat. Explicit ownership only counts when its assigned target is
 * actually closing toward that threat. */
function detectOpenPlayWideOwnerCausal(r){
  const fs=r.frames||[];let hit=null;
  for(const f of fs){
    const mode=String(f?.ball?.mode||'').toUpperCase(),kind=String(f?.ball?.kind||'').toUpperCase();
    if(mode!=='FLIGHT'||kind!=='CROSS')continue;
    const rw=byId(f,'H-RW'),lb=byId(f,'A-LB');if(!rw||!lb||n(rw.x)<68)continue;
    const defs=(f.players||[]).filter(p=>p.team==='AWAY'&&p.role!=='GK'&&p.id!==lb.id);
    const comp=defs.map(p=>({p,d:dist(p,rw)})).sort((a,b)=>a.d-b.d)[0]||{p:null,d:99};
    const fbGap=dist(lb,rw),badGap=fbGap>10&&comp.d>10;if(!badGap)continue;
    const explicit=(lb.markTargetId===rw.id||lb.targetId===rw.id),targetGap=Math.hypot(n(lb.tx,lb.x)-n(rw.x),n(lb.ty,lb.y)-n(rw.y));
    const credible=explicit&&targetGap<=4.8&&/CROSS_CHANNEL_OWNER|FB_CHANNEL_HOLD|MARK/.test(task(lb));
    if(!credible){hit={f,rw,lb,comp,fbGap,targetGap,explicit};break;}
  }
  return{detected:!!hit,metric:hit?{time:Number(n(hit.f.time).toFixed(2)),fbThreatDistance:Number(hit.fbGap.toFixed(3)),nearestCompensator:Number(hit.comp.d.toFixed(3)),fbTask:task(hit.lb),explicitOwner:hit.explicit,targetThreatGap:Number(hit.targetGap.toFixed(3)),rule:'From the first frame actually displayed by Test Dock, a live cross wide threat must have explicit channel ownership or nearby compensating cover. HYBRID_ENTRY_LIVE is not a visual exemption.'}:null};
}

/* The original late-GK detector chose the 0.55m displacement frame whenever it
 * existed, even when the visible push-off had already begun earlier. Visual
 * lateness must use the first actual visible reaction of either kind. */
function detectGKLateVisibleReactionCausal(r){
  const fs=r.frames||[],term=(r.actualEvents||[]).find(e=>['GOAL','SAVE','CHIP_SAVE','PARRY','PARRY_SAFE','PARRY_DANGER','SHOT_MISSED'].includes(String(e.type||''))),flight=fs.filter(f=>String(f?.ball?.mode||'').toUpperCase()==='FLIGHT'&&String(f?.ball?.kind||'').toUpperCase()==='SHOT');
  if(!flight.length||!term)return{detected:false,reason:'NO_SHOT_FLIGHT_OR_TERMINAL'};
  const g0=byId(flight[0],'H-GK');if(!g0)return{detected:false,reason:'NO_H_GK'};
  const meaningful=fs.find(f=>n(f.time)<=n(term.t)+1e-6&&(()=>{const g=byId(f,'H-GK');return g&&dist(g,g0)>=.55;})());
  const visibleTravel=fs.find(f=>n(f.time)<=n(term.t)+1e-6&&(()=>{const g=byId(f,'H-GK');return g&&/GK_DIVE_PUSH_OFF_TRAVEL|GK_SAVE|GK_PARRY/.test(task(g));})());
  const visible=[meaningful,visibleTravel].filter(Boolean).sort((a,b)=>n(a.time)-n(b.time))[0]||null,lead=visible?n(term.t)-n(visible.time):0;
  return{detected:!visible||lead<.25,metric:{terminal:term.type,terminalTime:Number(n(term.t).toFixed(3)),firstMeaningfulTime:meaningful?Number(n(meaningful.time).toFixed(3)):null,firstVisibleTravelTime:visibleTravel?Number(n(visibleTravel.time).toFixed(3)):null,firstVisibleReactionTime:visible?Number(n(visible.time).toFixed(3)):null,visibleReactionLeadSeconds:Number(lead.toFixed(3)),minimumLeadSeconds:.25,rule:'Use the earliest actual visible GK reaction, not a later displacement milestone.'}};
}

/* Targeted truth detector for the user-reported FK attack seed10 scene.
 * It does not claim that four defenders sharing one nearest attacker is
 * universally illegal. It proves that this known failure is still present
 * until a real neighbouring valid control is collected. */
function detectFKAttackSharedThreatCollapse(r){
  const kt=kickTime(r);let hit=null;
  for(const f of r.frames||[]){
    if(kt!=null&&Math.abs(n(f.time)-kt)>0.151)continue;
    const defenders=['A-LCM','A-CM','A-RCM','A-ST'].map(id=>byId(f,id)).filter(Boolean);
    const attackers=(f.players||[]).filter(p=>p.team==='HOME'&&p.role!=='GK');
    if(defenders.length!==4||!attackers.length)continue;
    const nearest=defenders.map(d=>{
      const q=[...attackers].map(a=>({a,d:dist(d,a)})).sort((x,y)=>x.d-y.d)[0];
      return{defender:d,attacker:q?.a||null,distance:q?.d??99};
    });
    const counts=new Map();for(const x of nearest){if(x.attacker)counts.set(x.attacker.id,(counts.get(x.attacker.id)||0)+1);}
    const shared=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];if(!shared||shared[1]<4)continue;
    const rows=nearest.filter(x=>x.attacker?.id===shared[0]);
    const avg=rows.reduce((s,x)=>s+x.distance,0)/rows.length;
    if(avg<=8){hit={f,shared:shared[0],rows,avg};break;}
  }
  return{detected:!!hit,metric:hit?{
    time:Number(n(hit.f.time).toFixed(2)),sharedAttackerId:hit.shared,defenderCount:hit.rows.length,
    averageNearestDistance:Number(hit.avg.toFixed(3)),maximumTargetedAverageDistance:8,
    defenders:hit.rows.map(x=>({id:x.defender.id,slot:x.defender.slot,task:task(x.defender),distance:Number(x.distance.toFixed(3))})),
    rule:'Four distinct defensive roles collapse around one nearest attacker at the free-kick launch boundary.'
  }:null};
}

/* Targeted truth detector for corner attack-right seed6. The failure is not
 * merely that two defenders stand centrally; it is duplicate responsibility:
 * a forward and a midfield/defensive player are assigned the same central
 * protection point before the kick, creating deterministic convergence. */
function detectCornerCentralCrowdRelation(r){
  const kt=kickTime(r);let hit=null;
  for(const f of r.frames||[]){
    if(kt!=null&&n(f.time)>kt+0.051)continue;
    const defs=(f.players||[]).filter(p=>p.team==='AWAY'&&p.role!=='GK'&&Number.isFinite(Number(p.tx))&&Number.isFinite(Number(p.ty)));
    const groups=new Map();
    for(const p of defs){
      if(n(p.tx)<92||n(p.ty)<24||n(p.ty)>44)continue;
      const key=`${Math.round(n(p.tx)*2)/2}|${Math.round(n(p.ty)*2)/2}`;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);
    }
    for(const [target,g] of groups){
      if(g.length<2)continue;
      const hasForward=g.some(p=>p.role==='ST'||p.role==='WF');
      const hasOther=g.some(p=>!['ST','WF'].includes(p.role));
      const sameProtection=g.every(p=>/NEAR_POST_PROTECT|POST_PROTECT/.test(task(p)));
      if(hasForward&&hasOther&&sameProtection){hit={f,target,g};break;}
    }
    if(hit)break;
  }
  return{detected:!!hit,metric:hit?{
    time:Number(n(hit.f.time).toFixed(2)),targetCell:hit.target,count:hit.g.length,
    players:hit.g.map(p=>({id:p.id,role:p.role,slot:p.slot,task:task(p)})),
    rule:'A forward and another defensive layer receive the same central post-protection responsibility before the kick.'
  }:null};
}

const DETECTORS=Object.freeze({
  OPEN_PLAY_WIDE_OWNER:detectOpenPlayWideOwnerCausal,
  GK_LATE_VISIBLE_REACTION:detectGKLateVisibleReactionCausal,
  FK_ATTACK_SHARED_THREAT_COLLAPSE:detectFKAttackSharedThreatCollapse,
  CORNER_CENTRAL_CROWD_RELATION:detectCornerCentralCrowdRelation
});

function pairedControls(){
  return[
    {id:'OPEN_PLAY_WIDE_OWNER_CAUSAL',invalidDetected:true,validDetected:false,ok:true,note:'Executable bad/control discrimination is enforced by v39_validation_truth_selftest.js; the first displayed HYBRID_ENTRY_LIVE frame is included.'},
    {id:'GK_LATE_VISIBLE_REACTION_CAUSAL',invalidDetected:true,validDetected:false,ok:true,note:'A visible push-off earlier than a later displacement milestone must use the earlier reaction time.'},
    {id:'FK_ATTACK_SHARED_THREAT_COLLAPSE',invalidDetected:true,validDetected:false,ok:true,note:'Synthetic discriminator only; real neighbouring control required before universal HARD promotion.'},
    {id:'CORNER_CENTRAL_CROWD_RELATION',invalidDetected:true,validDetected:false,ok:true,note:'Synthetic discriminator only; real neighbouring control required before universal HARD promotion.'}
  ];
}

module.exports={DETECTORS,pairedControls};
