(function(root){'use strict';
const R=root&&root.FLRPG_RESTART_MOVEMENT;if(!R||R.__v59FreeKickTemplates)return;
const VERSION='V59-STANDARD-FREE-KICK-BASELINE-1.0',HOME='HOME',other=t=>t===HOME?'AWAY':HOME;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),local=(t,x,y)=>t===HOME?{x,y}:{x:105-x,y:68-y},world=(t,x,y)=>t===HOME?{x,y}:{x:105-x,y:68-y};
const player=(m,id)=>m.playersById?.[id]||m.players.find(p=>p.id===id);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),structural=p=>['CB','FB','CM'].includes(p.role);
const side=p=>/^(?:L|R)/.test(p.slot||'')?p.slot[0]:null;
function lanePenalty(p,key){
 const wanted=/_1$/.test(key)||key==='TARGET_NEAR'?'L':/_2$/.test(key)||key==='TARGET_FAR'?'R':null;
 return wanted&&side(p)&&side(p)!==wanted?18:0;
}
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
 let pool=candidates.length?candidates:available;
 if(key.startsWith('TARGET_')){
  // Keep the centre-backs as a spine while any attacking or midfield actor can
  // fill the danger role. Full-backs and then centre-backs are emergencies only.
  if(pool.some(p=>['ST','WF','CM'].includes(p.role)))pool=pool.filter(p=>['ST','WF','CM'].includes(p.role));
  else if(pool.some(p=>p.role==='FB'))pool=pool.filter(p=>p.role==='FB');
 }
 const scored=pool.map(p=>{const rank=roles.indexOf(p.role),travel=distance(p,target),congestion=key==='TARGET_CENTRAL'?corridorPenalty(m,p,target):0,lane=lanePenalty(p,key),score=rank*14+travel*.48+congestion+lane;return{p,rank,travel,congestion,lane,score};}).sort((a,b)=>a.score-b.score||a.rank-b.rank||a.congestion-b.congestion||a.travel-b.travel||a.p.id.localeCompare(b.p.id));
 let pick=scored[0];if(!pick)return null;
 // A feasible same-role route keeps its player's own left/right identity.
 const wanted=/_1$/.test(key)||key==='TARGET_NEAR'?'L':/_2$/.test(key)||key==='TARGET_FAR'?'R':null;
 if(wanted&&side(pick.p)&&side(pick.p)!==wanted){const same=scored.filter(x=>x.p.role===pick.p.role&&side(x.p)===wanted&&x.travel<=70&&x.travel<=pick.travel+35)[0];if(same)pick=same;}
 used.add(pick.p.id);
 const preferred=scored.filter(x=>x.rank===0)[0];plan.allocation.roles[key]={actorId:pick.p.id,role:pick.p.role,rank:pick.rank,distance:Number(pick.travel.toFixed(3)),corridorPenalty:Number(pick.congestion.toFixed(3)),lanePenalty:pick.lane,score:Number(pick.score.toFixed(3)),rationale:pick.rank?'fallback_current_route_feasibility':'preferred_role_route_feasible',preferredCandidate:preferred&&{actorId:preferred.p.id,role:preferred.p.role,distance:Number(preferred.travel.toFixed(3)),corridorPenalty:Number(preferred.congestion.toFixed(3)),score:Number(preferred.score.toFixed(3))}};
 return pick.p;
}
function put(s,plan,p,w,role,required=false){if(!p)return;const formationRun=/^(?:TARGET_|SECOND_BALL_|SHORT_OPTION)/.test(role);s.targets[p.id]={x:clamp(w.x,1,104),y:clamp(w.y,1,67),task:`FREE_KICK_${role}_HOLD`,required,sprint:formationRun};if(required)s.requiredIds.push(p.id);plan.roles[p.id]=role;}
function wallShoulders(m,s,team){
 const wall=R.previewFreeKickWall?.(m,s);if(!wall||wall.count<3)return null;
 const points=wall.wallPoints.map(q=>local(team,q.x,q.y)).sort((a,b)=>a.y-b.y),low=points[0],high=points[points.length-1];
 const shoulderGap=wall.count>=4?3.4:1.35,behindWall=wall.count>=4?.6:1.2;
 return{near:{x:clamp(low.x-behindWall,1,104),y:clamp(low.y-shoulderGap,1,67)},far:{x:clamp(high.x-behindWall,1,104),y:clamp(high.y+shoulderGap,1,67)}};
}
function outsideWallCorridor(mark,wall,ball,team,defender){
 if(!wall||wall.count<3)return mark;
 const points=wall.wallPoints.map(q=>local(team,q.x,q.y)),b=local(team,ball.x,ball.y);
 const centre={x:points.reduce((n,q)=>n+q.x,0)/points.length,y:points.reduce((n,q)=>n+q.y,0)/points.length};
 const length=distance(b,centre),ux=(centre.x-b.x)/length,uy=(centre.y-b.y)/length,px=-uy,py=ux;
 const along=(mark.x-b.x)*ux+(mark.y-b.y)*uy,lateral=(mark.x-b.x)*px+(mark.y-b.y)*py;
 const shoulder=Math.max(...points.map(q=>Math.abs((q.x-centre.x)*px+(q.y-centre.y)*py)));
 if(along<.5||along>length+.15||Math.abs(lateral)>shoulder+.85)return mark;
 const preferred=side(defender)==='L'?1:side(defender)==='R'?-1:lateral<0?-1:1;
 const sign=Math.abs(lateral)>.25?Math.sign(lateral):preferred;
 const offset=sign*(shoulder+1.15)-lateral;
 return{x:clamp(mark.x+px*offset,1,104),y:clamp(mark.y+py*offset,1,67)};
}
function defend(m,s,plan,defs,team,f,lp){
 const wall=R.previewFreeKickWall?.(m,s),wallIds=new Set(wall?.wallPlayerIds||[]),available=defs.filter(p=>!wallIds.has(p.id)),used=new Set();
 plan.defensiveWallIds=[...wallIds];
 const add=(p,x,y,role,required=false,markId=null)=>{
  if(!p)return;
  const adjusted=outsideWallCorridor({x,y},wall,m.restart,team,p);let w=world(team,adjusted.x,adjusted.y);
  // Coverage is a separate layer from the legal wall, even when a mark happens
  // to be near it. Move only the template target; wall geometry stays untouched.
  for(const q of wall?.wallPoints||[]){const d=distance(w,q);if(d>=2.2)continue;let dx=w.x-q.x,dy=w.y-q.y,n=Math.hypot(dx,dy);if(n<.01){dx=team===HOME?1:-1;dy=0;n=1;}w={x:clamp(w.x+dx/n*(2.25-d),1,104),y:clamp(w.y+dy/n*(2.25-d),1,67)};}
  p.markTargetId=markId;put(s,plan,p,w,role,required);used.add(p.id);
 };
 const danger=Object.entries(plan.roles).filter(([,role])=>role.startsWith('TARGET_')).map(([id])=>({id,target:s.targets[id]})).filter(a=>a.target)
  .sort((a,b)=>Math.abs(local(team,b.target.x,b.target.y).y-34)-Math.abs(local(team,a.target.x,a.target.y).y-34)||a.id.localeCompare(b.id));
 const structuralMarks=available.filter(p=>p.role==='CB'||p.role==='FB').length+Math.max(0,available.filter(p=>p.role==='CM').length-1);
 for(const a of danger.slice(0,Math.max(1,structuralMarks))){
  const at=local(team,a.target.x,a.target.y),mark={x:clamp(at.x+1.2,88,99),y:at.y};
  const rank=p=>p.role==='CB'?0:p.role==='FB'?1:p.role==='CM'?2:p.role==='WF'?3:4;
  const candidates=available.filter(p=>!used.has(p.id)).sort((a,b)=>{
   const ownSide=mark.y<33.5?'R':mark.y>34.5?'L':null;
   const score=p=>rank(p)*100+(ownSide&&side(p)&&side(p)!==ownSide?40:0)+distance(p,world(team,mark.x,mark.y))*.35;
   return score(a)-score(b)||a.id.localeCompare(b.id);
  });
  add(candidates[0],mark.x,mark.y,'MARK_CONTEST',true,a.id);
 }
 const remaining=available.filter(p=>!used.has(p.id)).sort((a,b)=>a.id.localeCompare(b.id));
 for(const p of remaining){
  const lane=side(p)==='L'?'L':side(p)==='R'?'R':'C';
  if(p.role==='CB'||p.role==='FB')add(p,93,p.role==='CB'?(lane==='L'?43:lane==='R'?25:34):(lane==='L'?47:lane==='R'?21:34),'BOX_ZONE');
  else if(p.role==='CM')add(p,83,lane==='L'?42:lane==='R'?26:34,'DEFENSIVE_SECOND_BALL');
  else if(p.role==='WF')add(p,79,lane==='L'?54:14,'WIDE_EDGE_CLEARANCE');
  else if(p.role==='ST')add(p,f.startsWith('DEEP')?clamp(lp.x-4,40,58):52,34,'COUNTER_OUTLET');
  else add(p,82,34,'DEFENSIVE_SECOND_BALL');
 }
}
function build(m,s){const r=m.restart;if(!r||r.kind!=='FREE_KICK'||s.freeKickPlan)return s;const team=r.team,def=other(team),lp=local(team,r.x,r.y),k=type(r),f=family(lp,k),restartMode=f.startsWith('DEEP')?'QUICK_RESTART':'SETTLED_RESTART',plan=s.freeKickPlan={version:VERSION,freeKickType:k,family:f,restartMode,geometry:f.startsWith('DEEP')?'DEEP_QUICK_CONTINUITY':'FREE_KICK_SPATIAL_BASELINE',roles:{},principalRunnerIds:[],stage:'SETTLE',launched:false,allocation:{model:'V60_CURRENT_STATE_ROLE_ROUTE',roles:{}}};s.restartMode=restartMode;
 const kicker=player(m,s.kickerId),kt=s.targets[s.kickerId];s.targets={};s.requiredIds=[];if(kicker&&kt){s.targets[kicker.id]=kt;s.requiredIds.push(kicker.id);plan.roles[kicker.id]='KICKER';}
 if(restartMode==='QUICK_RESTART'){plan.complete=false;return s;}
 const atk=m.players.filter(p=>p.team===team&&p.role!=='GK'),defs=m.players.filter(p=>p.team===def&&p.role!=='GK'),used=new Set([s.kickerId]),add=(p,x,y,role,req=false)=>put(s,plan,p,world(team,x,y),role,req),pick=(key,roles,x,y,reserve=0)=>choose(m,atk,used,roles,world(team,x,y),plan,key,reserve),shoulders=f==='DIRECT_SHOT_CLOSE'&&Math.abs(lp.y-34)<=9?wallShoulders(m,s,team):null;
 {const shortTarget={x:clamp(lp.x-6,6,96),y:clamp(lp.y+(lp.y<34?7:-7),7,61)},short=(f==='INDIRECT_DELIVERY'||f==='WIDE_DIRECT_DELIVERY')?pick('SHORT_OPTION',['CM','WF','FB'],shortTarget.x,shortTarget.y):null;
  // When the striker takes the kick, keep both available wide forwards in
  // their danger channels before using a midfielder as central cover.
  let st,wf1,wf2;
  if(atk.some(p=>p.role==='ST'&&!used.has(p.id))){
   st=pick('TARGET_CENTRAL',['ST','WF','CM','FB','CB'],91,34,4);
   if(kicker?.role==='WF'&&side(kicker)==='L'){wf2=pick('TARGET_FAR',['WF','ST','CM','FB','CB'],92,42,4);wf1=pick('TARGET_NEAR',['WF','ST','CM','FB','CB'],89,26,4);}
   else{wf1=pick('TARGET_NEAR',['WF','ST','CM','FB','CB'],89,26,4);wf2=pick('TARGET_FAR',['WF','ST','CM','FB','CB'],92,42,4);}
  }else{
   if(kicker?.role==='WF'&&side(kicker)==='L'){wf2=pick('TARGET_FAR',['WF','ST','CM','FB','CB'],92,42,4);wf1=pick('TARGET_NEAR',['WF','ST','CM','FB','CB'],89,26,4);}
   else{wf1=pick('TARGET_NEAR',['WF','ST','CM','FB','CB'],89,26,4);wf2=pick('TARGET_FAR',['WF','ST','CM','FB','CB'],92,42,4);}
   st=pick('TARGET_CENTRAL',['ST','WF','CM','FB','CB'],91,34,4);
  }
  const rd1=pick('REST_DEFENCE_1',['CB','FB','CM'],60,27),rd2=pick('REST_DEFENCE_2',['CB','FB','CM'],55,41),sb1=pick('SECOND_BALL_1',['CM','FB','CB'],83,28),sb2=pick('SECOND_BALL_2',['CM','FB','CB'],81,41);
  const wallCount=R.previewFreeKickWall?.(m,s)?.count||0;
  const centralY=wallCount>=4&&f==='DIRECT_SHOT_CLOSE'&&st?.role==='WF'?(side(st)==='L'?28.5:39.5):(f==='INDIRECT_DELIVERY'||f==='WIDE_DIRECT_DELIVERY')&&wallCount<=1?31.5:34;
  add(short,shortTarget.x,shortTarget.y,'SHORT_OPTION');add(st,91,centralY,'TARGET_CENTRAL',true);add(wf1,shoulders?.near.x??89,shoulders?.near.y??26,'TARGET_NEAR',true);add(wf2,shoulders?.far.x??92,shoulders?.far.y??42,'TARGET_FAR',true);add(rd1,60,27,'REST_DEFENCE_1');add(rd2,55,41,'REST_DEFENCE_2');add(sb1,83,28,'SECOND_BALL_1');add(sb2,81,41,'SECOND_BALL_2');}
 for(const p of atk)if(!plan.roles[p.id])add(p,p.role==='CB'?53:58,side(p)==='L'?24:side(p)==='R'?44:34,'REST_DEFENCE_SUPPORT');const ownGk=m.players.find(p=>p.team===team&&p.role==='GK');if(ownGk)put(s,plan,ownGk,world(team,5,34),'ATTACK_GK');
 defend(m,s,plan,defs,team,f,lp);
 const gk=m.players.find(p=>p.team===def&&p.role==='GK');if(gk)put(s,plan,gk,world(team,102,34),'GK_COMPLEMENT',true);plan.complete=true;return s;}
function launch(m,s){const p=s?.freeKickPlan;if(!p||p.launched||m.restart?.stage!=='APPROACH')return;p.launched=true;p.stage='APPROACH';for(const [id,role] of Object.entries(p.roles)){const t=s.targets[id];if(!t||role==='KICKER'||role.includes('REST')||role.includes('SECOND_BALL')||role==='COUNTER_OUTLET'||role==='GK_COMPLEMENT'||role==='BOX_ZONE'||role==='MARK_CONTEST'||role==='WIDE_EDGE_CLEARANCE')continue;t.task=`FREE_KICK_${role}_RUN`;t.sprint=true;}}
function apply(m,s){if(!s||m.restart?.kind!=='FREE_KICK')return s;build(m,s);launch(m,s);return s;}
const begin=R.begin.bind(R),assign=R.assign.bind(R);R.begin=m=>apply(m,begin(m));R.assign=m=>{const x=assign(m);apply(m,m.restart?.setup);return x;};R.FREE_KICK_TEMPLATE_VERSION=VERSION;R.__v59FreeKickTemplates=true;
})(typeof globalThis!=='undefined'?globalThis:this);
