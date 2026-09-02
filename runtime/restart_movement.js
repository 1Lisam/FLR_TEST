(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_RESTART_MOVEMENT=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const HOME='HOME',AWAY='AWAY';
const VERSION='V36-RESTART-MOVEMENT-1.0-SET-PIECE-SHAPE-REPAIR';
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function hash32(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function angleDiff(a,b){let d=(b-a)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return d;}
function other(team){return team===HOME?AWAY:HOME;}
function worldToLocal(team,x,y){return team===HOME?{x,y}:{x:105-x,y:68-y};}
function localToWorld(team,x,y){return team===HOME?{x,y}:{x:105-x,y:68-y};}
function teamPlayers(m,team){return m.players.filter(p=>p.team===team);}
function outfield(m,team){return m.players.filter(p=>p.team===team&&p.role!=='GK');}
function playerById(m,id){return id?m.playersById[id]:null;}
function stableOffset(m,id,axis,span){const h=hash32(`${m.seed}|SET_PIECE_STAGGER|${id}|${axis}|${Math.floor((m.restart?.setupStartedAt||m.time)*10)}`);return((h%10001)/10000-.5)*2*span;}
function roleCost(role,kind){
  const map={
    THROWER:{FB:0,WF:0.7,CM:1.15,CB:1.8,ST:2.4},
    SHORT:{CM:0,FB:0.45,WF:0.65,ST:1.1,CB:1.3},
    FORWARD:{WF:0,ST:0.25,CM:0.55,FB:0.8,CB:1.8},
    INSIDE:{CM:0,ST:0.45,WF:0.55,FB:0.9,CB:1.5},
    SET_PIECE:{CM:0,WF:0.30,FB:0.55,ST:0.75,CB:1.5}
  };
  return map[kind]?.[role]??1.5;
}
function setWorldTarget(p,w,task,sprint=false){
  const throwerOutside=task==='THROW_IN_THROWER',cornerOutside=task==='CORNER_KICKER_RUNUP_START';
  p.tx=clamp(w.x,cornerOutside?-1.2:throwerOutside?0.5:1,cornerOutside?106.2:throwerOutside?104.5:104);
  p.ty=cornerOutside?clamp(w.y,-1.2,69.2):throwerOutside?clamp(w.y,-1.2,69.2):clamp(w.y,1,67);
  p.action=task;p.tacticalTask=task;p.sprint=!!sprint;if(!String(task).startsWith('FREE_KICK_TRACK_RUNNER'))p.markTargetId=null;
}
function nearestForTarget(players,target,kind,used){
  let best=null,bestScore=1e9;
  for(const p of players){if(used.has(p.id))continue;const score=dist(p,target)+roleCost(p.role,kind);if(score<bestScore){bestScore=score;best=p;}}
  return best;
}
function setupTiming(kind){
  if(kind==='THROW_IN')return{min:1.10,max:3.60};
  if(kind==='GOAL_KICK')return{min:1.80,max:5.60};
  if(kind==='CORNER')return{min:4.00,max:9.40};
  if(kind==='FREE_KICK')return{min:1.70,max:5.60};
  if(kind==='OFFSIDE')return{min:2.20,max:5.60};
  if(kind==='PENALTY')return{min:1.60,max:4.40};
  return{min:.90,max:2.60};
}
function freshSetup(m){
  const r=m.restart;if(!r||r.kind==='KICKOFF')return null;
  if(r.setup&&r.setup.kind===r.kind&&r.setup.team===r.team)return r.setup;
  const t=setupTiming(r.kind);
  r.setup={kind:r.kind,team:r.team,createdAt:m.time,minReadyAt:m.time+t.min,maxReadyAt:m.time+t.max,kickerId:null,targets:{},requiredIds:[],readyRatio:0,lastAssignedAt:-99};
  return r.setup;
}
function target(setup,id,w,task,required=true,sprint=true){
  if(!id||!w)return;const throwerOutside=task==='THROW_IN_THROWER',cornerOutside=task==='CORNER_KICKER_RUNUP_START';
  setup.targets[id]={x:clamp(w.x,cornerOutside?-1.2:throwerOutside?0.5:1,cornerOutside?106.2:throwerOutside?104.5:104),y:cornerOutside?clamp(w.y,-1.2,69.2):throwerOutside?clamp(w.y,-1.2,69.2):clamp(w.y,1,67),task,required:!!required,sprint:!!sprint};
  if(required&&!setup.requiredIds.includes(id))setup.requiredIds.push(id);
}
function applyTargets(m,setup){
  if(!setup)return false;
  for(const [id,t] of Object.entries(setup.targets)){const p=playerById(m,id);if(!p)continue;if(id===setup.kickerId&&m.restart&&['RUN_UP','APPROACH'].includes(m.restart.stage)){setWorldTarget(p,{x:m.restart.x,y:m.restart.y},m.restart.stage==='RUN_UP'?'CORNER_RUN_UP':'RESTART_APPROACH',false);continue;}setWorldTarget(p,t,t.task,t.sprint&&dist(p,t)>2.4);}
  setup.lastAssignedAt=m.time;return true;
}
function localSlotTarget(team,p,lx,ly){return localToWorld(team,clamp(lx,1,104),clamp(ly,1,67));}
function opponentSlotTarget(restartTeam,p,restartLocalX,ownLocalY){
  const ownLocalX=clamp(105-restartLocalX,1,104);
  return localToWorld(p.team,ownLocalX,clamp(ownLocalY,1,67));
}

function buildGoalKick(m,setup){
  const r=m.restart,team=r.team,opp=other(team),atk=teamPlayers(m,team),def=teamPlayers(m,opp),gk=atk.find(p=>p.role==='GK');if(!gk)return null;
  setup.kickerId=gk.id;
  const bp=worldToLocal(team,r.x,r.y),keeperReady=localToWorld(team,clamp(bp.x-1.55,1.5,103.5),bp.y);
  target(setup,gk.id,keeperReady,'GOAL_KICK_KEEPER',true,true);

  const h=hash32(`${m.seed}|GOAL_KICK_LANDING|${Math.floor((r.setupStartedAt||m.time)*10)}|${team}`);
  const landingYs=[24,34,44],landingY=landingYs[h%landingYs.length],landingX=68.0+((h>>>4)%3-1)*1.4;
  const targetPoint=localToWorld(team,landingX,landingY);
  setup.goalKickPlan={team,targetPoint,landingLocal:{x:landingX,y:landingY},targetPlayerId:null,mode:'LONG'};

  const own={LB:[40,10],LCB:[37,27],RCB:[37,41],RB:[40,58],LCM:[49,22],CM:[51,34],RCM:[49,46],LW:[60,14],ST:[64,landingY],RW:[60,54]};
  for(const p of atk){if(p.id===gk.id)continue;const q=own[p.slot]||[49,34];target(setup,p.id,localSlotTarget(team,p,q[0],q[1]),'LONG_GOAL_KICK_ATTACK_SETUP',['CB','FB','CM','ST','WF'].includes(p.role),true);}

  const press={ST:[55,28],LW:[55,16],RW:[55,52],LCM:[57,22],CM:[58,34],RCM:[57,46],LB:[77,11],LCB:[74,28],RCB:[74,40],RB:[77,57],GK:[99,34]};
  for(const p of def){const q=press[p.slot]||[64,34];target(setup,p.id,opponentSlotTarget(team,p,q[0],q[1]),'LONG_GOAL_KICK_DEFENSIVE_SETUP',['ST','WF','CM','CB','FB'].includes(p.role),true);}
  return setup;
}
function buildCorner(m,setup){
  const r=m.restart,team=r.team,opp=other(team),atk=teamPlayers(m,team),def=teamPlayers(m,opp),point={x:r.x,y:r.y},used=new Set();
  const kicker=nearestForTarget(outfield(m,team),point,'SET_PIECE',used);if(!kicker)return null;used.add(kicker.id);setup.kickerId=kicker.id;
  const lp=worldToLocal(team,r.x,r.y),top=lp.y<34;
  const runupLocal={x:Math.max(105.45,lp.x+1.55),y:top?-0.72:68.72},runup=localToWorld(team,runupLocal.x,runupLocal.y);
  target(setup,kicker.id,runup,'CORNER_KICKER_RUNUP_START',true,true);setup.cornerRunup={start:runup,ball:{x:r.x,y:r.y}};
  const yUpper=28.8,yLower=39.2;
  // Corner roles are local to the restart team.  The upper/lower slot is not
  // itself near/far: on the lower corner the semantic sides are mirrored.
  const nearSlot=top?yUpper:yLower,farSlot=top?yLower:yUpper;
  const attackSlots={ST:[99.0,34],LW:[98.0,top?yUpper:yLower],RW:[98.0,top?yLower:yUpper],CM:[90.8,34],LCM:[92.0,25.2],RCM:[92.0,42.8],LB:[79.0,17.5],RB:[79.0,50.5],LCB:[72.5,28],RCB:[72.5,40],GK:[7,34]};
  setup.cornerSemantic={localCornerY:lp.y,nearSide:top?'LW':'RW',farSide:top?'RW':'LW',nearLocalY:nearSlot,farLocalY:farSlot};
  for(const p of atk){if(p.id===kicker.id)continue;const q=attackSlots[p.slot]||[86,34],jx=stableOffset(m,p.id,'CORNER_ATK_X',.55),jy=stableOffset(m,p.id,'CORNER_ATK_Y',.75);target(setup,p.id,localSlotTarget(team,p,q[0]+jx,q[1]+jy),'CORNER_ATTACK_SETUP',['ST','WF','CM'].includes(p.role),true);}
  const defendSlots={GK:[102.3,34],LB:[98.0,25.5],LCB:[99.0,30.6],RCB:[99.0,37.4],RB:[98.0,42.5],LCM:[93.4,25.0],CM:[94.0,34],RCM:[93.4,43.0],LW:[83.5,16.5],ST:[81.5,34],RW:[83.5,51.5]};
  for(const p of def){const q=defendSlots[p.slot]||[94,34],jx=stableOffset(m,p.id,'CORNER_DEF_X',.45),jy=stableOffset(m,p.id,'CORNER_DEF_Y',.65);target(setup,p.id,opponentSlotTarget(team,p,q[0]+jx,q[1]+jy),'CORNER_DEFENCE_SETUP',['GK','CB','FB','CM'].includes(p.role),true);}
  return setup;
}
function buildFreeKick(m,setup){
  const r=m.restart,team=r.team,opp=other(team),point={x:r.x,y:r.y},attackers=teamPlayers(m,team),defenders=teamPlayers(m,opp),used=new Set();
  const kicker=nearestForTarget(outfield(m,team),point,'SET_PIECE',used);if(!kicker)return null;used.add(kicker.id);setup.kickerId=kicker.id;const lp0=worldToLocal(team,r.x,r.y),approach=localToWorld(team,Math.max(1,lp0.x-1.45),lp0.y);target(setup,kicker.id,approach,r.kind==='OFFSIDE'?'OFFSIDE_KICKER_READY':'FREE_KICK_KICKER_READY',true,true);setup.restartApproach={start:approach,ball:{x:r.x,y:r.y}};
  const lp=worldToLocal(team,r.x,r.y),advanced=lp.x>67;
  for(const p of attackers){if(p.id===kicker.id)continue;let lx,ly;
    if(p.role==='ST'){lx=advanced?clamp(lp.x+11,78,96):clamp(lp.x+18,54,76);ly=34;}
    else if(p.role==='WF'){lx=advanced?clamp(lp.x+8,75,94):clamp(lp.x+15,52,74);ly=p.slot==='LW'?17:51;}
    else if(p.role==='CM'){const delta=p.slot==='CM'?(advanced?0:-3):(advanced?-4:-7);lx=clamp(lp.x+delta,32,84);ly=p.slot==='LCM'?23:p.slot==='RCM'?45:34;}
    else if(p.role==='FB'){lx=clamp(lp.x-(advanced?21:18),24,54);ly=p.slot==='LB'?10:58;}
    else if(p.role==='CB'){lx=clamp(lp.x-(advanced?30:26),18,46);ly=p.slot==='LCB'?28:40;}
    else{lx=7;ly=34;}
    const jx=p.role==='GK'?0:stableOffset(m,p.id,'FK_ATK_X',.45),jy=p.role==='GK'?0:stableOffset(m,p.id,'FK_ATK_Y',.65);
    target(setup,p.id,localSlotTarget(team,p,lx+jx,ly+jy),'FREE_KICK_ATTACK_SETUP',['ST','WF','CM'].includes(p.role),true);
  }
  if(advanced){
    const wallX=clamp(lp.x+9.15,4,100),wallYs=[31.2,34,36.8],wall=outfield(m,opp).slice().sort((a,b)=>dist(a,point)-dist(b,point)).slice(0,3),wallIds=new Set(wall.map(p=>p.id));
    wall.forEach((p,i)=>target(setup,p.id,localSlotTarget(team,p,wallX,wallYs[i]),'FREE_KICK_WALL',true,true));
    for(const p of defenders){if(wallIds.has(p.id))continue;let q;
      if(p.role==='GK')q=[102.2,34];
      else if(p.role==='CB'||p.role==='FB')q=[96,p.slot==='LB'?18:p.slot==='RB'?50:p.slot==='LCB'?29:39];
      else if(p.role==='CM')q=[89.5,p.slot==='LCM'?23:p.slot==='RCM'?45:34];
      else if(p.role==='ST')q=[54,34];
      else q=[59,p.slot==='LW'?14:p.slot==='RW'?54:34];
      const jx=p.role==='GK'?0:stableOffset(m,p.id,'FK_DEF_ADV_X',.35),jy=p.role==='GK'?0:stableOffset(m,p.id,'FK_DEF_ADV_Y',.55);
      target(setup,p.id,opponentSlotTarget(team,p,q[0]+jx,q[1]+jy),'FREE_KICK_DEFENCE_SETUP',['GK','CB','FB','CM'].includes(p.role),true);
    }
  }else{
    const backX=clamp(lp.x+13,60,84),midX=clamp(lp.x+7,54,78);
    for(const p of defenders){let q;
      if(p.role==='GK')q=[102.2,34];
      else if(p.role==='CB'||p.role==='FB')q=[backX,p.slot==='LB'?16:p.slot==='RB'?52:p.slot==='LCB'?28.5:39.5];
      else if(p.role==='CM')q=[midX,p.slot==='LCM'?22:p.slot==='RCM'?46:34];
      else if(p.role==='ST')q=[54,34];
      else q=[59,p.slot==='LW'?14:p.slot==='RW'?54:34];
      const jx=p.role==='GK'?0:stableOffset(m,p.id,'FK_DEF_STD_X',.35),jy=p.role==='GK'?0:stableOffset(m,p.id,'FK_DEF_STD_Y',.55);
      target(setup,p.id,opponentSlotTarget(team,p,q[0]+jx,q[1]+jy),'FREE_KICK_DEFENCE_SETUP',['GK','CB','FB','CM'].includes(p.role),true);
    }
  }
  return setup;
}
function ensureThrowPlan(m,setup){
  const r=m.restart;if(!r||r.kind!=='THROW_IN')return null;
  if(r.throwSetup&&r.throwSetup.team===r.team)return r.throwSetup;
  const team=r.team,lineY=r.y<34?0:68,point={x:r.x,y:lineY},local=worldToLocal(team,r.x,lineY),side=lineY<34?-1:1,insideY=side<0?1:-1;
  const attackers=outfield(m,team),used=new Set();
  let thrower=nearestForTarget(attackers,point,'THROWER',used);if(!thrower)return null;used.add(thrower.id);
  const targetsLocal={
    short:{x:clamp(local.x-4.2,7,96),y:clamp(local.y+insideY*5.8,4.5,63.5)},
    forward:{x:clamp(local.x+6.4,8,98),y:clamp(local.y+insideY*7.2,5.0,63.0)},
    inside:{x:clamp(local.x-0.8,8,97),y:clamp(local.y+insideY*12.5,7.0,61.0)}
  };
  const targets={short:localToWorld(team,targetsLocal.short.x,targetsLocal.short.y),forward:localToWorld(team,targetsLocal.forward.x,targetsLocal.forward.y),inside:localToWorld(team,targetsLocal.inside.x,targetsLocal.inside.y)};
  const short=nearestForTarget(attackers,targets.short,'SHORT',used);if(short)used.add(short.id);
  const forward=nearestForTarget(attackers,targets.forward,'FORWARD',used);if(forward)used.add(forward.id);
  const inside=nearestForTarget(attackers,targets.inside,'INSIDE',used);if(inside)used.add(inside.id);
  r.throwSetup={team,throwerId:thrower.id,receiverIds:[short?.id,forward?.id,inside?.id].filter(Boolean),targets,createdAt:m.time};
  if(setup)setup.kickerId=thrower.id;return r.throwSetup;
}
function buildThrowIn(m,setup){
  const r=m.restart,plan=ensureThrowPlan(m,setup);if(!r||!plan)return null;
  const team=r.team,opp=other(team),lineY=r.y<34?0:68,throwerPoint={x:r.x,y:lineY===0?-0.65:68.65},localPoint=worldToLocal(team,r.x,lineY),insideSign=localPoint.y<34?1:-1;
  target(setup,plan.throwerId,throwerPoint,'THROW_IN_THROWER',true,true);
  const receiverTargets=new Map(),keys=['short','forward','inside'];
  plan.receiverIds.forEach((id,i)=>{const t=plan.targets[keys[i]];if(t){receiverTargets.set(id,t);target(setup,id,t,`THROW_IN_OPTION_${keys[i].toUpperCase()}`,true,true);}});
  for(const p of teamPlayers(m,team)){
    if(p.role==='GK'||p.id===plan.throwerId||receiverTargets.has(p.id))continue;
    const l=worldToLocal(team,p.x,p.y),maxToward=localPoint.y<34?Math.max(l.y,16):Math.min(l.y,52),w=localToWorld(team,l.x,clamp(maxToward,5,63));target(setup,p.id,w,'THROW_IN_HOLD_ATTACK',false,false);
  }
  const defenders=outfield(m,opp),usedD=new Set();
  for(const rid of plan.receiverIds){const a=playerById(m,rid);if(!a)continue;const al=worldToLocal(team,a.x,a.y);let best=null,bestScore=1e9;
    for(const d of defenders){if(usedD.has(d.id))continue;const dl=worldToLocal(team,d.x,d.y);let score=dist(d,a)+Math.abs(dl.y-al.y)*0.12;if(d.role==='FB'&&a.role==='WF')score-=0.7;if(d.role==='CM'&&a.role==='CM')score-=0.6;if(d.role==='CB'&&a.role==='ST')score-=0.55;if(score<bestScore){bestScore=score;best=d;}}
    if(!best)continue;usedD.add(best.id);const markLocal={x:clamp(al.x+1.25,5,100),y:clamp(al.y+insideSign*0.30,4,64)};target(setup,best.id,localToWorld(team,markLocal.x,markLocal.y),'THROW_IN_MARK_OPTION',true,true);best.markTargetId=a.id;
  }
  const defendThrowLocal=worldToLocal(opp,r.x,r.y),throwSide=defendThrowLocal.y<34?-1:1;
  for(const p of teamPlayers(m,opp)){if(p.role==='GK'||usedD.has(p.id))continue;
    const l=worldToLocal(opp,p.x,p.y),baseY={LB:10,LCB:27,RCB:41,RB:58,LCM:21,CM:34,RCM:47,LW:11,ST:34,RW:57}[p.slot]??34;
    const pSide=baseY<28?-1:baseY>40?1:0,same=pSide===throwSide,shift=(defendThrowLocal.y-34)*(same?0.23:pSide===0?0.17:0.11);
    const holdY=clamp(baseY+shift,7,61),depthTarget=clamp(defendThrowLocal.x+8.0,18,72),holdX=clamp(lerp(l.x,depthTarget,same?0.20:0.12),6,78);
    target(setup,p.id,localToWorld(opp,holdX,holdY),'THROW_IN_SLIDE_DEFENCE',same,false);
  }
  return setup;
}
function buildPenalty(m,setup){
  const r=m.restart,team=r.team,opp=other(team),attackers=teamPlayers(m,team),defenders=teamPlayers(m,opp),used=new Set();
  const spot=localToWorld(team,94,34),approach=localToWorld(team,92.9,34);
  const kicker=nearestForTarget(outfield(m,team),spot,'SET_PIECE',used);if(!kicker)return null;used.add(kicker.id);setup.kickerId=kicker.id;target(setup,kicker.id,approach,'PENALTY_KICKER_READY',true,true);
  for(const p of attackers){if(p.id===kicker.id)continue;let q;if(p.role==='GK')q=[6.5,34];else if(p.role==='CB'||p.role==='FB')q=[70,p.slot==='LB'?13:p.slot==='RB'?55:p.slot==='LCB'?28:40];else q=[87.0,p.slot==='LW'?22:p.slot==='RW'?46:p.slot==='LCM'?27:p.slot==='RCM'?41:34];target(setup,p.id,localSlotTarget(team,p,q[0],q[1]),'PENALTY_ATTACK_WAIT',p.role!=='GK',true);}
  for(const p of defenders){let q;if(p.role==='GK')q=[104.1,34];else q=[87.4,p.slot==='LB'?18:p.slot==='RB'?50:p.slot==='LCB'?28:p.slot==='RCB'?40:p.slot==='LW'?22:p.slot==='RW'?46:34];target(setup,p.id,opponentSlotTarget(team,p,q[0],q[1]),p.role==='GK'?'PENALTY_GK_SET':'PENALTY_DEFENCE_WAIT',true,true);}
  return setup;
}
function ensurePlan(m){
  const setup=freshSetup(m);if(!setup)return null;if(Object.keys(setup.targets).length)return setup;
  if(setup.kind==='GOAL_KICK')return buildGoalKick(m,setup);
  if(setup.kind==='CORNER')return buildCorner(m,setup);
  if(setup.kind==='FREE_KICK'||setup.kind==='OFFSIDE')return buildFreeKick(m,setup);
  if(setup.kind==='PENALTY')return buildPenalty(m,setup);
  if(setup.kind==='THROW_IN')return buildThrowIn(m,setup);
  return setup;
}
function begin(m){const setup=ensurePlan(m);if(setup)applyTargets(m,setup);return setup;}
function assign(m){const setup=ensurePlan(m);if(!setup)return false;return applyTargets(m,setup);}
// P0 coordinate guard: forced release is not an escape hatch for an
// impossible CORNER/FREE_KICK/OFFSIDE assignment. Other restart families use
// different tactical slot semantics and are intentionally not classified here.
function hasWrongEndRequiredTarget(m,setup){
  if(!setup||!['CORNER','FREE_KICK','OFFSIDE'].includes(setup.kind))return false;
  const restartTeam=setup.team,defTeam=other(restartTeam),restartGoal={x:restartTeam===HOME?0:105,y:34},defGoal={x:defTeam===HOME?0:105,y:34};
  for(const id of setup.requiredIds){const p=playerById(m,id),t=setup.targets[id];if(!p||!t)continue;const own=dist(t,p.team===restartTeam?restartGoal:defGoal),otherGoal=dist(t,p.team===restartTeam?defGoal:restartGoal);if(own>otherGoal)return true;}
  return false;
}
function readiness(m){
  const r=m.restart,setup=ensurePlan(m);if(!r||!setup)return{ready:false,ratio:0,kickerReady:false,forced:false};
  const kicker=playerById(m,setup.kickerId),kickerTarget=setup.targets[setup.kickerId];
  // APPROACH is measured against the live ball target, not the earlier settle point.
  const approachToBall=setup.kind==='FREE_KICK'&&r.stage==='APPROACH';
  const kickerReady=!!(kicker&&(approachToBall?dist(kicker,{x:r.x,y:r.y})<=0.95:(kickerTarget&&dist(kicker,kickerTarget)<=0.95)));
  let facingReady=true;if(setup.kind==='GOAL_KICK'&&kicker&&setup.goalKickPlan?.targetPoint){const a=Math.atan2(setup.goalKickPlan.targetPoint.y-kicker.y,setup.goalKickPlan.targetPoint.x-kicker.x);kicker.faceTargetAngle=a;facingReady=Math.abs(angleDiff(Number.isFinite(kicker.bodyAngle)?kicker.bodyAngle:a,a))<=0.20;}
  let readyN=0,total=0;for(const id of setup.requiredIds){const p=playerById(m,id),t=setup.targets[id];if(!p||!t)continue;total++;if(dist(p,t)<=2.65)readyN++;}
  const ratio=total?readyN/total:1,forced=m.time>=setup.maxReadyAt,wrongEndRequiredTarget=hasWrongEndRequiredTarget(m,setup),requiredRatio=setup.kind==='CORNER'?0.90:setup.kind==='PENALTY'?0.90:0.72,ready=kickerReady&&facingReady&&!wrongEndRequiredTarget&&((m.time>=setup.minReadyAt&&ratio>=requiredRatio)||forced);setup.readyRatio=ratio;return{ready,ratio,kickerReady,facingReady,forced,wrongEndRequiredTarget,requiredRatio,stage:r.stage||'SETUP',kickerPosition:kicker?{x:Number(kicker.x.toFixed(3)),y:Number(kicker.y.toFixed(3))}:null,kickerTarget:kickerTarget?{x:Number(kickerTarget.x.toFixed(3)),y:Number(kickerTarget.y.toFixed(3))}:null,kickerDistance:kicker?(approachToBall?dist(kicker,{x:r.x,y:r.y}):kickerTarget?dist(kicker,kickerTarget):null):null,elapsed:m.time-setup.createdAt,minReadyAt:setup.minReadyAt,maxReadyAt:setup.maxReadyAt};
}
function isReady(m){return readiness(m).ready;}
function kickerId(m){const s=ensurePlan(m);return s?.kickerId||null;}
function chooseThrowPlan(m){
  const r=m.restart,setup=ensurePlan(m),plan=ensureThrowPlan(m,setup);if(!r||!plan)return null;
  const thrower=playerById(m,plan.throwerId);if(!thrower)return null;let best=null,bestScore=-1e9;
  for(const rid of plan.receiverIds){const p=playerById(m,rid);if(!p)continue;let nearest=99;for(const q of outfield(m,other(r.team)))nearest=Math.min(nearest,dist(p,q));const d=dist(thrower,p);if(d<2.5||d>17.5)continue;const forward=worldToLocal(r.team,p.x,p.y).x-worldToLocal(r.team,thrower.x,thrower.y).x,score=nearest*0.85-Math.abs(d-8.5)*0.18+forward*0.05;if(score>bestScore){bestScore=score;best=p;}}
  if(!best)best=playerById(m,plan.receiverIds[0]);return best?{throwerId:thrower.id,receiverId:best.id,targetPoint:{x:best.x,y:best.y}}:null;
}
function chooseGoalKickPlan(m){
  const r=m.restart,setup=ensurePlan(m);if(!r||r.kind!=='GOAL_KICK'||!setup)return null;
  const kicker=playerById(m,setup.kickerId),base=setup.goalKickPlan;if(!kicker||!base)return null;
  const candidates=teamPlayers(m,r.team).filter(p=>p.role!=='GK'&&['ST','WF','CM'].includes(p.role));
  let best=null,bestScore=1e9;for(const p of candidates){const d=dist(p,base.targetPoint),rolePenalty=p.role==='ST'?0:p.role==='WF'?0.55:1.1,score=d+rolePenalty;if(score<bestScore){bestScore=score;best=p;}}
  const d=Math.max(1,dist({x:r.x,y:r.y},base.targetPoint)),loft=7.5,airTime=2*Math.sqrt((2*loft)/9.81),speed=clamp(d/airTime,19.0,24.5);
  base.targetPlayerId=best?.id||null;base.airTime=airTime;base.speed=speed;base.loft=loft;
  return{kickerId:kicker.id,targetPoint:{...base.targetPoint},targetPlayerId:base.targetPlayerId,speed,loft,airTime,deliveryMode:'AERIAL',mode:'LONG',team:r.team};
}
function beginGoalKickFlight(m,plan){
  if(!plan||!plan.targetPoint)return null;const team=plan.team,opp=other(team),point=plan.targetPoint,airTime=plan.airTime||2.4,until=m.time+airTime+0.35,startAt=m.time+clamp(airTime*0.34,0.70,0.95);
  const attackers=outfield(m,team).filter(p=>['ST','WF','CM'].includes(p.role)).map(p=>({p,d:dist(p,point)})).sort((a,b)=>a.d-b.d).slice(0,2);
  const defenders=outfield(m,opp).filter(p=>['CB','FB','CM'].includes(p.role)).map(p=>({p,d:dist(p,point)})).sort((a,b)=>a.d-b.d).slice(0,2);
  const targets=[];
  attackers.forEach((o,i)=>{const off=i===0?-0.45:-1.15,pt={x:point.x+off*(team===HOME?1:-1),y:point.y+(i===0?-0.65:1.55)};targets.push({id:o.p.id,pt,task:'CHASE_GOAL_KICK_LANDING'});});
  defenders.forEach((o,i)=>{const off=i===0?0.55:1.35,pt={x:point.x+off*(team===HOME?1:-1),y:point.y+(i===0?0.75:-1.65)};targets.push({id:o.p.id,pt,task:'CHASE_GOAL_KICK_LANDING'});});
  m.goalKickFlightPlan={team,targetPoint:{...point},startAt,until,targets,applied:false};return{runnerIds:targets.map(t=>t.id),targetPoint:{...point},startAt,until};
}
function updateGoalKickFlight(m){
  const gp=m.goalKickFlightPlan;if(!gp)return false;
  if(m.ball.mode!=='FLIGHT'||m.ball.kind!=='GOAL_KICK'){delete m.goalKickFlightPlan;return false;}
  if(gp.applied||m.time<gp.startAt)return false;
  for(const t of gp.targets){const q=playerById(m,t.id);if(!q)continue;setWorldTarget(q,t.pt,t.task,true);q.lockTargetUntil=gp.until;}
  gp.applied=true;return true;
}
function debugSummary(m){const s=ensurePlan(m),rd=readiness(m);return s?{version:VERSION,kind:s.kind,team:s.team,kickerId:s.kickerId,targetCount:Object.keys(s.targets).length,requiredCount:s.requiredIds.length,readyRatio:Number(rd.ratio.toFixed(3)),kickerReady:rd.kickerReady,ready:rd.ready,forced:rd.forced}:null;}
return{VERSION,begin,assign,isReady,readiness,hasWrongEndRequiredTarget,kickerId,chooseThrowPlan,chooseGoalKickPlan,beginGoalKickFlight,updateGoalKickFlight,debugSummary};
});
