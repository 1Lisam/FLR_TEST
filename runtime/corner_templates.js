(function(root){'use strict';
  const R=root&&root.FLRPG_RESTART_MOVEMENT;
  if(!R||R.__v37CornerTemplates)return;
  const VERSION='V37-CORNER-TEMPLATES-1.0-LUNA';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const other=t=>t==='HOME'?'AWAY':'HOME';
  const local=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
  const world=(team,x,y)=>team==='HOME'?{x,y}:{x:105-x,y:68-y};
  const hash=s=>{let h=2166136261>>>0;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
  const player=(m,id)=>m.playersById?.[id]||m.players.find(p=>p.id===id)||null;
  const profile=(m,team)=>m.managerProfiles?.[team]||{};
  const attackFamilies=['NEAR_POST_ATTACK','FAR_POST_ATTACK','CENTRAL_CROSS_RUN','SHORT_CORNER','EDGE_SECOND_BALL'];
  const defenceFamilies=['ZONAL_COMPACT','PLAYER_MARKING','HYBRID','NEAR_POST_PROTECT','COUNTER_OUTLET'];
  const pseudoEdgeX=slot=>slot==='LCM'?82:slot==='RCM'?89:86;
  const pseudoEdgeY=slot=>slot==='LCM'?23:slot==='RCM'?45:34;
  function choose(m,team,names,kind){
    const p=profile(m,team),h=hash(`${m.seed}|${m.restart?.setupStartedAt}|${team}|CORNER|${kind}`),base=h%names.length;
    const scores=names.map((name,i)=>({name,score:(i===base?1:0)+((h>>>((i%4)*7))&31)/1000}));
    for(const x of scores){
      if(kind==='ATTACK'){if(Number(p.attacking)>.70&&x.name==='NEAR_POST_ATTACK')x.score+=1.50;if(Number(p.directness)>.70&&Number(p.transition)>.70&&x.name==='EDGE_SECOND_BALL')x.score+=1.50;if(Number(p.directness)>.70&&Number(p.transition)<=.70&&x.name==='FAR_POST_ATTACK')x.score+=1.20;if(Number(p.directness)>.62&&x.name==='SHORT_CORNER')x.score+=.20;}
      else {if(Number(p.transition)>.62&&x.name==='COUNTER_OUTLET')x.score+=.24;if(Number(p.pressing)>.65&&x.name==='PLAYER_MARKING')x.score+=.12;if(Number(p.lineHeight)>.60&&x.name==='ZONAL_COMPACT')x.score+=.10;}
    }
    return scores.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name))[0].name;
  }
  function set(setup,p,w,task,role,required=false,sprint=false){
    if(!p)return;const t=setup.targets[p.id]||(setup.targets[p.id]={});t.x=clamp(w.x,1,104);t.y=clamp(w.y,1,67);t.task=task;t.required=!!required;t.sprint=!!sprint;
    if(required&&!setup.requiredIds.includes(p.id))setup.requiredIds.push(p.id);setup.cornerPlan.roles[p.id]=role;
  }
  function nearest(ps,point,used,roles){const q=ps.filter(p=>!used.has(p.id)&&(!roles||roles.includes(p.role))).map(p=>({p,d:Math.hypot(p.x-point.x,p.y-point.y)})).sort((a,b)=>a.d-b.d)[0]?.p;if(q)used.add(q.id);return q;}
  function build(m,setup){
    const r=m.restart;if(!r||r.kind!=='CORNER'||setup.cornerPlan)return setup;
    const team=r.team,def=other(team),lp=local(team,r.x,r.y),defLp=local(def,r.x,r.y),top=lp.y<34,defTop=defLp.y<34,nearSlot=top?'LW':'RW',farSlot=top?'RW':'LW';
    const attackTemplate=choose(m,team,attackFamilies,'ATTACK'),defenceTemplate=choose(m,def,defenceFamilies,'DEFENCE');
    const plan=setup.cornerPlan={version:VERSION,attackTemplate,defenceTemplate,localCornerY:lp.y,nearSlot,farSlot,stage:'SETTLE',launched:false,firstContestAt:null,secondPhaseAt:null,roles:{},roleHistory:[]};
    const atk=m.players.filter(p=>p.team===team),defs=m.players.filter(p=>p.team===def),used=new Set([setup.kickerId]);
    const kicker=player(m,setup.kickerId);if(kicker)plan.roles[kicker.id]='KICKER';
    const near=player(m,team==='HOME'?`H-${nearSlot}`:`A-${nearSlot}`)||nearest(atk,{x:r.x,y:r.y},used,['WF']);if(near)used.add(near.id);
    const far=player(m,team==='HOME'?`H-${farSlot}`:`A-${farSlot}`)||nearest(atk,{x:r.x,y:r.y},used,['WF']);if(far)used.add(far.id);
    const st=atk.find(p=>p.role==='ST'&&p.id!==setup.kickerId)||nearest(atk,{x:r.x,y:r.y},used,['ST','WF','CM']);if(st)used.add(st.id);
    const central=st||nearest(atk,{x:r.x,y:r.y},used,['CM']);if(central)used.add(central.id);
    const edge=nearest(atk,{x:r.x,y:r.y},used,['CM']);
    const rest=atk.filter(p=>!used.has(p.id)&&p.role!=='GK'&&['CB','FB'].includes(p.role)).slice(0,2);rest.forEach(p=>used.add(p.id));
    const z={near:{x:96,y:top?27.4:40.6},central:{x:94,y:34},far:{x:96,y:top?42.4:25.6},edge:{x:82,y:top?23:45},rest1:{x:72,y:24},rest2:{x:70,y:44},short:{x:89,y:top?16:52}};
    const order=attackTemplate==='NEAR_POST_ATTACK'?['near','central','far']:attackTemplate==='FAR_POST_ATTACK'?['far','central','near']:attackTemplate==='EDGE_SECOND_BALL'?['central','far','near']:['central','near','far'];
    const runnerRows=[[near,'NEAR_RUNNER',order[0]],[central,'CENTRAL_RUNNER',order[1]],[far,'FAR_RUNNER',order[2]]];
    runnerRows.forEach(([p,role,key])=>{if(p){plan.targets=plan.targets||{};set(setup,p,world(team,z[key].x,z[key].y),`CORNER_${role}_SETTLE`,role,true,false);}});
    if(attackTemplate==='SHORT_CORNER'){const short=nearest(atk,{x:r.x,y:r.y},used,['CM','WF','FB']);if(short)set(setup,short,world(team,z.short.x,z.short.y),'CORNER_SHORT_OPTION_SET','DECOY',false,false);}
    if(edge)set(setup,edge,world(team,z.edge.x,z.edge.y),'CORNER_SECOND_BALL_EDGE_HOLD','SECOND_BALL_EDGE',false,false);
    rest.forEach((p,i)=>set(setup,p,world(team,z[i?'rest2':'rest1'].x,z[i?'rest2':'rest1'].y),`CORNER_REST_DEFENCE_${i+1}_HOLD`,`REST_DEFENCE_${i+1}`,false,false));
    // Every remaining attacker keeps a bounded football responsibility.  In
    // particular, unused CB/FB slots must not fall back to the old setup task.
    for(const p of atk){if(p.role==='GK'||plan.roles[p.id])continue;const al=local(team,p.x,p.y);let sx=clamp(al.x,62,76),sy=clamp(al.y,10,58),supportRole='REST_DEFENCE_SUPPORT';
      // Support is a relational layer, not a synonym for REST_DEFENCE_2. Keep
      // each unused player on his own channel/depth so the live update can
      // preserve a usable counter shape.
      if(p.role==='FB'){sy=p.slot==='LB'?14:54;sx=clamp(al.x,58,72);supportRole=`REST_DEFENCE_${p.slot}_SUPPORT`;}
      else if(p.role==='CB'){sy=p.slot==='LCB'?26:42;sx=clamp(al.x,60,72);supportRole=`REST_DEFENCE_${p.slot}_SUPPORT`;}
      else if(p.role==='CM'){sy=p.slot==='LCM'?29:p.slot==='RCM'?39:34;sx=clamp(al.x,64,78);supportRole=`REST_DEFENCE_${p.slot}_SUPPORT`;}
      set(setup,p,world(team,sx,sy),'CORNER_REST_DEFENCE_SUPPORT',supportRole,false,false);}
    const danger=[near,central,far].filter(Boolean),defUsed=new Set();
    const markerMode=defenceTemplate==='PLAYER_MARKING'||defenceTemplate==='HYBRID';
    danger.slice(0,markerMode?3:1).forEach((a,i)=>{const d=nearest(defs,a,defUsed,['CB','FB','CM']);if(!d)return;const al=local(def,a.x,a.y),my=clamp(al.y+(al.y<34?.65:-.65),8,60);set(setup,d,world(def,markerMode?94:95,my),markerMode?'CORNER_MARK_HOLD':'CORNER_ZONE_HOLD',markerMode?'MARKER':'ZONE',true,false);if(markerMode)d.markTargetId=a.id;});
    for(const d of defs.filter(p=>!defUsed.has(p.id)&&p.role!=='GK')){let role='ZONE',task='CORNER_ZONE_HOLD',x=94,y=local(def,d.x,d.y).y;if(d.role==='CM'){role=`CLEARANCE_EDGE_${d.slot||'CM'}`;task='CORNER_CLEARANCE_EDGE_HOLD';x=pseudoEdgeX(d.slot);y=pseudoEdgeY(d.slot);}if(defenceTemplate==='NEAR_POST_PROTECT'&&Math.abs(y-34)<8){role='NEAR_POST_PROTECT';task='CORNER_NEAR_POST_PROTECT_HOLD';x=96;y=defTop?29:39;}if(defenceTemplate==='COUNTER_OUTLET'&&d.role==='ST'){role='COUNTER_OUTLET';task='CORNER_COUNTER_OUTLET_HOLD';x=72;y=34;}set(setup,d,world(def,x,y),task,role,false,false);}
    const gk=defs.find(p=>p.role==='GK');if(gk)set(setup,gk,world(team,98,34),'CORNER_GK_SET','ZONE',true,false);
    plan.roleHistory.push({at:m.time,stage:'SETTLE',roles:{...plan.roles}});return setup;
  }
  function launch(m,setup){const p=setup?.cornerPlan;if(!p||p.launched||m.restart?.kind!=='CORNER')return setup;p.launched=true;p.stage='LAUNCH';p.launchAt=m.time;p.roleHistory.push({at:m.time,stage:'LAUNCH',roles:{...p.roles}});
    for(const [id,role] of Object.entries(p.roles)){const q=player(m,id),t=setup.targets[id];if(!q||!t||role==='KICKER'||role==='SECOND_BALL_EDGE'||role.startsWith('REST_DEFENCE')||role.startsWith('CLEARANCE_EDGE')||role==='COUNTER_OUTLET'||role==='ZONE'||role==='NEAR_POST_PROTECT')continue;t.task=`CORNER_${role}_RUN`;t.sprint=true;q.tx=t.x;q.ty=t.y;q.action=t.task;q.tacticalTask=t.task;q.sprint=true;q.lockTargetUntil=m.time+2.8;}
    return setup;
  }
  function liveStart(m,r){const p=r?.setup?.cornerPlan;if(!p)return null;return JSON.parse(JSON.stringify(p));}
  function liveUpdate(m,sp){const p=sp?.cornerPlan;if(!p||sp.kind!=='CORNER')return false;const age=m.time-sp.startedAt,ball=m.ball,team=sp.team,first=!p.firstContestAt&&((ball.mode==='LOOSE'&&age>.20)||(ball.mode==='CONTROLLED'&&age>.08));
    if(first){p.firstContestAt=m.time;p.stage='FIRST_CONTEST';p.secondPhaseAt=m.time+1.8;p.roleHistory.push({at:m.time,stage:'FIRST_CONTEST',ballMode:ball.mode});}
    const second=!!p.firstContestAt&&m.time>=(p.secondPhaseAt||Infinity);if(second&&p.stage!=='SECOND_PHASE'){p.stage='SECOND_PHASE';p.roleHistory.push({at:m.time,stage:'SECOND_PHASE',ballMode:ball.mode});}
    const active=second||p.firstContestAt;for(const [id,role] of Object.entries(p.roles||{})){const q=player(m,id);if(!q)continue;let task=null,x=q.tx,y=q.ty,sprint=false;
      const bl=local(team,ball.x,ball.y),defBall=local(other(team),ball.x,ball.y);
      if(role==='SECOND_BALL_EDGE'){x=world(team,clamp(bl.x-10,72,88),clamp(bl.y<34?24:44,16,52)).x;y=world(team,clamp(bl.x-10,72,88),clamp(bl.y<34?24:44,16,52)).y;task='CORNER_SECOND_BALL_EDGE';sprint=active;}
      else if(role==='REST_DEFENCE_1'||role==='REST_DEFENCE_2'){const yy=role.endsWith('1')?24:44,w=world(team,clamp(bl.x-15,64,76),yy);x=w.x;y=w.y;task=role==='REST_DEFENCE_1'?'CORNER_REST_DEFENCE_1':'CORNER_REST_DEFENCE_2';sprint=false;}
      else if(role.startsWith('REST_DEFENCE_')){const slot=role.match(/(LB|RB|LCB|RCB|LCM|RCM|CM)_SUPPORT$/)?.[1],sy=slot==='LB'?14:slot==='RB'?54:slot==='LCB'?26:slot==='RCB'?42:slot==='LCM'?(bl.y<34?25:31):slot==='RCM'?(bl.y<34?37:43):34,w=world(team,clamp(bl.x-(slot?.endsWith('CM')?9:13),60,78),sy);x=w.x;y=w.y;task='CORNER_REST_DEFENCE_SUPPORT';sprint=false;}
      else if(role.startsWith('CLEARANCE_EDGE')){const slot=role.match(/(LCM|RCM|CM)$/)?.[1],w=world(other(team),clamp(defBall.x-(slot==='LCM'?8:slot==='RCM'?5:7),78,90),slot==='LCM'?23:slot==='RCM'?45:34);x=w.x;y=w.y;task='CORNER_CLEARANCE_EDGE';sprint=active;}
      else if(role==='COUNTER_OUTLET'){const w=world(team,68,34);x=w.x;y=w.y;task='CORNER_COUNTER_OUTLET';sprint=false;}
      else if(active&&role==='MARKER'){const w=world(team,clamp(bl.x+1.0,91,99),clamp(bl.y,10,58));x=w.x;y=w.y;task='CORNER_MARK_TRACK';sprint=true;}
      else if(active&&['NEAR_RUNNER','CENTRAL_RUNNER','FAR_RUNNER'].includes(role)){const key=role==='NEAR_RUNNER'?(p.nearSlot==='LW'?'near':'near'):role==='FAR_RUNNER'?'far':'central',zz=key==='near'?(p.nearSlot==='LW'?(bl.y<34?28:40):(bl.y<34?40:28)):key==='far'?(bl.y<34?42:26):34,w=world(team,clamp(bl.x+2,88,99),zz);x=w.x;y=w.y;task=`CORNER_${role}_BALL_RESPONSE`;sprint=true;}
      if(task){q.tx=x;q.ty=y;q.action=task;q.tacticalTask=task;q.sprint=sprint;}
    }return true;
  }
  function applyPlanTargets(m,setup){for(const [id,t] of Object.entries(setup?.targets||{})){const q=player(m,id);if(!q)continue;if(id===setup.kickerId&&m.restart?.stage==='RUN_UP')continue;q.tx=t.x;q.ty=t.y;q.action=t.task;q.tacticalTask=t.task;q.sprint=!!t.sprint;if(t.task!=='CORNER_MARK_HOLD')q.markTargetId=null;}}
  const begin=R.begin.bind(R),assign=R.assign.bind(R);R.begin=function(m){const s=begin(m);if(s&&m.restart?.kind==='CORNER'){const out=build(m,s);applyPlanTargets(m,out);return out;}return s;};R.assign=function(m){const ok=assign(m);const s=m.restart?.setup;if(m.restart?.kind==='CORNER'&&s){const out=build(m,s);applyPlanTargets(m,out);}return ok;};R.prepareCornerLaunch=launch;R.cornerLiveStart=liveStart;R.cornerLiveUpdate=liveUpdate;R.CORNER_TEMPLATE_VERSION=VERSION;R.__v37CornerTemplates=true;
})(typeof globalThis!=='undefined'?globalThis:this);
