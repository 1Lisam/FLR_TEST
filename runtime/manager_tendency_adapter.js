(function(root,factory){
  const api=factory((typeof globalThis!=='undefined'&&globalThis.FLRPG_CONTINUOUS_CORE)||((typeof require==='function')?require('./continuous_match_core.js'):null));
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_MANAGER_TENDENCY_ADAPTER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(E){
'use strict';
const VERSION='STEP39-MANAGER-TENDENCY-ADAPTER-0.6';
const B=E.choiceActionBridge(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const PROFILES={
  BALANCED:{id:'BALANCED',label:'균형',attacking:.52,transition:.50,pressing:.55,directness:.50,lineHeight:.54},
  DEFENSIVE_COUNTER:{id:'DEFENSIVE_COUNTER',label:'수비적 · 빠른 역습',attacking:.30,transition:.82,pressing:.38,directness:.82,lineHeight:.35},
  ATTACKING_PRESS:{id:'ATTACKING_PRESS',label:'공격적 · 높은 압박',attacking:.82,transition:.56,pressing:.86,directness:.42,lineHeight:.79}
};
const teams=['HOME','AWAY'];
function local(team,x,y){return team==='HOME'?{x,y}:{x:105-x,y:68-y};}
function world(team,x,y){return team==='HOME'?{x,y}:{x:105-x,y:68-y};}
function blank(){return{HOME:0,AWAY:0};}
function inOppBox(team,p){const q=local(team,p.x,p.y);return q.x>=88.5&&q.y>=13.84&&q.y<=54.16;}
function init(m,profiles={HOME:'BALANCED',AWAY:'BALANCED'}){
  m.managerProfiles={HOME:{...PROFILES[profiles.HOME||'BALANCED']},AWAY:{...PROFILES[profiles.AWAY||'BALANCED']}};
    m.managerTelemetry={
    forcedDirectPasses:blank(),forcedSafePasses:blank(),pressEngagements:blank(),laneScreens:blank(),
    passesByTeam:blank(),progressivePassesByTeam:blank(),boxEntriesByTeam:blank(),highRegainsByTeam:blank(),
    samples:blank(),defLineSum:blank(),supportLineSum:blank(),oppBoxOccupancySum:blank(),
    lastDecisionAt:{HOME:-99,AWAY:-99},lastPressAt:{HOME:-99,AWAY:-99},lastLaneScreenAt:{HOME:-99,AWAY:-99},
    lastGlobalPasses:m.stats.passes||0,lastGlobalProgressive:m.stats.progressivePasses||0,
    lastPassAtSeen:{HOME:m.lastPassAt?.HOME??-99,AWAY:m.lastPassAt?.AWAY??-99},lastPossession:m.possession,lastBallMode:m.ball.mode,
    ballBoxInside:{HOME:false,AWAY:false},lastBoxEntryAt:{HOME:-99,AWAY:-99}
  };
  return m;
}
function phaseLocal(m,team){return local(team,m.ball.x,m.ball.y).x;}
function maybeDecisionBias(m,team){
  const pr=m.managerProfiles?.[team];if(!pr||m.ball.mode!=='CONTROLLED')return;
  const owner=B.playerById(m,m.ball.ownerId);if(!owner||owner.team!==team||owner.role==='GK')return;
  // Manager intent may never become an alternate action owner for the controlled player.
  if(m.protagonistControllerId===owner.id&&(m.protagonistExplicitActionRequired===true||m.protagonistInteractiveEpisode?.active||m.protagonistDeferredChoice?.playerId===owner.id))return;
  // Manager preference may bias WHICH pass is chosen, but it must not bypass the
  // player's first-touch / scan readiness. Quick combinations still happen naturally
  // when the core gives a short nextThink in transitions or under pressure.
  if((owner.lockTargetUntil||0)>m.time+.04||(owner.nextThink||0)>m.time+.08)return;
  const mt=m.managerTelemetry;if(m.time-(mt.lastDecisionAt[team]||-99)<1.05)return;
  const opts=B.passOptions(m,owner);if(!opts.length)return;
  const progress=phaseLocal(m,team),transition=m.transitionUntil>m.time,rhythm=m.attackRhythm?.[team],settling=!!rhythm&&m.time<(rhythm.settleUntil||0)&&m.time>=(rhythm.counterUntil||0)&&progress<72;
  const forward=opts.filter(o=>o.block===0&&o.forward>8&&o.open>1.0).sort((a,b)=>b.forward-a.forward||b.open-a.open)[0];
  const safe=opts.filter(o=>o.block===0&&o.d<25&&o.open>1.65&&o.forward>-7&&o.forward<14).sort((a,b)=>b.open-a.open||a.d-b.d)[0];
  // Counter sides are much more willing to use the first clean forward lane during a real transition,
  // while non-transition phases do not become a permanent long-ball lottery.
  if(forward&&!settling&&(transition||progress<70)){
    let p=0.010+pr.directness*.035+pr.transition*.030;
    if(transition)p+=pr.transition*.090;
    p=clamp(p,0.015,0.18);
    if(m.r()<p){B.executePass(m,owner,forward.p,forward.d>31?'LONG_PASS':(forward.running?'THROUGH':'PASS'),forward);mt.forcedDirectPasses[team]++;mt.lastDecisionAt[team]=m.time;return;}
  }
  // More attacking / less direct profiles circulate through nearby support more often. This changes
  // action selection, not player ability or pass success.
  if(safe&&!settling&&!transition&&progress<80){
    const combo=(1-pr.directness)*(.45+pr.attacking*.55);
    const p=clamp(0.008+combo*.085,0.008,0.085);
    if(m.r()<p){B.executePass(m,owner,safe.p,'PASS',safe);mt.forcedSafePasses[team]++;mt.lastDecisionAt[team]=m.time;}
  }
}
function choosePresser(ps,owner,team,pr){
  const ballL=local(team,owner.x,owner.y),highZone=ballL.x>52;
  return ps.filter(p=>p.role!=='GK').map(p=>{
    const d=B.dist(p,owner),pl=local(team,p.x,p.y),gap=ballL.x-pl.x;let penalty=0;
    if(p.role==='CB'&&highZone)penalty=pr.pressing>.72?5.5:9.0;
    else if(p.role==='FB'&&highZone)penalty=2.0;
    else if(['ST','WF','CM'].includes(p.role))penalty=-.7;
    // High press means earlier pressure, not chasing from the wrong side. Prefer a
    // slightly farther goal-side player over one the carrier has already beaten.
    if(gap<-.20)penalty+=13.5+Math.min(8.0,Math.abs(gap)*2.4);
    else if(gap>=.45&&gap<=3.8)penalty-=.55;
    else if(gap>5.8)penalty+=1.0;
    return{p,d,score:d+penalty};
  }).filter(o=>o.d<7+pr.pressing*11).sort((a,b)=>a.score-b.score)[0]||null;
}

function stableManagerPressSide(m,team,p,owner,lat){
  if(!m._managerPressSideLocks)m._managerPressSideLocks={};
  const locks=m._managerPressSideLocks[team]||(m._managerPressSideLocks[team]={});
  const pl=local(team,p.x,p.y),fallback=pl.y<34?-1:1,desired=Math.abs(lat)>.70?Math.sign(lat):fallback;
  let st=locks[p.id];
  if(!st||st.ownerId!==owner.id||m.time>=(st.until||0))st=locks[p.id]={ownerId:owner.id,side:desired||1,until:m.time+2.35};
  return st.side||1;
}
function applyLaneScreen(m,team,owner,presser,pr){
  if(pr.pressing<.72)return;
  const mt=m.managerTelemetry,opts=B.passOptions(m,owner).filter(o=>o.block===0&&o.forward>2&&o.open>1.2).sort((a,b)=>b.score-a.score||b.forward-a.forward);
  const target=opts[0]?.p;if(!target)return;
  const ps=B.teamPlayers(m,team).filter(p=>p.role!=='GK'&&p.id!==presser?.id&&p.role!=='CB');
  if(!ps.length)return;
  const mx=owner.x+(target.x-owner.x)*.48,my=owner.y+(target.y-owner.y)*.48;
  const screen=ps.map(p=>({p,d:Math.hypot(p.x-mx,p.y-my)})).sort((a,b)=>a.d-b.d)[0];
  if(!screen||screen.d>11.5)return;
  screen.p.tx=mx;screen.p.ty=my;screen.p.sprint=screen.d>4.0;screen.p.tacticalTask='PASS_LANE_SCREEN';
  if(m.time-(mt.lastLaneScreenAt[team]||-99)>1.0){mt.laneScreens[team]++;mt.lastLaneScreenAt[team]=m.time;}
}
function enforceManagerGoalSide(m,team,ballOwner){
  // STEP38 V0.4: manager line-height/pressing intent cannot override core defensive
  // goal-side responsibility. High pressing changes how fast/high the team engages,
  // not whether cover defenders are allowed to orbit beyond the attacker.
  if(!ballOwner||ballOwner.team===team)return;
  const ownerL=local(team,ballOwner.x,ballOwner.y);
  for(const p of B.teamPlayers(m,team)){
    if(p.role==='GK')continue;
    const q=local(team,p.tx,p.ty),task=p.tacticalTask||p.action||'';
    let minX=null,maxX=null;
    if(task==='PRESS_CONTAIN'){minX=ownerL.x-3.20;maxX=ownerL.x-0.90;}
    else if(task==='CLOSE_DOWN'){minX=ownerL.x-2.65;maxX=ownerL.x-0.55;}
    else if(task==='SHOT_LANE_COVER'){minX=ownerL.x-5.60;maxX=ownerL.x-1.35;}
    else if(task==='MARK_LANE_SCREEN'&&p.markTargetId){const a=B.playerById(m,p.markTargetId);if(a){const al=local(team,a.x,a.y),g=p.role==='CB'?0.95:p.role==='FB'?0.78:0.42;minX=al.x-(p.role==='CB'?4.8:p.role==='FB'?4.2:3.6);maxX=al.x-g;}}
    else if(['CB','FB'].includes(p.role)&&B.dist(p,ballOwner)<6.5&&task!=='ENGAGE'){minX=ownerL.x-4.2;maxX=ownerL.x-0.35;}
    if(maxX!=null){const bounded=clamp(q.x,Math.max(3,minX),maxX);if(Math.abs(bounded-q.x)>0.001){const w=world(team,bounded,q.y);p.tx=w.x;p.ty=w.y;}}
  }
}
function applyLiveDefensiveTendencies(m,team){
  const pr=m.managerProfiles?.[team];if(!pr)return;
  const poss=m.possession===team,ps=B.teamPlayers(m,team),ballOwner=B.playerById(m,m.ball.ownerId);
  // STEP39 V0.4: line height / shape are now planned inside tactical_movement from manager input.
  // This adapter keeps only current-state defensive tendencies that must react between shape refreshes.
  if(!poss&&ballOwner&&ballOwner.team!==team){
    const ballL=local(team,ballOwner.x,ballOwner.y),mayPress=pr.pressing>.70||ballL.x<55;
    if(mayPress){
      const picked=choosePresser(ps,ballOwner,team,pr),presser=picked?.p;
      if(presser){
        const ol=local(team,ballOwner.x,ballOwner.y),pl=local(team,presser.x,presser.y),dist=B.dist(presser,ballOwner),commit=clamp((pr.pressing-.28)/.72,0,1),beaten=pl.x>ol.x+0.85;
        const lat=clamp(pl.y-ol.y,-1.8,1.8),shoulder=stableManagerPressSide(m,team,presser,ballOwner,lat);
        if(beaten){
          const recoverY=ol.y+shoulder*(0.72+Math.min(0.45,Math.abs(lat)*0.18)),target=world(team,ol.x-1.20,lerp(pl.y,recoverY,0.18));
          presser.tx=target.x;presser.ty=target.y;presser.sprint=true;presser.tacticalTask='PRESS_CONTAIN';
        }else{
          const pressY=ol.y+shoulder*(0.58+Math.min(0.52,Math.abs(lat)*0.20)),target=world(team,ol.x-1.15,pressY);presser.tx=target.x;presser.ty=target.y;
          presser.sprint=commit>.55&&dist>2.4;presser.tacticalTask=commit>.72?'CLOSE_DOWN':'PRESS_CONTAIN';
          if(m.time-(m.managerTelemetry.lastPressAt[team]||-99)>1.0){m.managerTelemetry.pressEngagements[team]++;m.managerTelemetry.lastPressAt[team]=m.time;}
        }
        applyLaneScreen(m,team,ballOwner,presser,pr);
      }
    }
    enforceManagerGoalSide(m,team,ballOwner);
  }
}
function captureTeamStats(m){
  const mt=m.managerTelemetry;if(!mt)return;
  const passDelta=(m.stats.passes||0)-mt.lastGlobalPasses,progDelta=(m.stats.progressivePasses||0)-mt.lastGlobalProgressive;
  if(passDelta>0){
    let team=null;for(const t of teams)if((m.lastPassAt?.[t]??-99)>(mt.lastPassAtSeen[t]??-99))team=t;
    if(team){mt.passesByTeam[team]+=passDelta;mt.progressivePassesByTeam[team]+=Math.max(0,progDelta);mt.lastPassAtSeen[team]=m.lastPassAt[team];}
  }
  mt.lastGlobalPasses=m.stats.passes||0;mt.lastGlobalProgressive=m.stats.progressivePasses||0;
  for(const team of teams){const q=local(team,m.ball.x,m.ball.y),inside=m.possession===team&&m.ball.mode!=='DEAD'&&q.x>=88.5&&q.y>=13.84&&q.y<=54.16;if(inside&&!mt.ballBoxInside[team]&&m.time-(mt.lastBoxEntryAt[team]||-99)>5){mt.boxEntriesByTeam[team]++;mt.lastBoxEntryAt[team]=m.time;}mt.ballBoxInside[team]=inside;}
  if(mt.lastPossession&&m.possession&&mt.lastPossession!==m.possession&&mt.lastBallMode!=='DEAD'&&m.ball.mode==='CONTROLLED'&&m.ball.ownerId){const owner=B.playerById(m,m.ball.ownerId);if(owner){const l=local(owner.team,owner.x,owner.y);if(l.x>=55)mt.highRegainsByTeam[owner.team]++;}}
  mt.lastPossession=m.possession;mt.lastBallMode=m.ball.mode;
}
function sample(m){
  const mt=m.managerTelemetry;if(!mt)return;
  for(const team of teams){
    const ps=B.teamPlayers(m,team),defs=ps.filter(p=>['CB','FB'].includes(p.role)),mids=ps.filter(p=>p.role==='CM'),boxN=ps.filter(p=>p.role!=='GK'&&inOppBox(team,p)).length;
    if(defs.length)mt.defLineSum[team]+=defs.reduce((s,p)=>s+local(team,p.x,p.y).x,0)/defs.length;
    if(mids.length)mt.supportLineSum[team]+=mids.reduce((s,p)=>s+local(team,p.x,p.y).x,0)/mids.length;
    mt.oppBoxOccupancySum[team]+=boxN;mt.samples[team]++;
  }
}
function preStep(m){if(m.restart)return;for(const team of teams)maybeDecisionBias(m,team);}
function postStep(m){if(!m.restart)for(const team of teams)applyLiveDefensiveTendencies(m,team);captureTeamStats(m);sample(m);}
function summary(m){
  const mt=m.managerTelemetry||{},out={};for(const team of teams){const n=mt.samples?.[team]||1;out[team]={
    profile:m.managerProfiles?.[team]?.id||'NONE',forcedDirectPasses:mt.forcedDirectPasses?.[team]||0,forcedSafePasses:mt.forcedSafePasses?.[team]||0,
    pressEngagements:mt.pressEngagements?.[team]||0,laneScreens:mt.laneScreens?.[team]||0,passes:mt.passesByTeam?.[team]||0,progressivePasses:mt.progressivePassesByTeam?.[team]||0,
    boxEntries:mt.boxEntriesByTeam?.[team]||0,highRegains:mt.highRegainsByTeam?.[team]||0,
    avgDefLine:Number(((mt.defLineSum?.[team]||0)/n).toFixed(2)),avgMidLine:Number(((mt.supportLineSum?.[team]||0)/n).toFixed(2)),avgOppBoxOccupancy:Number(((mt.oppBoxOccupancySum?.[team]||0)/n).toFixed(3))
  };}return out;
}
return{VERSION,PROFILES,init,preStep,postStep,summary};
});
