(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_TACTICS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const FLOW=(typeof globalThis!=='undefined'&&globalThis.FLRPG_MATCH_FLOW_RESOLUTION)||((typeof require==='function')?(()=>{try{return require('./match_flow_resolution.js')}catch(_e){return null}})():null);
const HOME='HOME',AWAY='AWAY';
const FORMATION='4-3-3';
const PROFILES={
  HOME:{
    id:'WIDE_OVERLAP',label:'폭 활용 · 한쪽 풀백 적극 지원',formation:FORMATION,
    width:1.07,lineHeight:0.54,compactness:0.56,press:0.60,tempo:0.50,directness:0.48,
    leftBack:'BALANCED',rightBack:'OVERLAP',wingerWidth:1.00,midfieldRunner:'RCM'
  },
  AWAY:{
    id:'INVERT_PRESS',label:'조금 높은 압박 · 한쪽 풀백 인버트',formation:FORMATION,
    width:1.03,lineHeight:0.58,compactness:0.62,press:0.64,tempo:0.56,directness:0.54,
    leftBack:'INVERT',rightBack:'OVERLAP',wingerWidth:0.94,midfieldRunner:'LCM'
  }
};

const BASE_LANES={GK:34,LB:9,LCB:27,RCB:41,RB:59,LCM:21,CM:34,RCM:47,LW:9,ST:34,RW:59};
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function hash32(str){let h=2166136261>>>0;for(let i=0;i<String(str).length;i++){h^=String(str).charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function dir(team){return team===HOME?1:-1;}
function other(team){return team===HOME?AWAY:HOME;}
function worldToLocal(team,x,y){return team===HOME?{x,y}:{x:105-x,y:68-y};}
function localToWorld(team,x,y){return team===HOME?{x,y}:{x:105-x,y:68-y};}
function teamPlayers(m,team){return m.players.filter(p=>p.team===team);}
function outfield(m,team){return m.players.filter(p=>p.team===team&&p.role!=='GK');}
function playerById(m,id){return id?m.playersById[id]:null;}
function profile(m,team){
  const base=PROFILES[team]||PROFILES.HOME,manager=m?.managerProfiles?.[team];
  if(!manager)return base;
  // STEP39 V0.4: manager style is an input to tactical planning, never a post-hoc coordinate shove.
  // Preserve team identity while letting the manager meaningfully influence block height and pressure.
  return{...base,
    lineHeight:clamp(base.lineHeight*.35+manager.lineHeight*.65,.30,.82),
    press:clamp(base.press*.45+manager.pressing*.55,.30,.88),
    managerAttacking:manager.attacking,managerTransition:manager.transition,managerDirectness:manager.directness
  };
}
function lane(slot){return BASE_LANES[slot]??34;}
function ballLane(y){return y<22?'LEFT':y>46?'RIGHT':'CENTRE';}
function sameSide(slot,bl){return (['LB','LCB','LCM','LW'].includes(slot)&&bl==='LEFT')||(['RB','RCB','RCM','RW'].includes(slot)&&bl==='RIGHT');}
function sideSign(slot){return ['LB','LCB','LCM','LW'].includes(slot)?-1:['RB','RCB','RCM','RW'].includes(slot)?1:0;}
function pairedWingerSlot(fbSlot){return fbSlot==='LB'?'LW':fbSlot==='RB'?'RW':null;}
function wingerIsPenetrating(m,team,fbSlot){const ws=pairedWingerSlot(fbSlot),w=teamPlayers(m,team).find(p=>p.slot===ws);if(!w)return false;const l=worldToLocal(team,w.x,w.y);return l.x>78&&l.y>15&&l.y<53;}
function sameSideWingerState(m,team,slot){const left=['LB','LCB','LCM','LW'].includes(slot),right=['RB','RCB','RCM','RW'].includes(slot),ws=left?'LW':right?'RW':null,w=ws?teamPlayers(m,team).find(p=>p.slot===ws):null;if(!w)return null;const l=worldToLocal(team,w.x,w.y);return{player:w,local:l,wide:l.x>58&&(l.y<17||l.y>51),inside:l.x>70&&l.y>18&&l.y<50};}
function nearestOppDistance(m,p){let d=99;for(const q of outfield(m,other(p.team)))d=Math.min(d,dist(p,q));return d;}
function forwardSpace(m,p,maxD=12){let nearest=maxD;for(const q of outfield(m,other(p.team))){const fx=dir(p.team)*(q.x-p.x),lat=Math.abs(q.y-p.y);if(fx>0&&fx<maxD&&lat<4.0)nearest=Math.min(nearest,fx);}return nearest;}
function offsideLine(m,attTeam){const xs=teamPlayers(m,other(attTeam)).map(p=>p.x).sort((a,b)=>a-b);return attTeam===HOME?(xs[xs.length-2]??101):(xs[1]??4);}
function safeForwardLocal(m,p,wanted){
  // Supporting runs are legal up to the farther-forward of the defensive line and the ball.
  // The old defender-only cap made attackers look as if they deliberately refused to enter
  // the box after the carrier had already broken the line.
  const line=offsideLine(m,p.team),lineLocal=worldToLocal(p.team,line,p.y).x,ballLocal=worldToLocal(p.team,m.ball.x,p.y).x;
  const safeLocal=Math.max(lineLocal,ballLocal)-0.9;
  return clamp(Math.min(wanted,safeLocal,96.5),5,96.5);
}
function releaseForwardLocal(m,p,wanted){
  const entering=!['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','FAR_SIDE_RUN','FAR_SIDE_HOLD','FAR_SIDE_SHOULDER','FAR_SIDE_RECOVER'].includes(p.tacticalTask)||!Number.isFinite(p.releaseRunBiasAt)||m.time-p.releaseRunBiasAt>6.0;
  if(entering){
    p.releaseRunBiasAt=m.time;
    // Most runs hold the line. A minority deliberately live on the shoulder and can drift
    // marginally beyond it; the USER decides whether to release the pass now or wait.
    const marginal=m.r()<0.16;
    p.releaseRunTimingBias=marginal?(1.18+m.r()*0.34):(-0.08+m.r()*0.20);
  }
  return clamp(safeForwardLocal(m,p,wanted)+(p.releaseRunTimingBias||0),5,96.5);
}
function applyTarget(p,lx,ly,action,sprint=false,m=null){const w=localToWorld(p.team,clamp(lx,2.5,102.5),clamp(ly,2,66));const runTasks=new Set(['OVERLAP','UNDERLAP','BALANCED_OVERLAP','UNDERLAP_SUPPORT','THIRD_MAN_RUN','FAR_SIDE_RUN','PIN_AND_RUN','INSIDE_CHANNEL','ATTACK_NEAR_POST','ATTACK_BACK_POST','BOX_CHANNEL_RUN','LATE_BOX_ARRIVAL','WIDE_SUPPORT_8','BOX_WIDE_CUTBACK_LANE','FB_OVERLAP_SURGE','FB_UNDERLAP_SURGE','EMERGENCY_TRACK','RECOVERY_CHASE','ST_WALL_SUPPORT','ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','SECOND_BALL_SUPPORT','PULL_OFF_FOR_CROSS','ATTACK_OPEN_CHANNEL','POST_PASS_CONTINUE_RUN']);const changed=p.tacticalTask!==action;if(m&&runTasks.has(action)&&changed&&(!p.lastRunCountAt||m.time-p.lastRunCountAt>70.0)){m.stats.runsStarted=(m.stats.runsStarted||0)+1;p.lastRunCountAt=m.time;}p.tx=w.x;p.ty=w.y;p.action=action;p.tacticalTask=action;p.sprint=!!sprint;}

function phaseFromProgress(progress,transition){if(transition)return'TRANSITION';if(progress<28)return'BUILD_UP';if(progress<58)return'PROGRESSION';if(progress<80)return'FINAL_THIRD';return'CHANCE';}

function tacticalRuntime(m,team,progress){
  if(!m._tacticalRuntime)m._tacticalRuntime={lastPossession:null,teams:{}};
  const rt=m._tacticalRuntime;
  if(rt.lastPossession!==m.possession){
    rt.lastPossession=m.possession;
    const st=rt.teams[m.possession]||(rt.teams[m.possession]={});
    st.markProgress=progress;st.lastAdvanceAt=m.time;st.surgeUntil=0;st.recoverUntil=m.time+0.9;st.wasSurging=false;st.boxWaveUntil=0;st.nextBoxWaveAt=m.time+2.5;st.boxPatternIndex=0;st.wideOutletSlot=null;st.wideOutletUntil=0;st.fullbackSurgeSlot=null;st.fullbackSurgeUntil=0;if(!st.nextFullbackSurgeAt)st.nextFullbackSurgeAt=m.time+240+m.r()*180;
  }
  const st=rt.teams[team]||(rt.teams[team]={markProgress:progress,lastAdvanceAt:m.time,surgeUntil:0,recoverUntil:0,wasSurging:false,boxWaveUntil:0,nextBoxWaveAt:0,boxPatternIndex:0,wideOutletSlot:null,wideOutletUntil:0,fullbackSurgeSlot:null,fullbackSurgeUntil:0,nextFullbackSurgeAt:m.time+150+m.r()*150});
  // A late midfield run is a short wave, never a permanent attacking position. Once the wave ends the runner must reconnect before another surge.
  if((st.surgeUntil||0)>0&&m.time>=st.surgeUntil){st.surgeUntil=0;st.recoverUntil=Math.max(st.recoverUntil||0,m.time+3.0);st.wasSurging=false;}
  if(progress>=st.markProgress+3.4){
    st.markProgress=progress;st.lastAdvanceAt=m.time;
    if((st.recoverUntil||0)<=m.time){st.surgeUntil=m.time+1.85;st.wasSurging=true;}
  }else if(progress<=st.markProgress-1.8){
    st.markProgress=progress;st.surgeUntil=0;st.recoverUntil=Math.max(st.recoverUntil||0,m.time+2.4);st.wasSurging=false;
  }
  if(progress<58){st.surgeUntil=0;st.recoverUntil=Math.max(st.recoverUntil||0,m.time+1.2);st.wasSurging=false;}
  if(progress>60&&m.time-(st.lastAdvanceAt||0)>2.0){st.surgeUntil=0;st.recoverUntil=Math.max(st.recoverUntil||0,m.time+2.0);st.wasSurging=false;}
  // Box occupation is a short attacking wave, not a permanent front-five location.
  if(progress>=83&&m.time>=(st.nextBoxWaveAt||0)&&m.time-(st.lastAdvanceAt||0)<1.15&&m.r()<0.45){st.boxWaveUntil=m.time+3.8;st.nextBoxWaveAt=m.time+18.0+m.r()*8.0;st.boxPatternIndex=Math.floor(m.r()*4);}else if(progress>=83&&m.time>=(st.nextBoxWaveAt||0)){st.nextBoxWaveAt=m.time+4.0;}
  if(progress<72)st.boxWaveUntil=0;
  // Keep one winger as a stable wide outlet for a short attacking spell. Using the instantaneous
  // ball side every 250ms made LW/RW swap box/outlet duties too quickly, so both often ended up inside.
  if(progress>=74){
    if(!st.wideOutletSlot||m.time>=(st.wideOutletUntil||0)){
      const by=worldToLocal(team,m.ball.x,m.ball.y).y;
      st.wideOutletSlot=by<30?'LW':by>38?'RW':((st.boxPatternIndex||0)%2===0?'LW':'RW');
      st.wideOutletUntil=m.time+5.2;
    }
  }else{st.wideOutletSlot=null;st.wideOutletUntil=0;}
  // One full-back may make an episodic supporting surge. This is intentionally short and
  // side-specific: it gives the player a visible overlapping/underlapping option without
  // turning both full-backs into permanent wingers or requiring FM-style user micromanagement.
  if((st.fullbackSurgeUntil||0)<=m.time)st.fullbackSurgeSlot=null;
  if(progress>=58&&progress<92&&m.time>=(st.nextFullbackSurgeAt||0)){ 
    const by=worldToLocal(team,m.ball.x,m.ball.y).y,side=by<30?'LB':by>38?'RB':(st.wideOutletSlot==='LW'?'LB':'RB');
    if(m.r()<0.68){st.fullbackSurgeSlot=side;st.fullbackSurgeUntil=m.time+3.6;st.nextFullbackSurgeAt=m.time+430+m.r()*250;m.stats.fullbackSurges=(m.stats.fullbackSurges||0)+1;}
    else st.nextFullbackSurgeAt=m.time+140+m.r()*120;
  }
  if(progress<48){st.fullbackSurgeSlot=null;st.fullbackSurgeUntil=0;}
  return{surge:(st.surgeUntil||0)>m.time&&(st.recoverUntil||0)<=m.time,recover:(st.recoverUntil||0)>m.time,boxWave:(st.boxWaveUntil||0)>m.time,boxPatternIndex:st.boxPatternIndex||0,wideOutletSlot:st.wideOutletSlot,fullbackSurgeSlot:st.fullbackSurgeSlot,fullbackSurge:(st.fullbackSurgeUntil||0)>m.time};
}
function attackingBaseLine(progress){return clamp(16+progress*0.38,18,50);}
function midfieldBase(progress){return clamp(31+progress*0.35,34,68);}
function forwardBase(progress){return clamp(56+progress*0.32,58,88);}
function stablePairVector(a,b){let h=2166136261>>>0;for(const ch of String(a)+'|'+String(b)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}const ang=(h%6283)/1000;return{x:Math.cos(ang),y:Math.sin(ang)};}
function liveSupportOffset(m,p,ampX=0.65,ampY=0.45){const v=stablePairVector(p.id,'LIVE_SUPPORT'),phase=Math.atan2(v.y,v.x),t=m.time*0.72+phase;return{x:Math.sin(t)*ampX,y:Math.sin(t*0.83+phase*0.37)*ampY};}
function inOpponentBoxTarget(team,x,y){const l=worldToLocal(team,x,y);return l.x>=88.0&&l.x<=97.0&&l.y>=13.5&&l.y<=54.5;}
function buildBoxSlotAssignments(m,team,ctx){
  if(ctx.phase!=='CHANCE'||!ctx.boxWave)return new Map();
  const map=new Map(),ps=teamPlayers(m,team),owner=ctx.owner,nearSign=ctx.wideOutletSlot==='LW'?-1:ctx.wideOutletSlot==='RW'?1:(ctx.ball.y<34?-1:1),idx=(ctx.boxPatternIndex||0)%4;
  const st=ps.find(p=>p.slot==='ST'),ballWf=ps.find(p=>p.slot===(nearSign<0?'LW':'RW')),farWf=ps.find(p=>p.slot===(nearSign<0?'RW':'LW'));
  const ballCm=ps.find(p=>p.slot===(nearSign<0?'LCM':'RCM')),farCm=ps.find(p=>p.slot===(nearSign<0?'RCM':'LCM'));
  const put=(p,lx,ly,task,sprint=true)=>{if(!p||p.id===owner?.id)return;map.set(p.id,{lx:safeForwardLocal(m,p,lx),ly:clamp(ly,4,64),task,sprint});};
  // Same conservative front-three wave as STEP34, with side ownership preserved.
  put(st,92.4,34+nearSign*3.4,'ATTACK_NEAR_POST',true);
  put(farWf,91.1,34-nearSign*11.5,'ATTACK_BACK_POST',true);
  // Default front-three occupation keeps the ball-side winger OUTSIDE the box as the delivery outlet.
  // Only one of four box-wave patterns rotates that winger inside; otherwise ST + far winger attack the box.
  if(idx===3)put(ballWf,88.4,34+nearSign*14.5,'BOX_WIDE_CUTBACK_LANE',true);
  else put(ballWf,88.0,34+nearSign*26.0,'WIDE_DELIVERY_HOLD',true);
  // Only half the patterns send an 8 into the box; the others hold the edge/second-ball zone.
  if(idx===0||idx===2)put(farCm,89.6,34-nearSign*3.2,idx===2?'PENALTY_SPOT_RUN':'LATE_BOX_ARRIVAL',true);
  else put(ballCm,82.8,34+nearSign*5.5,idx===1?'EDGE_SHOT':'SECOND_BALL',false);
  return map;
}

function attackTask(m,p,ctx){
  const pr=ctx.pr,by=ctx.ball.y,progress=ctx.progress,bl=ctx.ballLane,owner=ctx.owner,phase=ctx.phase;
  const local=worldToLocal(p.team,p.x,p.y),baseY=lane(p.slot),wideY=34+(baseY-34)*pr.width,boxWave=!!ctx.boxWave;
  if(p.role==='GK')return{lx:clamp(5.5+progress*0.035,5.2,9.2),ly:lerp(34,by,0.08),task:'GK_BUILD_SUPPORT',sprint:false};
  if((p.postShotHoldUntil||0)>m.time){
    return{lx:clamp(local.x+0.75,4,98),ly:local.y,task:'POST_SHOT_FOLLOW',sprint:false};
  }else if((p.postShotHoldUntil||0)>0){p.postShotHoldUntil=0;p.faceTargetAngle=null;}
  // STEP76: after releasing a genuinely progressive pass, the passer keeps a short
  // complementary run instead of being immediately re-solved toward the ball/receiver lane.
  // This is an off-ball relationship intent; a real loose-ball chase may still override it later.
  if((p.postPassContinueUntil||0)>m.time&&(!owner||p.id!==owner.id)&&Number.isFinite(p.postPassLocalX)&&Number.isFinite(p.postPassLocalY)){
    const lx=safeForwardLocal(m,p,p.postPassLocalX),ly=clamp(p.postPassLocalY,4,64);
    return{lx,ly,task:'POST_PASS_CONTINUE_RUN',sprint:true};
  }else if((p.postPassContinueUntil||0)>0&&m.time>=p.postPassContinueUntil){p.postPassContinueUntil=0;p.postPassLocalX=null;p.postPassLocalY=null;}
  if((p.postPassSupportUntil||0)>m.time&&(!owner||p.id!==owner.id)&&Number.isFinite(p.postPassSupportLocalX)&&Number.isFinite(p.postPassSupportLocalY)){
    return{lx:clamp(p.postPassSupportLocalX,4,96),ly:clamp(p.postPassSupportLocalY,4,64),task:p.postPassSupportTask||'POST_SAFE_PASS_SUPPORT',sprint:false};
  }else if((p.postPassSupportUntil||0)>0&&m.time>=p.postPassSupportUntil){p.postPassSupportUntil=0;p.postPassSupportLocalX=null;p.postPassSupportLocalY=null;p.postPassSupportTask=null;}
  if(owner&&p.id===owner.id){
    // TT-0.51 1_1/1_6: while a one-option protagonist state is being deferred, team shape may
    // continue to change around the carrier but the engine must not invent an unchosen carry.
    // Holding this exact live location lets pressure/new lanes create the next meaningful choice.
    if(m.protagonistDeferredChoice?.playerId===p.id)return{lx:local.x,ly:local.y,task:'WAIT_MEANINGFUL_CHOICE',sprint:false};
    if((p.lockTargetUntil||0)>m.time){const q=worldToLocal(p.team,p.tx,p.ty);return{lx:q.x,ly:q.y,task:p.action||'CARRY',sprint:p.sprint};}
    const space=forwardSpace(m,p,10),opp=nearestOppDistance(m,p),step=space>5?2.15:space>3?1.15:space>1.8?0.45:0;
    // A winger who receives in the outer half-space before entering the box may carry back toward
    // a true delivery lane. This is not forced once he is actually in the penalty area, where a
    // shooting/combination decision should remain available.
    if(p.role==='WF'&&phase==='CHANCE'&&local.x<88.5&&local.y>13.84&&local.y<54.16){
      const sg=sideSign(p.slot),wideY=34+sg*25.5,dy=clamp(wideY-local.y,-3.2,3.2);
      return{lx:clamp(local.x+Math.min(step,1.7),4,93),ly:clamp(local.y+dy,4,64),task:'WIDE_CARRY_SCAN',sprint:false};
    }
    // The owner keeps moving while reading the game; full stops are reserved for genuine pressure or shielding.
    const lateral=opp<2.6?sideSign(p.slot||'')*0.32:0;
    return{lx:clamp(local.x+step,4,93),ly:clamp(local.y+lateral+(34-local.y)*0.006,4,64),task:step>0?'CARRY_SCAN':'PROTECT_SCAN',sprint:false};
  }
  const reserved=ctx.boxAssignments?.get(p.id);if(reserved&&!(ctx.strikerPinned&&owner&&owner.role==='ST'&&p.role==='WF'))return reserved;

  const back=attackingBaseLine(progress),mid=midfieldBase(progress),front=forwardBase(progress);
  if(p.role==='CB'){
    const side=sideSign(p.slot),push=phase==='FINAL_THIRD'||phase==='CHANCE'?4:phase==='PROGRESSION'?2:0;
    const coveringSurge=(ctx.fullbackSurgeSlot==='LB'&&p.slot==='LCB')||(ctx.fullbackSurgeSlot==='RB'&&p.slot==='RCB');
    const coverShift=coveringSurge&&ctx.fullbackSurge&&(phase==='FINAL_THIRD'||phase==='CHANCE');
    const lx=clamp(back+push-(coverShift?1.8:0),18,58),ly=clamp(34+side*(8.4+(coverShift?3.0:0))+(by-34)*0.06,15,53);
    return{lx,ly,task:phase==='BUILD_UP'?'BUILD_PLATFORM':coverShift?'REST_DEFENCE_WIDE_COVER':'REST_DEFENCE',sprint:false};
  }
  if(p.role==='FB'){
    const policy=p.slot==='LB'?pr.leftBack:pr.rightBack,ss=sameSide(p.slot,bl),sg=sideSign(p.slot),wingerInside=wingerIsPenetrating(m,p.team,p.slot),ws=pairedWingerSlot(p.slot),winger=teamPlayers(m,p.team).find(q=>q.slot===ws),wl=winger?worldToLocal(p.team,winger.x,winger.y):null,wingerWide=!!wl&&wl.x>62&&(wl.y<17||wl.y>51),episodicSurge=!!ctx.fullbackSurge&&ctx.fullbackSurgeSlot===p.slot&&ss;
    if(episodicSurge&&(phase==='PROGRESSION'||phase==='FINAL_THIRD'||phase==='CHANCE')){
      // Winger wide => a rare underlap is allowed, but it is a short, shallow box-entry rather
      // than the default full-back lane. Winger inside => the full-back attacks outside.
      // This keeps the real tactical option while preventing repeated forward-like box occupation.
      if(wingerWide&&!wingerInside){const x=Math.min(91.0,safeForwardLocal(m,p,Math.max(mid+6,progress+6.0))),y=34+sg*18.5;return{lx:x,ly:y,task:'FB_UNDERLAP_SURGE',sprint:true};}
      const x=safeForwardLocal(m,p,Math.max(front-2,progress+9.0)),y=34+sg*29.0;return{lx:x,ly:y,task:'FB_OVERLAP_SURGE',sprint:true};
    }
    if(policy==='INVERT'){
      const x=phase==='FINAL_THIRD'||phase==='CHANCE'?clamp(progress-15,47,68):clamp(mid-7+(ss?2:0),25,63),y=34+sg*7.2;
      return{lx:x,ly:y,task:ss?'INVERT_SUPPORT':'INVERT_REST',sprint:progress>40&&ss};
    }
    // Default overlap policy is relationship-based, not an automatic box run.
    // If the winger already owns the touchline, the full-back stays underneath/outside as a
    // recycle/cutback outlet. A true inside underlap is reserved for the episodic surge above.
    // If the winger comes inside, the full-back is free to overlap beyond on the touchline.
    if(policy==='OVERLAP'&&ss&&progress>33){
      if((phase==='FINAL_THIRD'||phase==='CHANCE')&&wingerWide&&!wingerInside){
        const live=liveSupportOffset(m,p,0.78,0.52),x=clamp(Math.min(progress-4.5,mid+7.0)+live.x,48,80.5),y=clamp(34+sg*27.5+live.y,4,64);
        return{lx:x,ly:y,task:'FULLBACK_RECYCLE_SUPPORT',sprint:Math.abs(local.x-x)>5.0};
      }
      const x=safeForwardLocal(m,p,Math.max(front-2,progress+(phase==='FINAL_THIRD'||phase==='CHANCE'?10:7))),y=34+sg*29.0;
      return{lx:x,ly:y,task:'OVERLAP',sprint:true};
    }
    if(ss&&(phase==='FINAL_THIRD'||phase==='CHANCE')&&progress>68){
      if(wingerInside){
        const x=safeForwardLocal(m,p,Math.max(mid+2,progress+5.0)),y=34+sg*28.5;
        return{lx:x,ly:y,task:'BALANCED_OVERLAP',sprint:true};
      }
      if(wingerWide){
        // BALANCED follows the same relationship rule: when the winger owns the touchline,
        // remain as an underneath/outside passing option. Inside underlaps are episodic only.
        const live=liveSupportOffset(m,p,0.68,0.46),x=clamp(Math.min(progress-7.0,mid+4.0)+live.x,44,76.0),y=clamp(34+sg*27.0+live.y,4,64);
        return{lx:x,ly:y,task:'FULLBACK_BALANCED_SUPPORT',sprint:Math.abs(local.x-x)>5.0};
      }
    }
    // When the winger vacates the touchline by attacking the box, the full-back inherits width
    // only as a short support step. This is intentionally modest so both full-backs do not become forwards.
    if(ss&&wingerInside&&(phase==='FINAL_THIRD'||phase==='CHANCE')){
      const x=clamp((phase==='CHANCE'?mid+1:mid-1)+(ss?3:0),34,66),y=34+sg*28.5;
      return{lx:x,ly:y,task:'FULLBACK_WIDE_SUPPORT',sprint:Math.abs(local.x-x)>4.0};
    }
    // Far-side full-back protects the counter rather than collapsing into the penalty area.
    const x=clamp((phase==='FINAL_THIRD'||phase==='CHANCE'?mid-4:mid-8)+(ss?3:-4),24,72),y=34+sg*27.0;
    return{lx:x,ly:y,task:ss?'OUTSIDE_SUPPORT':'REST_BALANCE',sprint:ss&&progress>50};
  }
  if(p.role==='CM'){
    const sg=sideSign(p.slot),ss=sameSide(p.slot,bl),surge=!!ctx.midfieldSurge,recover=!!ctx.midfieldRecover;
    if(ctx.strikerPinned&&owner&&owner.role==='ST'&&(phase==='FINAL_THIRD'||phase==='CHANCE')){
      const ol=worldToLocal(p.team,owner.x,owner.y);
      if(p.slot===ctx.stSupportSlot){
        const x=clamp(ol.x-5.2,72,87.0),y=clamp(lerp(ol.y,34+sg*5.2,0.52),14,54);
        return{lx:x,ly:y,task:'ST_WALL_SUPPORT',sprint:Math.abs(local.x-x)>2.8||Math.abs(local.y-y)>4.0};
      }
      if(p.slot==='CM'){
        const x=clamp(ol.x-18.0,58,76.5),y=clamp(lerp(34,by,0.12),18,50);
        return{lx:x,ly:y,task:'COUNTER_GUARD',sprint:Math.abs(local.x-x)>5.0};
      }
      const x=clamp(ol.x-11.5,64,80.5),y=clamp(34+sg*9.5,12,56);
      return{lx:x,ly:y,task:'SECOND_BALL_SUPPORT',sprint:Math.abs(local.x-x)>4.0||Math.abs(local.y-y)>4.5};
    }
    // The midfield triangle is elastic, not fixed. One 8 can attack the box or drift wide for a short wave,
    // the other connects underneath, and the pivot protects the structure. All three reconnect when the wave ends.
    if(p.slot==='CM'){
      let x;
      if(phase==='BUILD_UP')x=clamp(progress+5,28,44);
      else if(phase==='PROGRESSION')x=clamp(progress-8,40,56);
      else if(phase==='FINAL_THIRD')x=clamp(progress-16,47,60);
      else x=clamp(progress-22,49,60);
      // During deep build-up the pivot may drop close to the centre-backs instead of being trapped in a static midfield band.
      if(progress<22)x=clamp(progress+11,24,36);
      const surgeSide=ctx.fullbackSurge&&ctx.fullbackSurgeSlot==='LB'?-1:ctx.fullbackSurge&&ctx.fullbackSurgeSlot==='RB'?1:0;
      if(surgeSide&&(phase==='FINAL_THIRD'||phase==='CHANCE'))x=clamp(x-1.2,24,60);
      const y=clamp(lerp(34,by,phase==='BUILD_UP'?0.18:0.08)+surgeSide*2.2,18,50);
      return{lx:x,ly:y,task:progress<22?'DROP_BETWEEN_LINES':phase==='BUILD_UP'?'DROP_TO_BUILD':surgeSide?'PIVOT_WIDE_COVER':'PIVOT_SCREEN',sprint:Math.abs(local.x-x)>5.0};
    }
    if(pr.midfieldRunner===p.slot){
      if(phase==='BUILD_UP'){
        const x=clamp(progress+8,35,50);return{lx:x,ly:34+sg*11.5,task:'BUILD_SUPPORT_8',sprint:Math.abs(local.x-x)>4};
      }
      if(phase==='PROGRESSION'){
        const ws=sameSideWingerState(m,p.team,p.slot),wideSupport=ss&&Math.abs(by-34)>13&&!ws?.wide;
        const x=safeForwardLocal(m,p,clamp(progress+(wideSupport?3:5),49,68));
        // If the winger already owns the touchline, the 8 occupies the half-space instead of
        // running parallel on the same rail. The wide lane becomes available only after the winger comes inside.
        const y=wideSupport?34+sg*18.5:34+sg*(ws?.wide?9.0:9.5);
        return{lx:x,ly:y,task:wideSupport?'WIDE_SUPPORT_8':ws?.wide?'HALFSPACE_SUPPORT_8':'ADVANCING_8',sprint:Math.abs(local.x-x)>3.5||Math.abs(local.y-y)>5};
      }
      if(phase==='FINAL_THIRD'){
        const ws=sameSideWingerState(m,p.team,p.slot);
        if(surge){
          const x=safeForwardLocal(m,p,clamp(progress+7,76,87.5));
          const y=ss?34+sg*7.0:34+sg*11.0;
          return{lx:x,ly:y,task:'LATE_BOX_ARRIVAL',sprint:true};
        }
        const live=ws?.wide?liveSupportOffset(m,p,0.58,0.42):{x:0,y:0},x=clamp(progress-6+live.x,64,76),y=clamp(34+sg*(ws?.wide?8.5:10.0)+live.y,4,64);return{lx:x,ly:y,task:recover?'RECOVER_MIDFIELD_8':ws?.wide?'HALFSPACE_SECOND_WAVE':'SECOND_WAVE_8',sprint:Math.abs(local.x-x)>3.5||Math.abs(local.y-y)>4.5};
      }
      if(boxWave&&(surge||!recover)){
        const x=safeForwardLocal(m,p,clamp(progress+3,84,90.5));
        const y=34+sg*(ss?6.5:10.0);
        return{lx:x,ly:y,task:'LATE_BOX_ARRIVAL',sprint:true};
      }
      const live=liveSupportOffset(m,p,0.54,0.40),x=clamp(progress-10+live.x,70,80),y=clamp(34+sg*9.5+live.y,4,64);return{lx:x,ly:y,task:recover?'RECOVER_MIDFIELD_8':'BOX_EDGE_SUPPORT',sprint:Math.abs(local.x-x)>3.2};
    }
    // The second 8 can support wide, arrive at the edge, or reconnect. It does not permanently become a fifth forward.
    if(phase==='BUILD_UP'){
      const x=clamp(progress+5,34,49);return{lx:x,ly:34+sg*11.5+(by-34)*0.06,task:'BUILD_CONNECTOR',sprint:Math.abs(local.x-x)>4.5};
    }
    if(phase==='PROGRESSION'){
      const ws=sameSideWingerState(m,p.team,p.slot),wideSupport=ss&&Math.abs(by-34)>16&&!ws?.wide;
      const x=clamp(progress+(wideSupport?1:-2),45,62),y=wideSupport?34+sg*18:34+sg*(ws?.wide?9.5:11)+(by-34)*(ss?0.08:0.05);
      return{lx:x,ly:y,task:wideSupport?'WIDE_SUPPORT_8':ws?.wide?'HALFSPACE_CONNECTOR_8':ss?'BALL_SIDE_8':'FAR_8_SUPPORT',sprint:Math.abs(local.x-x)>4.5||Math.abs(local.y-y)>5};
    }
    if(phase==='FINAL_THIRD'){
      const ws=sameSideWingerState(m,p.team,p.slot),live=ws?.wide?liveSupportOffset(m,p,0.52,0.38):{x:0,y:0},x=clamp(progress-7+live.x,62,74),y=clamp(34+sg*(ws?.wide?8.8:10.5)+live.y,4,64);return{lx:x,ly:y,task:recover?'RECONNECT_8':ws?.wide?'HALFSPACE_SECOND_LINE':'SECOND_LINE_SUPPORT',sprint:Math.abs(local.x-x)>4.0||Math.abs(local.y-y)>4.5};
    }
    const live=liveSupportOffset(m,p,0.48,0.36),x=clamp(progress-11+live.x,68,78),y=clamp(34+sg*9.0+live.y,4,64);return{lx:x,ly:y,task:recover?'RECONNECT_8':'CUTBACK_EDGE',sprint:Math.abs(local.x-x)>3.8};
  }
  if(p.role==='WF'){
    const sg=sideSign(p.slot),ss=sameSide(p.slot,bl),targetWide=34+sg*(31.0+(pr.wingerWidth-1.0)*8.0);
    if(ctx.strikerPinned&&owner&&owner.role==='ST'&&(phase==='FINAL_THIRD'||phase==='CHANCE')){
      const ol=worldToLocal(p.team,owner.x,owner.y),wideProfile=(pr.width>=1.0)||(pr.wingerWidth>=0.98),outletSlot=ctx.wideOutletSlot||((bl==='LEFT')?'RW':(bl==='RIGHT'?'LW':(pr.midfieldRunner==='RCM'?'LW':'RW')));
      // Tactics decide whether the winger attacks the box or preserves width. Wide profiles
      // keep one genuine delivery outlet while the opposite forward attacks the space opened
      // by the defenders collapsing on the striker. Narrow/direct profiles may send both in.
      if(wideProfile&&p.slot===outletSlot){
        const wantedX=clamp(ol.x+3.5,82.0,91.5),wantedY=34+sg*30.5;
        return{lx:releaseForwardLocal(m,p,wantedX),ly:wantedY,task:'WIDE_RELEASE_OUTLET',sprint:Math.abs(local.x-wantedX)>2.5||Math.abs(local.y-wantedY)>4.0};
      }
      const wantedX=clamp(ol.x+7.2,84.5,94.5),wantedY=34+sg*14.0;
      return{lx:releaseForwardLocal(m,p,wantedX),ly:wantedY,task:'ST_RELEASE_RUN',sprint:true};
    }
    // Once the ball reaches the final third, the front three occupy different box lanes instead of all waiting outside.
    if(phase==='CHANCE'&&boxWave){
      if(!ss){
        const x=safeForwardLocal(m,p,clamp(progress+7,89.5,94.0)),y=34+sg*10.5;
        return{lx:x,ly:y,task:'ATTACK_BACK_POST',sprint:true};
      }
      if(owner&&owner.id!==p.id&&owner.role!=='WF'){
        // Central possession: the ball-side winger is primarily a delivery outlet, not a third box runner.
        // The far winger already attacks the back post, so keeping this player wide creates a real cross source.
        const x=safeForwardLocal(m,p,clamp(progress+2.5,86.5,92.0)),y=34+sg*30.0;
        return{lx:x,ly:y,task:'WIDE_DELIVERY_HOLD',sprint:Math.abs(local.y-y)>4.0||Math.abs(local.x-x)>4.0};
      }
      // Ball-side winger stays available for the dribble/cross if he is involved in the move.
      return{lx:safeForwardLocal(m,p,Math.max(front+1,progress+2)),ly:targetWide,task:ss?'WIDE_COMBINE':'HOLD_WIDTH',sprint:ss};
    }
    if(phase==='CHANCE'&&!boxWave){
      const outlet=ctx.wideOutletSlot? p.slot===ctx.wideOutletSlot : ss;
      if(!outlet){
        const x=safeForwardLocal(m,p,clamp(progress+5.5,89.0,92.5)),y=34+sg*16.0;
        return{lx:x,ly:y,task:'ATTACK_FAR_CHANNEL',sprint:true};
      }
      const x=safeForwardLocal(m,p,clamp(progress+2.5,86.0,91.5)),y=34+sg*30.0;
      return{lx:x,ly:y,task:'WIDE_DELIVERY_HOLD',sprint:Math.abs(local.y-y)>4.0||Math.abs(local.x-x)>4.0};
    }
    if(phase==='FINAL_THIRD'&&!ss){
      const wanted=clamp(progress+8,82,91.5),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*16.0,runAlive=x>local.x+.85,over=local.x-safeX,marginalShoulder=over>.18&&over<=1.55,recover=over>1.55;
      return{lx:runAlive?x:recover?safeX:marginalShoulder?Math.min(local.x,safeX+1.35):Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':marginalShoulder?'FAR_SIDE_SHOULDER':'FAR_SIDE_HOLD',sprint:runAlive||recover};
    }
    if(!ss&&progress>48){const wanted=Math.max(front+5,progress+8),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*(18.5*pr.wingerWidth),runAlive=x>local.x+.85,over=local.x-safeX,marginalShoulder=over>.18&&over<=1.55,recover=over>1.55;return{lx:runAlive?x:recover?safeX:marginalShoulder?Math.min(local.x,safeX+1.35):Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':marginalShoulder?'FAR_SIDE_SHOULDER':'FAR_SIDE_HOLD',sprint:runAlive||recover};}
    if(ss&&progress>66&&pr.width<1){return{lx:safeForwardLocal(m,p,Math.max(front+2,progress+4)),ly:34+sg*17.0,task:'INSIDE_CHANNEL',sprint:true};}
    return{lx:safeForwardLocal(m,p,Math.max(front,progress+4)),ly:targetWide,task:ss?'WIDE_COMBINE':'HOLD_WIDTH',sprint:ss&&progress>52};
  }
  if(p.role==='ST'){
    if(progress<38)return{lx:safeForwardLocal(m,p,Math.max(front,progress+9)),ly:lerp(34,by,0.05),task:'CONNECT_CENTRE',sprint:false};
    // STEP76: if the central lane is genuinely open, attack it persistently. The old generic
    // PIN/cross-role redraw could make an unmarked striker dither while a large lane stayed empty.
    const centralRunNow=progress>=48&&progress<=88&&Math.abs(local.y-34)<=13&&forwardSpace(m,p,12)>=5.2&&nearestOppDistance(m,p)>1.55;
    if(centralRunNow){p.openChannelUntil=Math.max(p.openChannelUntil||0,m.time+1.65);p.openChannelY=clamp(lerp(local.y,34,.42),27.5,40.5);}
    if((p.openChannelUntil||0)>m.time){const x=safeForwardLocal(m,p,clamp(Math.max(local.x+7.2,progress+9.5),front+2,95.0)),y=Number.isFinite(p.openChannelY)?p.openChannelY:34;return{lx:x,ly:y,task:'ATTACK_OPEN_CHANNEL',sprint:true};}
    const wideSupply=owner&&['WF','FB'].includes(owner.role)&&progress>=72&&Math.abs(by-34)>=13;
    if(wideSupply){
      const top=by<34,sideKey=top?'TOP':'BOTTOM';
      // Keep one cross-attack choice for a real movement beat instead of rerolling it every
      // 0.5s. This also stabilizes body angle / the visible view cone.
      if((p.crossAttackUntil||0)<=m.time||p.crossAttackSide!==sideKey){p.crossAttackSide=sideKey;p.crossAttackVariant=hash32(`${m.seed}|ST_CROSS_ATTACK|${Math.floor(m.time/3)}|${p.id}|${sideKey}`)%3;p.crossAttackUntil=m.time+2.8;}
      const variant=p.crossAttackVariant??0,nearY=top?30.0:38.0,farY=top?38.0:30.0,x=safeForwardLocal(m,p,clamp(progress+7.0,90.0,95.0));
      if(variant===0)return{lx:x,ly:nearY,task:'ATTACK_NEAR_POST',sprint:true};if(variant===1)return{lx:x,ly:farY,task:'ATTACK_BACK_POST',sprint:true};return{lx:x,ly:top?35.8:32.2,task:'PULL_OFF_FOR_CROSS',sprint:true};
    }
    if(phase==='CHANCE'&&boxWave){
      const nearY=by<34?30.0:38.0,x=safeForwardLocal(m,p,clamp(progress+5,90,94.5));
      return{lx:x,ly:nearY,task:'ATTACK_NEAR_POST',sprint:true};
    }
    if(phase==='CHANCE'&&!boxWave){
      const x=safeForwardLocal(m,p,clamp(progress+4.5,89.2,92.8));
      return{lx:x,ly:34+(by<34?3.5:-3.5),task:'ATTACK_CENTRAL_CHANNEL',sprint:true};
    }
    const y=34+(by<34?4.0:-4.0);
    return{lx:safeForwardLocal(m,p,Math.max(front+3,progress+7)),ly:y,task:progress>60?'PIN_AND_RUN':'PIN_CENTRE_BACKS',sprint:progress>60};
  }
  return{lx:local.x,ly:local.y,task:'HOLD',sprint:false};
}

function defendingBlockAnchors(pr,ballX,ballY,slot,role){
  const line=clamp(15+pr.lineHeight*10+ballX*0.16,18,39);
  const midGap=ballX<36?12.5:ballX<58?15.0:17.5,mid=line+midGap,front=mid+15;
  const sg=sideSign(slot),latShift=(ballY-34)*(0.20+pr.compactness*0.18),compactScale=1-(pr.compactness-0.5)*0.36;
  let x,y;
  if(role==='CB'){x=line;y=34+sg*8.0*compactScale+latShift*0.38;}
  else if(role==='FB'){x=line+1.5;y=34+sg*25.5*compactScale+latShift*0.48;}
  else if(role==='CM'){x=mid;y=34+sg*11.0*compactScale+latShift*0.78;}
  else if(role==='WF'){x=front;y=34+sg*22.0*compactScale+latShift*0.80;}
  else if(role==='ST'){x=front+2;y=34+latShift*0.50;}
  else{x=6;y=34+latShift*0.25;}
  return{x:clamp(x,4,84),y:clamp(y,5,63)};
}

function dangerBlockAnchor(pr,ball,slot,role){
  // HARNESS V0.1: when the opponent reaches the penalty-area corridor, the back four
  // retreat goal-side together instead of leaving only the nearest presser with the carrier.
  // Local x=0 is the defending goal, so a SMALLER x is goal-side.
  if(ball.x>=25)return null;
  const sg=sideSign(slot),centrality=1-clamp(Math.abs(ball.y-34)/24,0,1);
  const line=clamp(ball.x-(ball.x<16.5?3.4:4.2),6.2,15.8);
  if(role==='CB'){
    const y=34+sg*(6.3+2.1*(1-centrality))+(ball.y-34)*0.16;
    return{x:line,y:clamp(y,21,47),task:'BOX_RECOVERY_LINE'};
  }
  if(role==='FB'){
    const ballSide=(ball.y<34&&sg<0)||(ball.y>=34&&sg>0);
    const width=ballSide?(13.5+4.0*(1-centrality)):(15.2+2.0*(1-centrality));
    const y=34+sg*width+(ball.y-34)*(ballSide?0.24:0.10);
    return{x:clamp(line+1.1,7.0,16.5),y:clamp(y,12,56),task:ballSide?'BOX_SIDE_RECOVERY':'FAR_POST_TUCK'};
  }
  return null;
}

function captureTransitionWideVacancies(m,lostTeam){
  if(!lostTeam)return;
  if(!m._transitionWideVacancies)m._transitionWideVacancies={};
  const pr=profile(m,lostTeam),state=m._transitionWideVacancies[lostTeam]||(m._transitionWideVacancies[lostTeam]={});
  for(const slot of ['LB','RB']){
    const policy=slot==='LB'?pr.leftBack:pr.rightBack;if(policy!=='INVERT')continue;
    const fb=teamPlayers(m,lostTeam).find(p=>p.slot===slot&&p.role==='FB');if(!fb)continue;
    const l=worldToLocal(lostTeam,fb.x,fb.y),laneY=lane(slot),lateralGap=Math.abs(l.y-laneY);
    // Only create the hand-off when the inverted full-back really is away from his
    // normal flank.  A normal turnover with the FB already home needs no special case.
    if(lateralGap<7.5)continue;
    state[slot]={fbId:fb.id,slot,createdAt:m.time,until:m.time+4.6,laneY};
  }
}
function activeTransitionWideVacancy(m,team,slot){
  const v=m._transitionWideVacancies?.[team]?.[slot];if(!v||m.time>=(v.until||0))return null;
  const fb=playerById(m,v.fbId);if(!fb)return null;
  const l=worldToLocal(team,fb.x,fb.y),base=defendingBlockAnchors(profile(m,team),worldToLocal(team,m.ball.x,m.ball.y).x,worldToLocal(team,m.ball.x,m.ball.y).y,slot,'FB');
  const lateralGap=Math.abs(l.y-(v.laneY??lane(slot))),shapeGap=Math.hypot(l.x-base.x,l.y-base.y);
  if(lateralGap<=4.8&&shapeGap<=7.5){delete m._transitionWideVacancies[team][slot];return null;}
  return v;
}
function sameSideWideThreat(m,defTeam,slot){
  const side=sideSign(slot),opp=outfield(m,other(defTeam));
  const preferredSlot=slot==='LB'?'RW':'LW';
  let q=opp.find(a=>a.slot===preferredSlot&&a.role==='WF');
  if(!q){q=opp.map(a=>({a,l:worldToLocal(defTeam,a.x,a.y)})).filter(o=>o.a.role==='WF'&&sideSign(o.a.slot)===side).sort((a,b)=>b.l.x-a.l.x)[0]?.a||null;}
  return q;
}

function buildDeepMarkAssignments(m,team,press,cover,owner,ball){
  // V0.3: defenders beyond the first presser/cover player must still defend people,
  // not all collapse onto the ball.  Pair nearby dangerous runners to goal-side
  // markers while retaining the base block as a soft structural reference.
  // STEP40 V0.5.1: the old hard ball.x>=31 cutoff let same-side wide runners enter
  // dangerous half-spaces while the FB simply held the touchline. Between 31-38 only
  // the FB->same-side WF hand-off is active; full deep marking still starts below 31.
  if(ball.x>=52)return new Map();
  const fullDeep=ball.x<31;
  if(!m._markLocks)m._markLocks={};
  const state=m._markLocks[team]||(m._markLocks[team]={until:0,pairs:{}});
  const defenders=outfield(m,team).filter(p=>p.id!==press?.id&&p.id!==cover?.id&&['CB','FB','CM'].includes(p.role));
  const allAttackers=outfield(m,other(team)).filter(a=>a.id!==owner?.id).map(a=>({a,l:worldToLocal(team,a.x,a.y)})).filter(o=>o.l.x<=44&&o.l.y>=7&&o.l.y<=61).sort((u,v)=>u.l.x-v.l.x);
  const attackers=allAttackers.filter(o=>o.l.x<=36.5);
  const eligibleIds=new Set(attackers.map(o=>o.a.id)),defIds=new Set(defenders.map(d=>d.id));
  const pairs={};const usedA=new Set(),usedD=new Set();
  // V0.5: in a settled/deep block, a full-back owns the dangerous winger on his own
  // flank before the generic greedy matcher is allowed to spend him on a midfielder.
  // This prevents LB->CM / LCM->RW role inversion seen in the user's 0.24_5 scene.
  // V0.5.1 pre-box extension is deliberately narrower: it only activates while a
  // central ST carries the ball and the winger has already penetrated to <=31.5 local X.
  // This fixes the reported channel run without globally changing ordinary final-third shape.
  for(const slot of ['LB','RB']){
    const fb=defenders.find(d=>d.role==='FB'&&d.slot===slot);if(!fb||activeTransitionWideVacancy(m,team,slot))continue;
    const side=sideSign(slot);
    const wf=attackers.find(o=>o.a.role==='WF'&&(o.l.y<34?-1:1)===side&&!usedA.has(o.a.id)&&(fullDeep||(owner?.role==='ST'&&o.l.x<=36.0)));
    if(wf&&dist(fb,wf.a)<=15.5){pairs[fb.id]=wf.a.id;usedD.add(fb.id);usedA.add(wf.a.id);}
  }
  // TT-0.48 zone/man hybrid: before the box is reached, one centre-back keeps a loose
  // goal-side shoulder reference on a central ST between the lines. The partner CB stays in
  // the back-line/cover zone. This prevents the repeated untouched 'walk between two CBs'
  // route without converting both centre-backs into sticky man-markers.
  if(!fullDeep){
    const st=allAttackers.find(o=>o.a.role==='ST'&&Math.abs(o.l.y-34)<=12.5&&o.l.x<=43);
    if(st&&!usedA.has(st.a.id)){
      const cb=defenders.filter(d=>d.role==='CB'&&!usedD.has(d.id)).map(d=>({d,dl:worldToLocal(team,d.x,d.y),dd:dist(d,st.a)})).sort((a,b)=>a.dd-b.dd)[0];
      if(cb&&cb.dd<=15.5){pairs[cb.d.id]=st.a.id;usedD.add(cb.d.id);usedA.add(st.a.id);}
    }
    state.pairs=pairs;state.until=m.time+0.80;return new Map(Object.entries(pairs));
  }
  // Preserve valid previous assignments for about a second so markers do not switch every frame.
  function compatible(d,a,al){
    if(!d||!a||!al)return false;
    const aside=al.y<34?-1:1,dside=sideSign(d.slot);
    // Full-backs own their flank first. They may tuck, but should not abandon it to chase
    // a central striker or the opposite winger while a normal back four still exists.
    if(d.role==='FB'&&a.role==='ST')return false;
    if(d.role==='FB'&&a.role==='WF'&&dside&&dside!==aside)return false;
    // In a deep block, midfielders protect the cutback/second-ball layer rather than
    // replacing a centre-back on a central striker.
    if(d.role==='CM'&&a.role==='ST'&&ball.x<44&&Math.abs(al.y-34)<15)return false;
    if(d.role==='CM'&&a.role==='WF'&&ball.x<36&&Math.abs(al.y-34)>14){
      const fbSlot=al.y<34?'LB':'RB';
      // A settled midfield line screens the cutback/second ball. It only inherits a wide
      // runner when the same-side full-back is genuinely absent in transition.
      if(!activeTransitionWideVacancy(m,team,fbSlot))return false;
    }
    return true;
  }
  for(const [did,aid] of Object.entries(state.pairs||{})){
    if(!defIds.has(did)||!eligibleIds.has(aid)||usedD.has(did)||usedA.has(aid))continue;
    const d=playerById(m,did),a=playerById(m,aid),al=a?worldToLocal(team,a.x,a.y):null;if(!d||!a||dist(d,a)>13.5||!compatible(d,a,al))continue;
    pairs[did]=aid;usedD.add(did);usedA.add(aid);
  }
  // Greedy nearest-role pairing for remaining threats. Central backs prefer ST/WF central runs;
  // midfielders naturally pick up late CM/WF arrivals when nearer.
  for(const {a} of attackers){
    if(usedA.has(a.id))continue;
    let best=null,bestScore=1e9;
    for(const d of defenders){if(usedD.has(d.id))continue;const dl=worldToLocal(team,d.x,d.y),al=worldToLocal(team,a.x,a.y);if(!compatible(d,a,al))continue;
      let score=dist(d,a)+Math.abs(dl.y-al.y)*0.16;
      if(d.role==='CM'&&a.role==='CM')score-=1.8;
      if(d.role==='CB'&&a.role==='ST')score-=2.0;
      if(d.role==='FB'&&a.role==='WF')score-=1.5;
      // Do not drag a CB all the way into a wide lane when the full-back on that side
      // is available. The CB may cover the half-space, but the flank remains FB-owned.
      if(d.role==='CB'&&a.role==='WF'&&Math.abs(al.y-34)>14)score+=3.4;
      if(d.role==='CM'&&a.role==='WF'&&Math.abs(al.y-34)>15)score+=1.4;
      if(score<bestScore){bestScore=score;best=d;}}
    if(best&&bestScore<15.0){pairs[best.id]=a.id;usedD.add(best.id);usedA.add(a.id);}
  }
  state.pairs=pairs;state.until=m.time+1.0;return new Map(Object.entries(pairs));
}

function preferredDefenceRoles(m,team,owner,ball,field,candidates){
  const nearest=candidates[0]?.p||null;
  if(!owner)return{press:nearest,cover:candidates.find(c=>c.p.id!==nearest?.id)?.p||null,mode:'GENERIC'};
  const centralThreat=owner.role==='ST'&&ball.x<38&&Math.abs(ball.y-34)<12.5;
  if(centralThreat){
    const ownerL=worldToLocal(team,owner.x,owner.y);
    const cbs=field.filter(p=>p.role==='CB').map(p=>{const l=worldToLocal(team,p.x,p.y);return{p,d:dist(p,owner),l,behind:l.x>ownerL.x+0.65,goalSide:l.x<=ownerL.x+0.65};}).sort((a,b)=>a.d-b.d);
    // STEP40 V0.5.1: when one centre-back is already beaten/behind a central ST, the
    // remaining goal-side CB is the LAST COVER and must not be spent as a second presser.
    // The beaten CB chases from behind while the goal-side partner protects the shot lane.
    const behindCb=cbs.filter(c=>c.behind).sort((a,b)=>a.d-b.d)[0];
    const goalSideCb=cbs.filter(c=>c.goalSide&&c.p.id!==behindCb?.p.id).sort((a,b)=>a.d-b.d)[0];
    if(behindCb&&goalSideCb&&goalSideCb.d<=10.5){
      return{press:behindCb.p,cover:goalSideCb.p,mode:'CENTRAL_ST_LAST_COVER'};
    }
    const cbPress=cbs[0]?.p,cbD=cbs[0]?.d??99;
    if(cbPress&&(cbD<=13.5||ball.x<23.5)){
      const otherCb=cbs.find(c=>c.p.id!==cbPress.id)?.p||null;
      const cover=otherCb||candidates.find(c=>c.p.id!==cbPress.id)?.p||null;
      return{press:cbPress,cover,mode:'CENTRAL_ST_CB'};
    }
  }
  const wideThreat=(owner.role==='WF'||Math.abs(ball.y-34)>14.5)&&ball.x<50;
  if(wideThreat){
    const side=ball.y<34?-1:1;
    const fbs=field.filter(p=>p.role==='FB'&&sideSign(p.slot)===side).map(p=>({p,d:dist(p,owner)})).sort((a,b)=>a.d-b.d);
    const fb=fbs[0]?.p,fbD=fbs[0]?.d??99;
    if(fb&&fbD<=15.5){
      const cbs=field.filter(p=>p.role==='CB').map(p=>({p,d:dist(p,owner)})).sort((a,b)=>a.d-b.d);
      return{press:fb,cover:cbs[0]?.p||candidates.find(c=>c.p.id!==fb.id)?.p||null,mode:'WIDE_FB'};
    }
    // STEP40 V0.3: when the full-back cannot arrive in time and a CB has to confront
    // the wide carrier, do not spend BOTH centre-backs on that same ball. Reserve the
    // spare CB for a central striker and use the nearest non-CB as secondary lane cover.
    const centralRunner=outfield(m,other(team)).map(a=>({a,l:worldToLocal(team,a.x,a.y)})).find(o=>o.a.id!==owner.id&&o.a.role==='ST'&&o.l.x<=34&&Math.abs(o.l.y-34)<13);
    if(centralRunner&&nearest?.role==='CB'){
      const nonCbCover=candidates.find(c=>c.p.id!==nearest.id&&c.p.role!=='CB'&&c.d<=14.5)?.p||null;
      if(nonCbCover)return{press:nearest,cover:nonCbCover,mode:'WIDE_CB_ST_GUARD'};
    }
  }
  // Generic phases are still role-aware. Distance is evidence, not authority: a wide
  // carrier belongs to the same-side full-back first, while a central carrier is normally
  // screened by midfield until he reaches the centre-back line. This prevents nearest-player
  // fallback from turning CM/FB/CB into one roaming ball pack.
  const genericWide=owner.role==='WF'||Math.abs(ball.y-34)>14.5,side=ball.y<34?-1:1;
  const ranked=candidates.filter(c=>{
    if(c.p.role==='ST'&&ball.x<45)return false;
    if(c.p.role==='WF'&&ball.x<34)return false;
    return true;
  }).map(c=>{
    const p=c.p,pside=sideSign(p.slot);let score=c.d;
    if(genericWide){
      if(p.role==='FB')score+=pside===side?-4.6:7.5;
      else if(p.role==='CM')score+=(ball.x<38?3.8:1.5)+(pside&&pside!==side?4.0:0);
      else if(p.role==='CB')score+=ball.x<28?2.0:4.5;
      else score+=5.5;
    }else{
      if(p.role==='CM')score+=ball.x<25?1.2:-2.0;
      else if(p.role==='CB')score+=ball.x<28?-2.2:1.8;
      else if(p.role==='FB')score+=3.0;
      else score+=3.8;
    }
    return{p,d:c.d,score};
  }).sort((a,b)=>a.score-b.score||a.d-b.d);
  const genericPress=ranked[0]?.p||nearest;
  let genericCover=null;
  if(genericPress){
    const cbCover=field.filter(p=>p.role==='CB'&&p.id!==genericPress.id).map(p=>({p,d:dist(p,owner)})).sort((a,b)=>a.d-b.d)[0]?.p||null;
    genericCover=(ball.x<42?cbCover:null)||ranked.find(c=>c.p.id!==genericPress.id)?.p||null;
  }
  return{press:genericPress,cover:genericCover,mode:genericWide?'GENERIC_WIDE_ROLE_AWARE':'GENERIC_ROLE_AWARE'};
}

// V18 GK reach V1: shot reaction is a continuous physical response, not a generic
// tactical-shape refresh. Keeping this helper separate lets the core refresh only the defending
// goalkeeper every physics tick without moving the other 21 players or changing shot odds.
function updateGoalkeeperShotReaction(m,p){
  if(!m||!p||p.role!=='GK'||m.ball.mode!=='FLIGHT'||m.ball.kind!=='SHOT'||p.team===m.ball.shotTeam)return false;
  const pl=worldToLocal(p.team,p.x,p.y),bls=worldToLocal(p.team,m.ball.x,m.ball.y);
  const vxL=p.team===HOME?(m.ball.vx||0):-(m.ball.vx||0),vyL=p.team===HOME?(m.ball.vy||0):-(m.ball.vy||0);
  const reaction=abilityVal(m,p,'reaction'),positioning=abilityVal(m,p,'gk_positioning');
  const delay=clamp(0.30-(reaction-60)*0.0032,0.16,0.36);
  let lx=clamp(pl.x+(4.2-pl.x)*0.08,2.8,7.5),ly=pl.y;
  if((m.ball.age||0)>=delay&&vxL<-0.15){
    const tt=clamp((pl.x-bls.x)/vxL,0,0.90),crossY=bls.y+vyL*tt;
    const read=clamp(0.78+(positioning-60)*0.0035,0.68,0.90);
    ly=clamp(lerp(pl.y,crossY,read),29.7,38.3);
  }
  applyTarget(p,lx,ly,'GK_SAVE_SET',true,m);
  p.faceTargetAngle=Math.atan2((m.ball.y||34)-p.y,(m.ball.x||52.5)-p.x);
  return true;
}

function assignDefence(m,team,ctx){
  const pr=profile(m,team),ps=teamPlayers(m,team),ball=worldToLocal(team,m.ball.x,m.ball.y),owner=ctx.owner;
  const field=ps.filter(p=>p.role!=='GK');
  const candidates=field.map(p=>({p,d:dist(p,{x:m.ball.x,y:m.ball.y})})).sort((a,b)=>a.d-b.d);
  const wideVacancies={LB:activeTransitionWideVacancy(m,team,'LB'),RB:activeTransitionWideVacancy(m,team,'RB')};
  // V0.2: keep press/cover ownership stable for a short window.  In V0.1 two
  // similarly placed defenders could swap first/second nearest every 0.05s,
  // causing their tactical targets to alternate and visibly shake.
  if(!m._defenceRoleLocks)m._defenceRoleLocks={};
  const lock=m._defenceRoleLocks[team]||(m._defenceRoleLocks[team]={pressId:null,coverId:null,until:0});
  const pref=preferredDefenceRoles(m,team,owner,ball,field,candidates),candPress=pref.press,candCover=pref.cover;
  // TT-0.46: once the full-back has actually arrived and owns the wide press, the temporary
  // midfielder hand-off is over. Keeping both roles alive was a direct cause of the recurring
  // LB + CM + LCM + CB swarm around a winger.
  if(pref.mode==='WIDE_FB'&&candPress?.role==='FB'&&owner&&dist(candPress,owner)<=8.5){
    const slot=candPress.slot;if(m._transitionWideVacancies?.[team]?.[slot])delete m._transitionWideVacancies[team][slot];
    if(slot&&Object.prototype.hasOwnProperty.call(wideVacancies,slot))wideVacancies[slot]=null;
  }
  let press=playerById(m,lock.pressId),cover=playerById(m,lock.coverId);
  const pressD=press?dist(press,m.ball):99,candD=candPress?dist(candPress,m.ball):99;
  const expired=m.time>=(lock.until||0),meaningfullyCloser=candPress&&press&&candPress.id!==press.id&&candD+0.70<pressD;
  const currentLost=pressD>18.5;
  // A central striker who has reached the back line is primarily a centre-back
  // responsibility. Do not let a midfielder abandon the central screen merely
  // because he is fractionally nearer to the ball.
  const centralMode=pref.mode==='CENTRAL_ST_CB'||pref.mode==='CENTRAL_ST_LAST_COVER';
  const lastCoverOverride=pref.mode==='CENTRAL_ST_LAST_COVER'&&candPress&&candCover&&(!press||!cover||press.id!==candPress.id||cover.id!==candCover.id);
  const structuralOverride=centralMode&&candPress&&press&&press.role!=='CB';
  const centralCoverOverride=centralMode&&candCover&&(!cover||cover.id!==candCover.id||cover.role!=='CB');
  const wideOverride=pref.mode==='WIDE_FB'&&candPress&&press&&press.role!=='FB'&&candD<=13.5;
  const wideGuardCoverOverride=pref.mode==='WIDE_CB_ST_GUARD'&&candCover&&(!cover||cover.id!==candCover.id||cover.role==='CB');
  // STEP40 V0.3: a central striker at the back line is a centre-back partnership problem,
  // not just a first-presser problem.  A stale role lock must never leave a midfielder as
  // the second defender while the spare CB follows a winger away from the centre.
  // Expiry merely allows ordinary switches; structural overrides restore line ownership now.
  if(!press||currentLost||lastCoverOverride||structuralOverride||wideOverride||(expired&&meaningfullyCloser)){
    press=candPress||press;
    cover=candCover&&candCover.id!==press?.id?candCover:(candidates.find(c=>c.p.id!==press?.id)?.p||null);
    lock.pressId=press?.id||null;lock.coverId=cover?.id||null;lock.until=m.time+0.80;
  }else if(centralCoverOverride||wideGuardCoverOverride){
    cover=candCover;lock.coverId=cover?.id||null;lock.until=Math.max(lock.until||0,m.time+0.80);
  }else if(!cover||cover.id===press.id){
    cover=candCover&&candCover.id!==press.id?candCover:(candidates.find(c=>c.p.id!==press.id)?.p||null);lock.coverId=cover?.id||null;
  }
  const marks=buildDeepMarkAssignments(m,team,press,cover,owner,ball);
  const ballSide=ball.y<34?'LEFT':'RIGHT';
  for(const p of ps){
    p.markTargetId=null;
    if(p.role==='GK'){
      let lx=clamp(5.4+ball.x*0.035,5,9.0),ly=lerp(34,ball.y,0.18),task='GK_SET',sprint=false;
      if(m.ball.mode==='LOOSE'&&ball.x<18&&Math.abs(ball.y-34)<23&&dist(p,m.ball)<11){lx=ball.x;ly=ball.y;task='GK_RUSH';sprint=true;}
      if(updateGoalkeeperShotReaction(m,p))continue;
      const ui=m.userGoalkeeperPositionIntent,uiActive=ui&&ui.playerId===p.id&&ui.team===p.team&&m.time<=(ui.until||0);
      if(uiActive&&task==='GK_SET'){
        // The user chooses the starting depth before the shot. Once a shot is in FLIGHT,
        // updateGoalkeeperShotReaction() above becomes fully authoritative again.
        // HF2: make the two user intents visibly different without changing save odds.
        // Roughly 1.45m is a real one-to-two-step angle close; HOLD stays near the base depth.
        if(ui.mode==='STEP_OUT')lx=clamp(lx+1.45,4.8,10.2);
        else if(ui.mode==='HOLD_DEPTH')lx=clamp(lx-.05,4.8,9.4);
        task=ui.mode==='STEP_OUT'?'GK_SET_STEP_OUT_INTENT':'GK_SET_HOLD_DEPTH_INTENT';
      }
      applyTarget(p,lx,ly,task,sprint,m);
      // A goalkeeper confronting an opponent must face the live ball before the shot as well
      // as during updateGoalkeeperShotReaction(). This is posture only; it never changes odds.
      p.faceTargetAngle=Math.atan2((m.ball.y||34)-p.y,(m.ball.x||52.5)-p.x);
      if(Math.hypot(p.vx||0,p.vy||0)<0.70)p.bodyAngle=p.faceTargetAngle;
      continue;
    }
    const dangerBase=dangerBlockAnchor(pr,ball,p.slot,p.role);
    const base=dangerBase||defendingBlockAnchors(pr,ball.x,ball.y,p.slot,p.role);let lx=base.x,ly=base.y,task=dangerBase?.task||'HOLD_BLOCK',sprint=!!dangerBase&&Math.abs(worldToLocal(team,p.x,p.y).x-lx)>2.5;
    const beatenTarget=(p.beatenRecoveryUntil||0)>m.time?playerById(m,p.beatenRecoveryTargetId):null;
    if(beatenTarget&&beatenTarget.team!==p.team){
      const al=worldToLocal(team,beatenTarget.x,beatenTarget.y),dl=worldToLocal(team,p.x,p.y);
      lx=clamp(al.x+1.35,3,96);ly=clamp(lerp(dl.y,al.y,0.86),4,64);task='RECOVERY_CHASE';sprint=true;
    }else if((p.pressRecoverUntil||0)>m.time){
      task='RECOVER_SHAPE';
    }else if(p.role==='FB'&&wideVacancies[p.slot]&&p.id===wideVacancies[p.slot].fbId&&!(press&&p.id===press.id&&owner&&dist(p,owner)<8.5)){
      // An inverted full-back who has just lost possession must visibly sprint back
      // toward the vacated flank.  The temporary hand-off below protects the channel
      // until he is close enough to resume normal FB responsibility.
      const rb=defendingBlockAnchors(pr,ball.x,ball.y,p.slot,p.role);
      lx=rb.x;ly=rb.y;task='TRANSITION_FB_RECOVERY';sprint=true;
    }else if(p.role==='CM'&&((p.slot==='LCM'&&wideVacancies.LB)||(p.slot==='RCM'&&wideVacancies.RB))){
      const v=p.slot==='LCM'?wideVacancies.LB:wideVacancies.RB,slot=p.slot==='LCM'?'LB':'RB',wf=sameSideWideThreat(m,team,slot),wl=wf?worldToLocal(team,wf.x,wf.y):null;
      if(wf&&wl){
        // Temporary rest-defence hand-off: the same-side 8 protects the open channel
        // without dropping onto the CB line.  As soon as the FB recovers this branch
        // disappears and the 8 returns to the midfield layer.
        const sg=sideSign(slot);lx=clamp(wl.x-2.2,18,48);ly=clamp(lerp(34+sg*17.5,wl.y,0.62),6,62);task='TRANSITION_WIDE_COVER';p.markTargetId=wf.id;sprint=true;
      }else{task='RECOVER_SHAPE';sprint=true;}
    }else if(press&&p.id===press.id&&owner&&dist(p,owner)<(ball.x<35?24:18)){
      // TT-0.47 minimum pressure line: when the ball reaches the defending final third,
      // the designated first defender must start recovering toward a real contain point
      // before the carrier is already completely unmarked.  This only expands the physical
      // activation radius (18m -> 24m in danger); it does not teleport the defender, so a
      // genuine transition breakaway can still remain a true 1v1 if the line has been beaten.
      // If this CB is the already-beaten member of a last-cover pair, chase from behind.
      // Do not ask him to teleport to the goal-side contain point and, more importantly,
      // do not free the partner CB from the dedicated cover branch below.
      if(pref.mode==='CENTRAL_ST_LAST_COVER'){
        const ol=worldToLocal(team,owner.x,owner.y),pl=worldToLocal(team,p.x,p.y);
        lx=clamp(ol.x+0.65,3,96);ly=clamp(lerp(pl.y,ol.y,0.82),4,64);task='RECOVERY_CHASE';sprint=true;
      }else{
      const held=Math.max(0,m.time-(owner.controlledSince||m.time)),carry=['CARRY_SCAN','CARRY_FORWARD','DRIBBLE_EVADE'].includes(owner.action),danger=ball.x<34,dpo=dist(p,owner);
      const pressStep=pr.press>0.68?0.35:0,pairCooling=(p.duelPairCooldownUntil||0)>m.time&&p.duelPairCooldownOwnerId===owner.id,cooling=(p.duelContainUntil||0)>m.time||pairCooling;
      const wantsCommit=!cooling&&((carry&&dpo<3.0+pressStep)||(danger&&held>0.9&&dpo<2.85+pressStep)||(held>2.35&&dpo<2.05+pressStep));
      if(wantsCommit)p.pressCommitUntil=Math.max(p.pressCommitUntil||0,m.time+1.25);
      if(cooling)p.pressCommitUntil=0;
      const commit=!cooling&&(p.pressCommitUntil||0)>m.time;
      const gap=commit?1.02:pairCooling?2.45:cooling?1.32:1.90;
      const relY=worldToLocal(team,p.x,p.y).y-ball.y,containSide=Math.abs(relY)>0.25?Math.sign(relY):sideSign(p.slot)||1;
      lx=clamp(ball.x-gap,3,96);ly=ball.y+containSide*(commit?0.38:0.62)+(34-ball.y)*0.015;task=commit?'ENGAGE':'PRESS_CONTAIN';sprint=dist(p,owner)>3.2;
      }
    }else if(cover&&p.id===cover.id&&dist(p,m.ball)<20){
      // V0.4: the second defender is not a second ball-chaser.  He protects the
      // carrier-to-goal shooting corridor from a goal-side position.
      const ownerL=owner?worldToLocal(team,owner.x,owner.y):ball;
      const gx=0,gy=34,dx=gx-ownerL.x,dy=gy-ownerL.y,dg=Math.max(0.001,Math.hypot(dx,dy));
      const screenX=ownerL.x+dx/dg*3.25,screenY=ownerL.y+dy/dg*3.25;
      lx=lerp(base.x,screenX,ball.x<23?0.92:0.82);ly=lerp(base.y,screenY,ball.x<23?0.92:0.82);task='SHOT_LANE_COVER';
      sprint=Math.abs(worldToLocal(team,p.x,p.y).x-lx)>2.6||dist(p,{x:m.ball.x,y:m.ball.y})>6.5;
    }else if(marks.has(p.id)){
      const aid=marks.get(p.id),a=playerById(m,aid),al=a?worldToLocal(team,a.x,a.y):null;
      if(a&&al){
        // V0.4 lane-oriented marking: stay close enough to the runner to remain
        // responsible for him, but stand on the dangerous corridor instead of
        // blindly following his exact path.  The target blends the pass lane from
        // ball->runner and the shot lane from runner->goal.
        const toBallX=ball.x-al.x,toBallY=ball.y-al.y,db=Math.max(0.001,Math.hypot(toBallX,toBallY));
        const toGoalX=-al.x,toGoalY=34-al.y,dg=Math.max(0.001,Math.hypot(toGoalX,toGoalY));
        const passGap=p.role==='CM'?1.65:1.45,shotGap=p.role==='CB'?1.60:1.35;
        const passX=al.x+toBallX/db*passGap,passY=al.y+toBallY/db*passGap;
        const shotX=al.x+toGoalX/dg*shotGap,shotY=al.y+toGoalY/dg*shotGap;
        const shotWeight=p.role==='CB'?0.64:p.role==='FB'?0.54:0.46;
        const screenX=lerp(passX,shotX,shotWeight),screenY=lerp(passY,shotY,shotWeight);
        // TT-0.48 zonal priority: marking is a reference inside the player's zone, not
        // an instruction to copy the attacker body-for-body. CBs may shoulder a central
        // striker more tightly; midfielders stay primarily in the cutback/second-ball layer.
        const deepWeight=p.role==='CB'?(ball.x>=31?0.58:(ball.x<23?0.84:0.76)):p.role==='FB'?(ball.x<23?0.76:0.68):(ball.x<23?0.62:0.54);
        lx=lerp(base.x,screenX,deepWeight);ly=lerp(base.y,screenY,deepWeight);
        // A marking midfielder still belongs to the recovery layer. Keep the screen
        // goal-side enough to protect cutbacks and second balls.
        if(p.role==='CM'&&ball.x<25){
          // Keep the midfield screen in front of the back four. The old one-sided cap
          // could still pull an 8 all the way onto the CB line and leave the opponent's
          // midfield/edge zone empty.
          lx=clamp(lx,ball.x+1.8,ball.x+5.2);
        }
        task='MARK_LANE_SCREEN';p.markTargetId=a.id;sprint=dist(p,a)>4.4||Math.abs(worldToLocal(team,p.x,p.y).x-lx)>2.6;
      }
    }else if(p.role==='CM'){
      // Midfield defends as a unit: ball-side 8 recovers toward the duel, pivot screens the centre, far-side 8 tucks in.
      const sg=sideSign(p.slot),ss=sameSide(p.slot,ballSide),deep=ball.x<48;
      const emergency=ball.x<28,boxEmergency=ball.x<25,transitioning=(m.transitionUntil||0)>m.time;
      if(boxEmergency){
        // Midfield recovery is layered behind the back four: ball-side 8 tracks the cutback lane,
        // pivot protects the central edge, far-side 8 tucks for second balls. They do not stay 8-12m upfield.
        if(p.slot==='CM'){
          lx=clamp(ball.x+1.6,12.0,24.0);ly=lerp(34,ball.y,0.18);task='BOX_EDGE_SCREEN';
        }else if(ss){
          lx=clamp(ball.x+2.4,12.5,25.5);ly=lerp(34+sg*7.0,ball.y,0.46);task='CUTBACK_TRACK';
        }else{
          lx=clamp(ball.x+3.8,14.0,27.0);ly=34+sg*6.0+(ball.y-34)*0.12;task='SECOND_BALL_TUCK';
        }
        sprint=Math.abs(worldToLocal(team,p.x,p.y).x-lx)>2.4||dist(p,{x:m.ball.x,y:m.ball.y})>7.5;
      }else if(p.slot==='CM'){
        lx=emergency?clamp(ball.x+7.0,20,34):deep?clamp(ball.x+9.0,23,43):clamp(base.x-1.5,31,52);
        ly=lerp(34,ball.y,emergency?0.28:deep?0.20:0.12);task=emergency?'DEEP_SCREEN':deep?'PIVOT_SCREEN_DEF':'MIDFIELD_BLOCK';sprint=(emergency||transitioning)&&Math.abs(worldToLocal(team,p.x,p.y).x-lx)>3.0;
      }else if(ss){
        lx=emergency?clamp(ball.x+4.5,18,34):deep?clamp(ball.x+7.0,22,44):clamp(base.x-2.0,30,52);
        ly=emergency?lerp(34+sg*7.0,ball.y,0.52):lerp(34+sg*8.5,ball.y,deep?0.34:0.20);task=emergency?'EMERGENCY_TRACK':deep?'BALL_SIDE_RECOVER':'BALL_SIDE_BLOCK';sprint=(emergency||transitioning)&&dist(p,{x:m.ball.x,y:m.ball.y})>5.5;
      }else{
        lx=emergency?clamp(ball.x+9.0,22,38):deep?clamp(ball.x+11.0,25,47):clamp(base.x-1.0,31,53);
        ly=34+sg*(emergency?5.5:7.0)+(ball.y-34)*(emergency?0.18:0.10);task=emergency?'DEEP_TUCK':deep?'FAR_SIDE_TUCK':'FAR_SIDE_BLOCK';sprint=(emergency||transitioning)&&Math.abs(worldToLocal(team,p.x,p.y).x-lx)>4.0;
      }
    }
    applyTarget(p,lx,ly,task,sprint,m);
  }
}

function enforceDefensiveLayering(m,team,owner){
  if(!owner||owner.team===team||m.ball.mode!=='CONTROLLED')return;
  const ball=worldToLocal(team,m.ball.x,m.ball.y);if(ball.x>=48)return;
  const lock=m._defenceRoleLocks?.[team]||{},primary=new Set([lock.pressId,lock.coverId].filter(Boolean)),o=worldToLocal(team,owner.x,owner.y);
  // HF2: preserve a real midfield layer in front of the back four. The previous
  // carrier-relative clamp could put the 8s/pivot on or even behind the CB line.
  const cbTargetXs=outfield(m,team).filter(q=>q.role==='CB').map(q=>worldToLocal(team,q.tx,q.ty).x).filter(Number.isFinite);
  const backLineTargetX=cbTargetXs.length?cbTargetXs.reduce((a,b)=>a+b,0)/cbTargetXs.length:null;
  const secondary=[];
  for(const p of outfield(m,team)){
    if(primary.has(p.id))continue;
    const t=worldToLocal(team,p.tx,p.ty);let tx=t.x,ty=t.y,dx=tx-o.x,dy=ty-o.y,d=Math.hypot(dx,dy);
    // Midfielders/FBs remain a screen, not extra tacklers. CBs can stay a little closer
    // because they still own the box line, but do not all collapse on the same ball point.
    const min=ball.x<30?(p.role==='CB'?5.8:6.8):(p.role==='CB'?6.2:7.2);
    if(d<min){if(d<.001){dy=sideSign(p.slot)||1;d=1;}const k=(min-d)/d;tx+=dx*k;ty+=dy*k;}
    if(p.role==='CM'&&Number.isFinite(backLineTargetX)){
      const screenGap=ball.x<25?6.8:6.4,screenFloor=backLineTargetX+screenGap;
      tx=Math.max(tx,screenFloor);
      // Keep the midfield in front of the back four even when the carrier is already deeper
      // than that layer. The previous Math.min could undo screenFloor and pull an 8 onto the CB line.
      tx=Math.min(tx,Math.max(screenFloor,ball.x+5.0));
    }
    secondary.push({p,tx,ty,d:Math.hypot(tx-o.x,ty-o.y)});
  }
  // STEP75 defensive floor: press + cover are the two direct ball responsibilities. At most
  // No non-primary defender should occupy the immediate carrier ring; press + cover own
  // that space while the next defender protects a runner, lane, cutback or second ball. This applies throughout the defensive
  // final third, not only inside 30m, so tactics can vary without permitting swarm defence.
  const ring=ball.x<30?9.0:9.6,close=secondary.filter(x=>x.d<ring).sort((a,b)=>a.d-b.d);
  for(let i=0;i<close.length;i++){
    const z=close[i];let dx=z.tx-o.x,dy=z.ty-o.y,d=Math.hypot(dx,dy);if(d<.001){dy=sideSign(z.p.slot)||1;d=1;}
    const need=ring+0.45,k=(need-d)/d;z.tx+=dx*k;z.ty+=dy*k;z.d=need;
  }
  for(const z of secondary){const w=localToWorld(team,clamp(z.tx,3,98),clamp(z.ty,4,64));z.p.tx=w.x;z.p.ty=w.y;if(['CUTBACK_TRACK','SECOND_BALL_TUCK','BOX_EDGE_SCREEN','MARK_LANE_SCREEN','DEEP_SCREEN','EMERGENCY_TRACK','DEEP_TUCK'].includes(z.p.tacticalTask))z.p.action=z.p.tacticalTask=z.p.tacticalTask==='MARK_LANE_SCREEN'?'MIDFIELD_LANE_SCREEN':z.p.tacticalTask;}
  // STEP75 universal last-cover floor. Tactical profiles may change line height, pressure and
  // compactness, but they may not spend both centre-backs on the same carrier and leave no
  // goal-side defender. Keep one non-pressing CB between the carrier and goal whenever the
  // attack reaches the defensive final third. This is a structural invariant, not profile balance.
  if(ball.x<38&&['ST','WF','CM'].includes(owner.role)){
    const cbs=outfield(m,team).filter(p=>p.role==='CB'&&p.id!==lock.pressId);
    const guard=cbs.sort((a,b)=>worldToLocal(team,a.x,a.y).x-worldToLocal(team,b.x,b.y).x)[0]||null;
    if(guard){const gt=worldToLocal(team,guard.tx,guard.ty),needX=clamp(o.x-(ball.x<25?3.1:2.4),7.0,35.0);if(gt.x>needX+.35){const gy=clamp(lerp(34,o.y,0.58),19,49),w=localToWorld(team,needX,gy);guard.tx=w.x;guard.ty=w.y;guard.action=guard.tacticalTask='LAST_COVER_SCREEN';guard.markTargetId=null;}}
  }
}


// STEP70: do not let three separate defensive responsibilities collapse onto the
// same off-ball attacker. One tight marker plus one lane/shot cover is enough;
// extra defenders must preserve another lane / second-ball layer.
function enforceOffBallMarkSeparation(m,defTeam,owner){
  if(!owner||owner.team===defTeam||m.restart)return;
  const atkTeam=owner.team,attackers=outfield(m,atkTeam).filter(a=>a.id!==owner.id);
  for(const a of attackers){
    const near=[];
    for(const p of outfield(m,defTeam)){
      const td=Math.hypot((p.tx??p.x)-a.x,(p.ty??p.y)-a.y);
      if(td>5.2)continue;
      let priority=0;
      if(p.markTargetId===a.id)priority+=4;
      if(p.role==='CB')priority+=1.4;
      if(['SHOT_LANE_COVER','MARK_LANE_SCREEN','MIDFIELD_LANE_SCREEN'].includes(p.tacticalTask))priority+=0.8;
      priority+=Math.max(0,2.5-dist(p,a))*0.15;
      near.push({p,priority,td});
    }
    if(near.length<=1)continue;
    near.sort((x,y)=>y.priority-x.priority||x.td-y.td);
    // HF2: only one defender may occupy the tight body-mark ring. A second CB/FB/CM
    // becomes cover/second-ball support instead of starting glued to the same attacker.
    for(const z of near.slice(1)){
      const p=z.p,goal=localToWorld(defTeam,0,34);
      let dx=(p.tx??p.x)-a.x,dy=(p.ty??p.y)-a.y,d=Math.hypot(dx,dy);
      if(d<.01){dx=goal.x-a.x;dy=goal.y-a.y;d=Math.hypot(dx,dy)||1;}
      // Keep the extra defender on the goal-side / lane-side shoulder but visibly
      // outside the 'three men glued to one attacker' ring.
      const need=p.role==='CM'?6.4:p.role==='CB'?5.2:5.6,k=Math.max(0,(need-d)/d);
      let tx=(p.tx??p.x)+dx*k,ty=(p.ty??p.y)+dy*k;
      const gl=worldToLocal(defTeam,goal.x,goal.y),al=worldToLocal(defTeam,a.x,a.y),tl=worldToLocal(defTeam,tx,ty);
      if(p.role==='CM')tl.x=Math.min(tl.x,al.x-2.0);
      const w=localToWorld(defTeam,clamp(tl.x,3,98),clamp(tl.y,4,64));
      p.tx=w.x;p.ty=w.y;
      if(p.markTargetId===a.id)p.markTargetId=null;
      if(['MARK_LANE_SCREEN','MIDFIELD_LANE_SCREEN','SHOT_LANE_COVER'].includes(p.tacticalTask)){
        p.action=p.tacticalTask=p.role==='CM'?'SECOND_BALL_TUCK':'REST_DEFENCE';
      }
    }
  }
}

function assignAttack(m,team,ctx){
  const pr=profile(m,team),ball=worldToLocal(team,m.ball.x,m.ball.y),owner=ctx.owner,rawProgress=ball.x,recycleActive=(m.attackRecycleUntil?.[team]||0)>m.time,progress=recycleActive?Math.max(rawProgress,m.attackRecycleFloor?.[team]||rawProgress):rawProgress,phase=phaseFromProgress(progress,m.transitionUntil>m.time),bl=ballLane(ball.y),rt=tacticalRuntime(m,team,progress);
  const deepSupport=!!owner&&rawProgress>=85.0&&['ST','WF','CM','FB'].includes(owner.role);
  const ownerOppCount=owner?outfield(m,other(team)).filter(q=>dist(q,owner)<=8.2).length:0;
  const strikerPinned=!!owner&&owner.role==='ST'&&rawProgress>=76&&ownerOppCount>=2;
  const stSupportSlot=bl==='LEFT'?'LCM':bl==='RIGHT'?'RCM':(pr.midfieldRunner||'RCM');
  const c={pr,ball,owner,progress,rawProgress,phase,ballLane:bl,midfieldSurge:rt.surge,midfieldRecover:rt.recover,boxWave:(rt.boxWave||deepSupport)&&rawProgress>80,deepSupport,boxPatternIndex:rt.boxPatternIndex,wideOutletSlot:rt.wideOutletSlot,fullbackSurgeSlot:rt.fullbackSurgeSlot,fullbackSurge:rt.fullbackSurge,recycleActive,strikerPinned,stSupportSlot,ownerOppCount};
  c.boxAssignments=buildBoxSlotAssignments(m,team,c);
  for(const p of teamPlayers(m,team)){
    // Receiving a live pass is higher priority than tactical shape.
    if(m.ball.mode==='FLIGHT'&&m.ball.intendedReceiverId===p.id&&m.ball.kind!=='SHOT'){
      const useIntended=!!m.ball.receiverIntentLock,nominal=worldToLocal(team,(useIntended?m.ball.intendedTargetX:m.ball.targetX)??p.x,(useIntended?m.ball.intendedTargetY:m.ball.targetY)??p.y),pl=worldToLocal(team,p.x,p.y),bl=worldToLocal(team,m.ball.x,m.ball.y);let tx=clamp(nominal.x,2,103),ty=clamp(nominal.y,2,66);
      if(m.ball.kind==='THROUGH'){
        // Once a through-ball reaches/passes the planned meeting point, the runner must keep
        // following the moving ball instead of stopping on the old marker while it rolls away.
        const nearMeeting=Math.hypot(pl.x-nominal.x,pl.y-nominal.y)<3.2,ballPast=bl.x>nominal.x-0.3,ballGap=dist(p,m.ball)>1.7;
        if((nearMeeting||ballPast)&&ballGap){const pred=worldToLocal(team,m.ball.x+(m.ball.vx||0)*0.20,m.ball.y+(m.ball.vy||0)*0.20);tx=clamp(Math.max(nominal.x,pred.x),2,101.5);ty=clamp(lerp(nominal.y,pred.y,0.78),2,66);}
      }
      const target=localToWorld(team,tx,ty);p.tx=target.x;p.ty=target.y;p.action=m.ball.kind==='THROUGH'?'CHASE_THROUGH':'MOVE_TO_RECEIVE';p.tacticalTask=p.action;p.sprint=m.ball.kind==='THROUGH'?dist(p,m.ball)>1.35:dist(p,target)>2.2;
      // TT-0.51 1_8: scan before contact and arrive half-open. Facing the ball 100% created
      // the baseball-catch look and then coupled the meeting run to the next attacking step.
      // Through-ball runners keep their run-facing; ordinary/long receivers blend the incoming
      // ball view with the attacking goal before the touch.
      const ballGap=dist(p,m.ball),targetGap=dist(p,target);
      if(m.ball.kind!=='THROUGH'&&(ballGap<5.8||targetGap<1.25)){
        const incomingA=Math.atan2(m.ball.y-p.y,m.ball.x-p.x),goalX=team===HOME?105:0,goalA=Math.atan2(34-p.y,goalX-p.x),fx=Math.cos(incomingA)*.44+Math.cos(goalA)*.56,fy=Math.sin(incomingA)*.44+Math.sin(goalA)*.56;
        p.faceTargetAngle=Math.atan2(fy,fx);p.receiveFacingUntil=Math.max(p.receiveFacingUntil||0,m.time+1.15);
      }
      continue;
    }
    const t=attackTask(m,p,c);applyTarget(p,t.lx,t.ly,t.task,t.sprint,m);
  }
}

function stabilizeStrikerRunLane(m,team,owner){
  if(!owner||owner.team!==team||m.ball.mode!=='CONTROLLED')return;
  const st=teamPlayers(m,team).find(p=>p.slot==='ST');if(!st||st.id===owner.id)return;
  const familyTasks=new Set(['PIN_CENTRE_BACKS','PIN_AND_RUN','ATTACK_OPEN_CHANNEL','ATTACK_NEAR_POST','ATTACK_BACK_POST','PULL_OFF_FOR_CROSS','ATTACK_CENTRAL_CHANNEL']);
  if(!familyTasks.has(st.tacticalTask))return;
  m._attackRunStability=m._attackRunStability||{};let s=m._attackRunStability[team];
  const ownerChanged=!s||s.ownerId!==owner.id;if(ownerChanged)s=m._attackRunStability[team]={ownerId:owner.id,laneY:Number(st.ty),laneUntil:m.time+.45};
  if(!Number.isFinite(Number(s.laneY)))s.laneY=Number(st.ty);
  if(m.time>=Number(s.laneUntil||0)){const step=clamp(Number(st.ty)-Number(s.laneY),-2.0,2.0);s.laneY=clamp(Number(s.laneY)+step,10,58);s.laneUntil=m.time+.48;}
  st.ty=lerp(Number(st.ty),Number(s.laneY),.70);
}

function enforceActualDefenderCrowdExit(m,team,owner){
  if(!owner||owner.team===team||m.ball.mode!=='CONTROLLED')return;
  const lock=m._defenceRoleLocks?.[team]||{},pressId=lock.pressId,coverId=lock.coverId,pr=profile(m,team),ball=worldToLocal(team,m.ball.x,m.ball.y);
  // Hard responsibility cap: only the current press owner may carry a direct press task.
  // This catches a stale PRESS_CONTAIN/ENGAGE label during role-lock hand-offs, which was the
  // reason TT-0.45 could visibly show both A-LB and A-CM closing the same winger.
  for(const p of outfield(m,team)){
    if(p.id===pressId)continue;
    if(!['PRESS_CONTAIN','ENGAGE'].includes(p.tacticalTask))continue;
    if(p.id===coverId){
      const ol=worldToLocal(team,owner.x,owner.y),base=defendingBlockAnchors(pr,ball.x,ball.y,p.slot,p.role),dx=-ol.x,dy=34-ol.y,dg=Math.max(.01,Math.hypot(dx,dy)),sx=ol.x+dx/dg*3.4,sy=ol.y+dy/dg*3.4,w=localToWorld(team,lerp(base.x,sx,.82),lerp(base.y,sy,.82));
      p.tx=w.x;p.ty=w.y;p.action=p.tacticalTask='SHOT_LANE_COVER';p.sprint=dist(p,w)>2.6;continue;
    }
    const base=defendingBlockAnchors(pr,ball.x,ball.y,p.slot,p.role),w=localToWorld(team,base.x,base.y);p.tx=w.x;p.ty=w.y;p.action=p.tacticalTask=p.role==='CM'?'MIDFIELD_LANE_SCREEN':'REST_DEFENCE';p.sprint=dist(p,w)>3.2;p.markTargetId=null;
  }
}

function enforceFullbackWideRunnerResponsibility(m,team,owner){
  if(!owner||owner.team===team||!['CONTROLLED','FLIGHT'].includes(m.ball.mode))return;
  const lock=m._defenceRoleLocks?.[team]||{},attackers=outfield(m,other(team)).filter(a=>a.role==='WF');
  for(const fb of outfield(m,team).filter(p=>p.role==='FB')){
    if(fb.id===lock.pressId)continue;
    const sg=sideSign(fb.slot),wf=attackers.map(a=>({a,l:worldToLocal(team,a.x,a.y)})).filter(o=>(o.l.y<34?-1:1)===sg&&o.l.x<=52).sort((a,b)=>a.l.x-b.l.x)[0];
    if(!wf)continue;
    const wl=wf.l,tx=clamp(wl.x-2.5,6,42),ty=clamp(lerp(wl.y,34,.10),5,63),w=localToWorld(team,tx,ty);
    fb.tx=w.x;fb.ty=w.y;fb.markTargetId=wf.a.id;fb.action=fb.tacticalTask='WIDE_RUN_TRACK';fb.sprint=dist(fb,wf.a)>4.2||dist(fb,w)>2.8;
    if(lock.coverId===fb.id)lock.coverId=null;
  }
}

function separateRecoveringMidfieldFromStriker(m,team){
  const st=teamPlayers(m,team).find(p=>p.slot==='ST');if(!st)return;
  const sl=worldToLocal(team,st.x,st.y);
  for(const p of teamPlayers(m,team).filter(p=>['LCM','RCM'].includes(p.slot)&&['RECOVER_MIDFIELD_8','BOX_EDGE_SUPPORT','SECOND_WAVE_8'].includes(p.tacticalTask))){
    const pl=worldToLocal(team,p.x,p.y);if(Math.hypot(pl.x-sl.x,pl.y-sl.y)>7.0||Math.abs(pl.y-sl.y)>3.8)continue;
    const sign=p.slot==='RCM'?1:-1,tl=worldToLocal(team,p.tx,p.ty),wantedY=clamp(sl.y+sign*5.2,18,50),w=localToWorld(team,Math.min(tl.x,pl.x-1.0),wantedY);p.tx=w.x;p.ty=w.y;p.action=p.tacticalTask='RECOVER_MIDFIELD_LANE';p.sprint=true;m.stats.midfieldStrikerLaneSeparations=(m.stats.midfieldStrikerLaneSeparations||0)+1;
  }
}

function enforceAttackingCarrierLane(m,team){
  const owner=playerById(m,m.ball.ownerId);if(!owner||owner.team!==team||m.ball.mode!=='CONTROLLED'||owner.role!=='CM')return;
  if(!['CARRY_FORWARD','CARRY_SCAN','COMMITTED_BOX_CARRY','DRIBBLE_EVADE','TAKE_ON'].includes(owner.action))return;
  const ol=worldToLocal(team,owner.x,owner.y);if(ol.x<48)return;
  const st=teamPlayers(m,team).find(p=>p.slot==='ST');if(!st||st.id===owner.id||(st.lockTargetUntil||0)>m.time)return;
  const sl=worldToLocal(team,st.x,st.y),ahead=sl.x-ol.x,lateral=sl.y-ol.y;if(ahead<-1.0||ahead>10.5||Math.abs(lateral)>3.4)return;
  const opps=outfield(m,other(team)),scoreSide=sg=>{const cy=clamp(ol.y+sg*6.2,12,56),cx=clamp(Math.max(sl.x,ol.x+5.5),55,95);return opps.filter(q=>{const l=worldToLocal(team,q.x,q.y);return Math.hypot(l.x-cx,l.y-cy)<5.0;}).length;};
  let sg=scoreSide(-1)<scoreSide(1)?-1:scoreSide(1)<scoreSide(-1)?1:(sl.y<=34?-1:1),tx=clamp(Math.max(sl.x,ol.x+5.5),55,95),ty=clamp(ol.y+sg*6.2,12,56),w=localToWorld(team,tx,ty);
  st.tx=w.x;st.ty=w.y;st.action=st.tacticalTask='CLEAR_CARRIER_LANE';st.sprint=true;m.stats.attackingCarrierLaneSeparations=(m.stats.attackingCarrierLaneSeparations||0)+1;
}
function recoverFreeKickWall(m,team){
  const rec=m.setPieceWallRecovery;if(!rec||rec.team!==team)return;if(m.time>=rec.until){delete m.setPieceWallRecovery;return;}
  const pr=profile(m,team),ball=worldToLocal(team,m.ball.x,m.ball.y),ids=new Set(rec.wallIds||[]);
  for(const p of teamPlayers(m,team)){if(!ids.has(p.id)||p.role==='GK')continue;const base=defendingBlockAnchors(pr,ball.x,ball.y,p.slot,p.role),w=localToWorld(team,base.x,base.y);p.tx=w.x;p.ty=w.y;p.action=p.tacticalTask='FREE_KICK_WALL_RECOVERY';p.sprint=dist(p,w)>2.0;p.markTargetId=null;p.pressCommitUntil=0;p.pressRecoverUntil=Math.max(p.pressRecoverUntil||0,Math.min(rec.until,m.time+.55));}
}

function targetSeparation(m){
  // Same-team target spacing. Inside the box the minimum is wider because multiple
  // attackers being assigned the same lane creates the visible 'two markers tangled' failure.
  for(const team of [HOME,AWAY]){const ps=outfield(m,team);for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
    const a=ps[i],b=ps[j];let dx=b.tx-a.tx,dy=b.ty-a.ty,d=Math.hypot(dx,dy);const inBox=inOpponentBoxTarget(team,a.tx,a.ty)&&inOpponentBoxTarget(team,b.tx,b.ty),min=inBox?3.60:2.80;
    if(d>=min)continue;if(d<0.001){const v=stablePairVector(a.id,b.id);dx=v.x*0.01;dy=v.y*0.01;d=0.01;if(inBox)m.stats.boxSlotConflicts=(m.stats.boxSlotConflicts||0)+1;}
    const nx=dx/d,ny=dy/d,push=(min-d)*0.52;
    const ownerId=m.ball.ownerId,aLocked=a.id===ownerId||(a.lockTargetUntil||0)>m.time,bLocked=b.id===ownerId||(b.lockTargetUntil||0)>m.time;
    const aScreen=a.tacticalTask==='MARK_LANE_SCREEN'||a.tacticalTask==='SHOT_LANE_COVER';
    const bScreen=b.tacticalTask==='MARK_LANE_SCREEN'||b.tacticalTask==='SHOT_LANE_COVER';
    if(aLocked&&!bLocked){b.tx+=nx*push;b.ty+=ny*push;}
    else if(bLocked&&!aLocked){a.tx-=nx*push;a.ty-=ny*push;}
    else if(aScreen&&!bScreen){b.tx+=nx*push;b.ty+=ny*push;}
    else if(bScreen&&!aScreen){a.tx-=nx*push;a.ty-=ny*push;}
    else if(!aLocked&&!bLocked){a.tx-=nx*push*0.5;a.ty-=ny*push*0.5;b.tx+=nx*push*0.5;b.ty+=ny*push*0.5;}
  }}
  // Opponents may make contact, but only the active presser is allowed to close to duel distance.
  // Everyone else keeps a small lane so markers do not lock together and oscillate.
  const owner=playerById(m,m.ball.ownerId),all=outfield(m,HOME).concat(outfield(m,AWAY)).filter(p=>inOpponentBoxTarget(p.team,p.tx,p.ty)||Math.hypot(p.tx-m.ball.x,p.ty-m.ball.y)<11.0);
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    const a=all[i],b=all[j];if(a.team===b.team)continue;let dx=b.tx-a.tx,dy=b.ty-a.ty,d=Math.hypot(dx,dy);
    const aDuel=owner&&a.id===owner.id&&['ENGAGE','PRESS_CONTAIN'].includes(b.tacticalTask),bDuel=owner&&b.id===owner.id&&['ENGAGE','PRESS_CONTAIN'].includes(a.tacticalTask),duel=aDuel||bDuel,min=duel?1.08:2.05;
    if(d>=min)continue;if(d<0.001){const v=stablePairVector(a.id,b.id);dx=v.x*0.01;dy=v.y*0.01;d=0.01;}
    const nx=dx/d,ny=dy/d,push=min-d;
    if(duel){const defender=aDuel?b:a,sign=aDuel?1:-1;defender.tx+=nx*push*sign;defender.ty+=ny*push*sign;defender.tx=clamp(defender.tx,1,104);defender.ty=clamp(defender.ty,1,67);}
    else{
      // Never push the controlled carrier's scripted target backwards merely to
      // satisfy display spacing. Move the non-owner around the carrier instead.
      const ownerId=owner?.id,aOwner=a.id===ownerId,bOwner=b.id===ownerId;
      const aScreen=a.tacticalTask==='MARK_LANE_SCREEN'||a.tacticalTask==='SHOT_LANE_COVER';
      const bScreen=b.tacticalTask==='MARK_LANE_SCREEN'||b.tacticalTask==='SHOT_LANE_COVER';
      if(aOwner&&!bOwner){b.tx=clamp(b.tx+nx*push,1,104);b.ty=clamp(b.ty+ny*push,1,67);}
      else if(bOwner&&!aOwner){a.tx=clamp(a.tx-nx*push,1,104);a.ty=clamp(a.ty-ny*push,1,67);}
      // Preserve a defender's lane-screen point; make the runner route around the body
      // instead of pushing the screen defender off the passing/shooting corridor.
      else if(aScreen&&!bScreen){b.tx=clamp(b.tx+nx*push,1,104);b.ty=clamp(b.ty+ny*push,1,67);}
      else if(bScreen&&!aScreen){a.tx=clamp(a.tx-nx*push,1,104);a.ty=clamp(a.ty-ny*push,1,67);}
      else{a.tx=clamp(a.tx-nx*push*0.5,1,104);a.ty=clamp(a.ty-ny*push*0.5,1,67);b.tx=clamp(b.tx+nx*push*0.5,1,104);b.ty=clamp(b.ty+ny*push*0.5,1,67);}
    }
  }
}

function enforceWideLaneHierarchy(m,team){
  // Target-level guardrail for the visual failure reported in V0.6: same-side WF + 8 + FB
  // occasionally ran shoulder-to-shoulder down the penalty-area flank. When the winger owns
  // the outside lane, CM and FB are routed into distinct half-space/underlap lanes.
  const ps=teamPlayers(m,team);
  for(const left of [true,false]){
    const wf=ps.find(p=>p.slot===(left?'LW':'RW')),cm=ps.find(p=>p.slot===(left?'LCM':'RCM')),fb=ps.find(p=>p.slot===(left?'LB':'RB'));
    if(!wf)continue;const w=worldToLocal(team,wf.tx,wf.ty),sg=left?-1:1;
    const wingerWide=w.x>62&&(w.y<17.5||w.y>50.5);if(!wingerWide)continue;
    if(cm){const c=worldToLocal(team,cm.tx,cm.ty);if(c.x>55&&Math.abs(c.y-w.y)<7.5){const q=localToWorld(team,c.x,34+sg*9.0);cm.tx=q.x;cm.ty=q.y;}}
    if(fb){const f=worldToLocal(team,fb.tx,fb.ty);if(f.x>55&&Math.abs(f.y-w.y)<6.5){const q=localToWorld(team,f.x,34+sg*18.0);fb.tx=q.x;fb.ty=q.y;if(['OVERLAP','BALANCED_OVERLAP','OUTSIDE_SUPPORT'].includes(fb.tacticalTask))fb.tacticalTask='UNDERLAP_SUPPORT';}}
  }
}

function abilityVal(m,p,key){const prof=m?.playerAbilityProfiles?.[p?.id];return prof&&Number.isFinite(prof[key])?prof[key]:60;}
function applyAerialFirstBallChallenger(m,team){
  if(!m||m.ball?.mode!=='FLIGHT')return;
  const kind=m.ball.kind,air=(m.ball.deliveryMode||'AERIAL')==='AERIAL';
  if(!air||!['CROSS','LONG_PASS','GOAL_KICK'].includes(kind))return;
  const tx=Number.isFinite(m.ball.intendedTargetX)?m.ball.intendedTargetX:m.ball.targetX,ty=Number.isFinite(m.ball.intendedTargetY)?m.ball.intendedTargetY:m.ball.targetY;
  if(!Number.isFinite(tx)||!Number.isFinite(ty))return;
  const target={x:tx,y:ty},tl=worldToLocal(team,tx,ty),field=outfield(m,team),maxD=kind==='CROSS'?8.0:kind==='LONG_PASS'?9.5:11.0;
  const elig=field.map(p=>{const d=dist(p,target),read=(abilityVal(m,p,'anticipation')+abilityVal(m,p,'defensive_positioning')+abilityVal(m,p,'heading'))/3;let roleBias=0;if(tl.x<36){if(p.role==='CB')roleBias=-1.25;else if(p.role==='FB')roleBias=-0.55;else if(p.role==='CM')roleBias=-0.20;}else{if(p.role==='CM')roleBias=-0.45;else if(p.role==='CB')roleBias=-0.20;}return{p,d,score:d+roleBias-(read-60)*0.012};}).filter(o=>o.d<=maxD).sort((a,b)=>a.score-b.score);
  if(!elig.length)return;const ch=elig[0].p,cur=worldToLocal(team,ch.tx,ch.ty),q=worldToLocal(team,tx,ty),goalSide={x:clamp(q.x-0.35,3,96),y:clamp(q.y,4,64)},blend=kind==='CROSS'?0.56:0.62,nx=lerp(cur.x,goalSide.x,blend),ny=lerp(cur.y,goalSide.y,blend),move=Math.hypot(nx-cur.x,ny-cur.y),cap=kind==='CROSS'?3.0:3.8,scale=move>cap?cap/move:1,w=localToWorld(team,cur.x+(nx-cur.x)*scale,cur.y+(ny-cur.y)*scale);
  ch.tx=w.x;ch.ty=w.y;ch.action=ch.tacticalTask='AERIAL_FIRST_BALL';ch.sprint=dist(ch,w)>2.0;ch.faceTargetAngle=Math.atan2((m.ball.y||ty)-ch.y,(m.ball.x||tx)-ch.x);
  m._aerialFirstBallChallenger={team,playerId:ch.id,kind,at:m.time,targetX:tx,targetY:ty};
}

function defenceRoleFamily(p,lock){
  const t=String(p.tacticalTask||p.action||'');
  if(p.id===lock?.pressId||['PRESS_CONTAIN','ENGAGE','RECOVERY_CHASE','EMERGENCY_TRACK'].includes(t))return'PRESS';
  if(['WIDE_RUN_TRACK','TRANSITION_WIDE_COVER'].includes(t))return'WIDE_TRACK';
  if(p.markTargetId||t==='MARK'||t==='MARK_LANE_SCREEN')return'MARK';
  if(p.id===lock?.coverId||/COVER|SCREEN|TUCK|REST_DEFENCE|BLOCK/.test(t))return'COVER';
  return'SHAPE';
}
function defensiveResponsibilityHold(family){return family==='PRESS'?.48:family==='WIDE_TRACK'?1.35:family==='MARK'?1.32:family==='COVER'?1.18:1.05;}
function stabilizeDefensiveResponsibilities(m,team,owner){
  if(!owner||owner.team===team||!['CONTROLLED','FLIGHT'].includes(m.ball.mode))return;
  m._defenceMotionStability=m._defenceMotionStability||{};
  const state=m._defenceMotionStability[team]||(m._defenceMotionStability[team]={players:{},ownerId:owner.id});
  const ownerChanged=state.ownerId!==owner.id;
  if(ownerChanged){state.ownerId=owner.id;for(const q of Object.values(state.players||{})){q.minUntil=m.time+.16;q.laneUntil=m.time;q.lastLateralFlipAt=-99;}}
  const lock=m._defenceRoleLocks?.[team]||{},ball=worldToLocal(team,m.ball.x,m.ball.y),controlled=m.ball.mode==='CONTROLLED';
  for(const p of outfield(m,team).filter(q=>['CB','FB','CM'].includes(q.role))){
    const family=defenceRoleFamily(p,lock),prev=state.players[p.id],mark=playerById(m,p.markTargetId),markLocal=mark?worldToLocal(team,mark.x,mark.y):null;
    const emergencyPress=controlled&&(p.id===lock.pressId||family==='PRESS'&&dist(p,owner)<=3.2);
    const emergencyWide=family==='WIDE_TRACK'&&markLocal&&markLocal.x<=52;
    const emergencyBox=controlled&&ball.x<=19&&['CB','FB'].includes(p.role)&&dist(p,owner)<=5.0;
    const semanticEmergency=ownerChanged||emergencyPress||emergencyWide||emergencyBox;
    const hardMotionEmergency=ownerChanged||emergencyBox;
    const fastMotion=!hardMotionEmergency&&(emergencyPress||emergencyWide);
    const proposed={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:Number(p.tx),ty:Number(p.ty)};
    if(prev){
      const oldMark=playerById(m,prev.markTargetId),oldMarkGap=oldMark?dist(p,oldMark):99;
      const oldMarkRelevant=!!oldMark&&oldMark.team!==team&&oldMarkGap<=14.5;
      const familyChanged=prev.family!==family,markChanged=prev.markTargetId!==proposed.markTargetId;
      const holdActive=m.time<Number(prev.minUntil||0);
      if(holdActive&&!semanticEmergency&&(familyChanged||(markChanged&&oldMarkRelevant))){p.tacticalTask=prev.task;p.action=prev.action;p.markTargetId=prev.markTargetId||null;}
      const finalFamily=defenceRoleFamily(p,lock),finalMark=p.markTargetId||null,semanticChanged=prev.family!==finalFamily||prev.markTargetId!==finalMark;
      if(semanticChanged){prev.minUntil=m.time+defensiveResponsibilityHold(finalFamily);prev.since=m.time;prev.laneUntil=m.time;}
      const xAlpha=hardMotionEmergency?.82:fastMotion?.68:.46;p.tx=lerp(Number(prev.tx),Number(p.tx),xAlpha);
      if(hardMotionEmergency){prev.laneTy=Number(proposed.ty);prev.laneUntil=m.time+.16;}
      else if(!Number.isFinite(Number(prev.laneTy))){prev.laneTy=Number(proposed.ty);prev.laneUntil=m.time+(fastMotion?.16:.40);}
      else if(m.time>=Number(prev.laneUntil||0)){
        const cap=fastMotion?1.15:1.65,step=clamp(Number(proposed.ty)-Number(prev.laneTy),-cap,cap);
        prev.laneTy=clamp(Number(prev.laneTy)+step,2,66);prev.laneUntil=m.time+(fastMotion?.18:.42);
      }
      p.ty=lerp(Number(prev.ty),Number(prev.laneTy),hardMotionEmergency?.88:fastMotion?.72:.58);
      prev.family=finalFamily;prev.task=p.tacticalTask;prev.action=p.action;prev.markTargetId=finalMark;prev.tx=p.tx;prev.ty=p.ty;
    }else state.players[p.id]={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:Number(p.tx),ty:Number(p.ty),laneTy:Number(p.ty),laneUntil:m.time+.32,since:m.time,minUntil:m.time+defensiveResponsibilityHold(family),lastLateralFlipAt:-99};
  }
}

function assign(m){
  if(!m||m.completed)return;
  const poss=m.possession;
  // Production integration guard: a press/mark lock belongs to one defensive phase.
  // When possession flips, stale assignments from the team's previous defending spell
  // must not survive into the next one.
  if(m._lastTacticalPossession!==poss){
    const lostTeam=m._lastTacticalPossession;
    if(lostTeam&&lostTeam!==poss)captureTransitionWideVacancies(m,lostTeam);
    // A rest-defence vacancy belongs only to the spell immediately after THAT team loses
    // possession. If it wins the ball back, the old defensive hand-off is no longer active.
    if(m._transitionWideVacancies?.[poss])m._transitionWideVacancies[poss]={};
    m._defenceRoleLocks={};
    m._markLocks={};
    m._defenceMotionStability={};
    m._attackRunStability={};
    m._lastTacticalPossession=poss;
  }
  const owner=playerById(m,m.ball.ownerId),flightThreat=m.ball.mode==='FLIGHT'&&['PASS','LONG_PASS','THROUGH','CROSS','CUTBACK'].includes(m.ball.kind)&&m.ball.intendedReceiverId?playerById(m,m.ball.intendedReceiverId):null,liveThreat=owner||flightThreat,ctx={owner};
  assignAttack(m,poss,ctx);stabilizeStrikerRunLane(m,poss,owner);separateRecoveringMidfieldFromStriker(m,poss);enforceAttackingCarrierLane(m,poss);const defTeam=other(poss);assignDefence(m,defTeam,ctx);applyAerialFirstBallChallenger(m,defTeam);enforceDefensiveLayering(m,defTeam,owner);enforceOffBallMarkSeparation(m,defTeam,owner);recoverFreeKickWall(m,defTeam);targetSeparation(m);enforceActualDefenderCrowdExit(m,defTeam,owner);enforceFullbackWideRunnerResponsibility(m,defTeam,liveThreat);enforceWideLaneHierarchy(m,poss);stabilizeDefensiveResponsibilities(m,defTeam,liveThreat);
  m.tactical={
    formation:{HOME:FORMATION,AWAY:FORMATION},
    profile:{HOME:PROFILES.HOME.id,AWAY:PROFILES.AWAY.id},
    labels:{HOME:PROFILES.HOME.label,AWAY:PROFILES.AWAY.label}
  };
}

function describe(team,m=null){return{...profile(m,team)};}
return{assign,updateGoalkeeperShotReaction,describe,PROFILES,FORMATION,phaseFromProgress};
});
