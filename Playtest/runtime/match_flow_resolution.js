(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_MATCH_FLOW_RESOLUTION=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const FIELD={L:0,R:105,T:0,B:68,BOX_X:88.5,GOAL_X:105,GOAL_Y1:30.34,GOAL_Y2:37.66};
const HOME='HOME';

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function hash32(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function rng(seed){let a=hash32(seed)||1;return function(){a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function segmentPointDistance(a,b,p){const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y,c1=vx*wx+vy*wy,c2=vx*vx+vy*vy;const t=c2?clamp(c1/c2,0,1):0;return Math.hypot(p.x-(a.x+vx*t),p.y-(a.y+vy*t));}
function goalDistance(p){return Math.hypot(FIELD.GOAL_X-p.x,34-p.y);}
function inBox(p){return p.x>=FIELD.BOX_X&&p.y>=13.84&&p.y<=54.16;}

function shotWindow(state){
  const owner=state.owner,defenders=state.defenders||[],gk=state.gk||{x:102.5,y:34};
  const gd=goalDistance(owner);
  const targetYs=[31.2,34,36.8];
  const lanes=targetYs.map(y=>{
    const target={x:FIELD.GOAL_X,y};
    const blockers=defenders.filter(d=>d.x>owner.x-0.2&&segmentPointDistance(owner,target,d)<1.05&&dist(owner,d)>0.8);
    return{y,blockers};
  });
  const best=lanes.sort((a,b)=>a.blockers.length-b.blockers.length)[0];
  const nearest=Math.min(99,...defenders.map(d=>dist(owner,d)));
  const goalSide=defenders.filter(d=>d.x>owner.x&&dist(owner,d)<6.5&&Math.abs(d.y-owner.y)<5.0).length;
  const anglePenalty=Math.abs(owner.y-34)/20;
  const gkOffset=Math.abs(gk.y-best.y);
  let score=1.0;
  score-=clamp((gd-8)/22,0,0.62);
  score-=best.blockers.length*0.38;
  score-=goalSide*0.14;
  score-=anglePenalty*0.22;
  score+=clamp(gkOffset/12,0,0.14);
  if(nearest<1.25)score-=0.25; else if(nearest<2.4)score-=0.10;
  if(inBox(owner)&&gd<11&&best.blockers.length===0&&goalSide===0)score+=0.22;
  score=clamp(score,0,1.25);
  const classification=score>=0.78?'CLEAR':score>=0.43?'PRESSURED':'BLOCKED';
  return{classification,score,distance:gd,bestTargetY:best.y,blockers:best.blockers.length,nearestDefender:nearest};
}

function boxPatterns(){
  // Templates are authored as if the ball-side is RIGHT. planBoxOccupation mirrors
  // the geometry for LEFT, then binds semantic jobs to actual LW/RW/LCM/RCM/LB/RB.
  // FAR-side slots stay on the opposite half instead of crossing over the ball-side player.
  return [
    {id:'WIDE_CUTBACK',slots:{ST:['NEAR_POST',93,32.5],FAR_WF:['BACK_POST',92,29],NEAR_WF:['CUTBACK_PROVIDER',87.5,50],RUNNER_CM:['LATE_BOX',89.5,37],OTHER_CM:['EDGE_BOX',83.5,30],BALL_FB:['OVERLAP_SUPPORT',82,56],FAR_FB:['REST_DEFENCE',65,18]}},
    {id:'HALFSPACE_COMBINATION',slots:{ST:['PIN_CENTRE',92.5,34],NEAR_WF:['INSIDE_CHANNEL',90,43],FAR_WF:['HOLD_WIDTH',83,14],RUNNER_CM:['HALFSPACE_SUPPORT',84.5,39],OTHER_CM:['EDGE_BOX',82,31],BALL_FB:['WIDE_SUPPORT',80,57],FAR_FB:['REST_DEFENCE',64,17]}},
    {id:'MIDFIELD_LATE_ARRIVAL',slots:{ST:['NEAR_POST',93,36.5],NEAR_WF:['WIDE_PROVIDER',86,56],FAR_WF:['BACK_POST',91,30],RUNNER_CM:['PENALTY_SPOT_RUN',90,35],OTHER_CM:['EDGE_SHOT',82.5,40],BALL_FB:['UNDERLAP_SUPPORT',79,44],FAR_FB:['REST_DEFENCE',65,17]}},
    {id:'WINGER_DRIVE',slots:{ST:['PIN_FAR_CB',91.5,31],NEAR_WF:['BOX_CHANNEL_RUN',91,43],FAR_WF:['BACK_POST',90,29],RUNNER_CM:['CUTBACK_RECEIVER',86,36],OTHER_CM:['SECOND_BALL',80.5,29],BALL_FB:['OVERLAP_SUPPORT',83,58],FAR_FB:['REST_DEFENCE',63,18]}}
  ];
}

function enforcePlayerLane(player,a){
  const out={...a};
  if(player==='LW')out.y=clamp(out.y,7,35);
  else if(player==='RW')out.y=clamp(out.y,33,61);
  else if(player==='LB')out.y=clamp(out.y,5,30);
  else if(player==='RB')out.y=clamp(out.y,38,63);
  else if(player==='LCM')out.y=clamp(out.y,20,38);
  else if(player==='RCM')out.y=clamp(out.y,30,48);
  else if(player==='ST')out.y=clamp(out.y,27,41);
  return out;
}

function planBoxOccupation(seed='box',context={}){
  const r=rng(seed),patterns=boxPatterns();
  const idx=context.patternIndex!=null?context.patternIndex%patterns.length:Math.floor(r()*patterns.length);
  const p=patterns[idx];
  const nearSide=context.nearSide|| (r()<0.5?'LEFT':'RIGHT');
  const mirror=nearSide==='LEFT'?-1:1;
  const yMap=y=>mirror===1?y:68-y;
  const assignments={};
  for(const [role,[task,x,y]] of Object.entries(p.slots))assignments[role]={task,x,y:yMap(y)};

  const actual = nearSide==='LEFT'
    ? {ST:'ST',LW:'NEAR_WF',RW:'FAR_WF',LCM:'RUNNER_CM',RCM:'OTHER_CM',LB:'BALL_FB',RB:'FAR_FB'}
    : {ST:'ST',LW:'FAR_WF',RW:'NEAR_WF',LCM:'OTHER_CM',RCM:'RUNNER_CM',LB:'FAR_FB',RB:'BALL_FB'};
  const playerAssignments={};
  for(const [player,semantic] of Object.entries(actual)){
    playerAssignments[player]=enforcePlayerLane(player,{...assignments[semantic],semantic});
  }
  return{pattern:p.id,nearSide,assignments,playerAssignments};
}

function forwardRunners(state){
  const owner=state.owner||{x:0,y:34};
  return (state.teammates||[])
    .filter(t=>t.x>=owner.x+0.9&&t.x<=102.3)
    .sort((a,b)=>{
      const ag=(a.x-owner.x)-Math.abs(a.y-owner.y)*0.035;
      const bg=(b.x-owner.x)-Math.abs(b.y-owner.y)*0.035;
      return bg-ag;
    });
}

function chooseFinalThirdAction(seed,state){
  const r=rng(seed),owner=state.owner,shot=shotWindow(state),pressure=shot.nearestDefender;
  const role=owner.role||'ST';
  const sideDepth=owner.x>89&&Math.abs(owner.y-34)>11;
  const central=inBox(owner)&&Math.abs(owner.y-34)<13;
  const teammates=state.teammates||[];
  const runners=forwardRunners(state);
  const hasCutback=teammates.some(t=>t.x>=84&&t.x<=91&&Math.abs(t.y-34)<9);
  const hasRunner=teammates.some(t=>t.role==='CM'&&t.x>=84&&t.x<=93);

  // High-quality chances resolve before generic circulation.
  if(shot.classification==='CLEAR'){
    const shootP=role==='ST'?0.91:role==='WF'?0.82:0.70;
    if(r()<shootP)return{action:'SHOT',reason:'CLEAR_WINDOW',shot};
  }
  if(shot.classification==='PRESSURED'){
    let shootP=role==='ST'?0.58:role==='WF'?0.46:0.38;
    if(owner.x>92)shootP+=0.12;
    if(r()<shootP)return{action:'SHOT',reason:'PRESSURED_WINDOW',shot};
  }
  // Contact can naturally end an attack before another circulation pass.
  if(state.foulPressure&&pressure<2.80&&r()<0.10)return{action:'FOUL_DRAWN',reason:'CONTACT',shot};
  if(sideDepth){
    if(hasCutback&&r()<0.48)return{action:'CUTBACK',reason:'DEEP_WIDE',shot};
    if(r()<0.44)return{action:'CROSS',reason:'DEEP_WIDE',shot};
  }
  if(central&&pressure<2.2&&r()<0.28)return{action:'DRIBBLE_EVADE',reason:'CREATE_ANGLE',shot};
  if(hasRunner&&r()<0.38)return{action:'LAYOFF_CM',reason:'LATE_RUNNER',shot};
  if(state.openThroughLane&&runners.length&&r()<0.36)return{action:'THROUGH_PASS',reason:'RUNNER_LANE',shot,targetPlayer:runners[0]};
  // Backpass is a release valve, not the default final-third action.
  const backpassP=shot.classification==='BLOCKED'?0.14:0.05;
  if(r()<backpassP)return{action:'RECYCLE',reason:'NO_FORWARD_LANE',shot};
  return{action:pressure<2.4?'DRIBBLE_EVADE':'COMBINATION_PASS',reason:'KEEP_ATTACK_ALIVE',shot};
}

function resolveDuel(seed='duel',opts={}){
  const r=rng(seed),dt=opts.dt||0.05,maxTime=opts.maxTime||1.65;
  const attacker={x:opts.attackerX??87.0,y:opts.attackerY??34.0,vx:0,vy:0};
  const defender={x:opts.defenderX??89.0,y:opts.defenderY??35.0,vx:0,vy:0};
  const initial={attacker:{...attacker},defender:{...defender}};
  const frames=[];
  const shot=opts.shot||shotWindow({owner:{...attacker,role:opts.role||'ST'},defenders:[defender],gk:{x:102.5,y:34}});
  let t=0,outcome=null,state='APPROACH',nextResolutionAt=0.62+r()*0.18;
  const side=r()<0.5?-1:1;
  while(t<maxTime&&!outcome){
    const d=dist(attacker,defender);
    if(d<2.5)state='CONTAIN';
    if(d<1.35)state='ENGAGE';
    const goalDir={x:1,y:0};
    const evade={x:0.78,y:side*0.63};
    let ax=goalDir.x,ay=goalDir.y;
    if(state==='CONTAIN'||state==='ENGAGE'){ax=evade.x;ay=evade.y;}
    const as=state==='APPROACH'?4.2:3.6;
    attacker.vx=lerp(attacker.vx,ax*as,0.25);attacker.vy=lerp(attacker.vy,ay*as,0.25);
    attacker.x+=attacker.vx*dt;attacker.y=clamp(attacker.y+attacker.vy*dt,2,66);
    // Defender shadows goal-side, not the exact same coordinate.
    const target={x:attacker.x+1.05,y:attacker.y-side*0.55};
    const dx=target.x-defender.x,dy=target.y-defender.y,dd=Math.hypot(dx,dy)||1,ds=4.0;
    defender.vx=lerp(defender.vx,dx/dd*ds,0.30);defender.vy=lerp(defender.vy,dy/dd*ds,0.30);
    defender.x+=defender.vx*dt;defender.y=clamp(defender.y+defender.vy*dt,2,66);
    t+=dt;
    frames.push({t,attacker:{...attacker},defender:{...defender},state});
    const nd=dist(attacker,defender);
    if(t>0.40&&shot.classification==='CLEAR'&&r()<0.035){outcome='SHOT';break;}
    if(t>=nextResolutionAt&&nd<1.55){
      const roll=r();
      if(roll<0.21)outcome='TACKLE_WON';
      else if(roll<0.31)outcome='FOUL';
      else if(roll<0.45)outcome='LOOSE_BALL';
      else if(roll<0.68)outcome='ATTACKER_ESCAPE';
      else if(roll<0.85)outcome='PASS_RELEASE';
      else nextResolutionAt=t+0.34+r()*0.24;
    }
    if(t>=maxTime-1e-9){
      const roll=r();outcome=roll<0.24?'LOOSE_BALL':roll<0.56?'PASS_RELEASE':roll<0.78?'ATTACKER_ESCAPE':'FOUL';
    }
  }
  return{duration:t,outcome,frames,initial,final:{attacker:{...attacker},defender:{...defender}},shot};
}

function resolveRestart(seed,outcome,context={}){
  const r=rng(seed);
  if(outcome==='FOUL'||outcome==='FOUL_DRAWN')return{restart:'FREE_KICK',team:'ATTACK'};
  if(outcome==='BLOCKED_SHOT')return{restart:r()<0.72?'CORNER':'LOOSE_BALL',team:r()<0.72?'ATTACK':'NONE'};
  if(outcome==='SHOT_WIDE')return{restart:'GOAL_KICK',team:'DEFENCE'};
  if(outcome==='DEFENDER_CLEAR')return{restart:r()<0.42?'THROW_IN':r()<0.22?'CORNER':'OPEN_PLAY',team:'ATTACK'};
  if(outcome==='BALL_OUT_SIDE')return{restart:'THROW_IN',team:context.lastTouch==='ATTACK'?'DEFENCE':'ATTACK'};
  return{restart:'OPEN_PLAY',team:'NONE'};
}

function resolveFinalThird(seed,state){
  const r=rng(seed),choice=chooseFinalThirdAction(seed+'|choice',state),shot=choice.shot;
  if(choice.action==='SHOT'){
    if(shot.blockers>0&&r()<0.48){const rr=resolveRestart(seed+'|block','BLOCKED_SHOT');return{...choice,outcome:'BLOCKED_SHOT',restart:rr.restart};}
    const onTarget=0.52+0.24*shot.score;
    if(r()>onTarget){const rr=resolveRestart(seed+'|wide','SHOT_WIDE');return{...choice,outcome:'SHOT_WIDE',restart:rr.restart};}
    const goalP=clamp(0.10+0.36*shot.score,0.08,0.58);
    if(r()<goalP)return{...choice,outcome:'GOAL',restart:'KICKOFF'};
    return{...choice,outcome:'SAVE',restart:'GK_POSSESSION'};
  }
  if(choice.action==='CROSS'||choice.action==='CUTBACK'){
    const defenderWin=0.34+(state.boxDefenders||3)*0.045;
    const rr=r();
    if(rr<defenderWin){const res=resolveRestart(seed+'|clear','DEFENDER_CLEAR');return{...choice,outcome:'DEFENDER_CLEAR',restart:res.restart};}
    if(rr<defenderWin+0.16)return{...choice,outcome:'LOOSE_BALL',restart:'OPEN_PLAY'};
    return{...choice,outcome:choice.action==='CUTBACK'?'CUTBACK_RECEIVED':'CROSS_RECEIVED',restart:'OPEN_PLAY'};
  }
  if(choice.action==='FOUL_DRAWN')return{...choice,outcome:'FOUL',restart:'FREE_KICK'};
  if(choice.action==='DRIBBLE_EVADE'){
    const p=shot.nearestDefender<1.4?0.28:0.14;
    if(r()<p){const duel=resolveDuel(seed+'|dribble',{attackerX:state.owner.x,attackerY:state.owner.y,defenderX:state.defenders[0]?.x??state.owner.x+1.5,defenderY:state.defenders[0]?.y??state.owner.y+0.5,role:state.owner.role});return{...choice,outcome:duel.outcome,restart:duel.outcome==='FOUL'?'FREE_KICK':'OPEN_PLAY',duel};}
    return{...choice,outcome:'DRIBBLE_PROGRESS',restart:'OPEN_PLAY'};
  }
  return{...choice,outcome:choice.action,restart:'OPEN_PLAY'};
}

function buildScenario(seed='scenario',variant='MIXED'){
  const r=rng(seed);
  const role=r()<0.40?'ST':r()<0.78?'WF':'CM';
  let x,y;
  if(variant==='ONE_V_ONE'){x=94+r()*4;y=30+r()*8;}
  else if(variant==='WIDE'){x=88+r()*7;y=r()<0.5?8+r()*9:51+r()*9;}
  else{x=84+r()*11;y=17+r()*34;}
  const owner={x,y,role};
  const defenders=[];const n=variant==='ONE_V_ONE'?0:2+Math.floor(r()*3);
  for(let i=0;i<n;i++)defenders.push({x:clamp(x+1+r()*8,0,104),y:clamp(y-7+r()*14,2,66)});

  const leftOwner=y<34;
  const teammates=[
    {x:Math.max(87,x-1.5),y:34,role:'ST',side:'C'},
    {x:Math.max(85,x-2.0),y:24,role:'WF',side:'L'},
    {x:Math.max(85,x-2.0),y:44,role:'WF',side:'R'},
    {x:Math.max(82,x-4.0),y:29,role:'CM',side:'L'},
    {x:Math.max(81,x-5.0),y:39,role:'CM',side:'R'}
  ];
  // Through lanes are real forward-running lanes, not a random label on a backward pass.
  let openThroughLane=variant!=='ONE_V_ONE'&&x<96&&r()<0.42;
  if(openThroughLane){
    const runner=teammates[leftOwner?2:1]; // opposite/inside runner attacks beyond the owner.
    runner.x=clamp(x+1.8+r()*3.2,88,101.0);
    runner.y=clamp(owner.y+(leftOwner?8:-8)+(r()-.5)*5,18,50);
  }
  openThroughLane=openThroughLane&&forwardRunners({owner,teammates}).length>0;
  return{owner,defenders,gk:{x:102.2,y:34+(r()-.5)*3},teammates,openThroughLane,foulPressure:r()<0.4,boxDefenders:n};
}

return{FIELD,HOME,rng,shotWindow,planBoxOccupation,forwardRunners,chooseFinalThirdAction,resolveDuel,resolveRestart,resolveFinalThird,buildScenario};
});
