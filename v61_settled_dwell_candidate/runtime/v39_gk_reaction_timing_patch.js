(function(root){'use strict';
const E=(root&&root.FLRPG_CONTINUOUS_CORE)||((typeof require==='function')?require('./continuous_match_core.js'):null);if(!E||E.__v39GKReactionTiming)return;
const VERSION='V39-GK-REACTION-TIMING-0.2';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const other=t=>t==='HOME'?'AWAY':'HOME';
const value=(m,p,k)=>{const q=m?.playerAbilityProfiles?.[p?.id];return q&&Number.isFinite(q[k])?q[k]:60;};
function primeLiveShotDive(m){
  const b=m?.ball;if(!b||b.mode!=='FLIGHT'||b.kind!=='SHOT'||b.onTarget===false||!Number.isFinite(Number(b.shotTargetY)))return;
  const def=other(b.shotTeam||b.lastTouchTeam),gk=(m.players||[]).find(p=>p.team===def&&p.role==='GK');if(!gk||b.gkRush)return;
  /* Elite keepers can begin a visible response around 160-180ms. This is only
   * a live reaction gate; it does not decide save/goal outcome. */
  const reaction=clamp(.170-(value(m,gk,'reaction')-60)*.0010-(value(m,gk,'gk_positioning')-60)*.00035,.125,.220);
  const age=Number(b.age||0);if(age<reaction)return;
  const gap=Math.hypot(Number(b.x)-Number(gk.x),Number(b.y)-Number(gk.y));
  const approachEnvelope=clamp(9.0+(value(m,gk,'reaction')-60)*.012,8.6,9.4);if(gap>approachEnvelope)return;
  const rawDelta=Number(b.shotTargetY)-Number(gk.y),maxDisplacement=clamp(1.90+(value(m,gk,'diving')-60)*.006,1.72,2.05),delta=clamp(rawDelta,-maxDisplacement,maxDisplacement),side=Math.sign(delta)||Math.sign(rawDelta)||1,targetY=clamp(Number(gk.y)+delta,.8,67.2);
  if(!b.v37DiveIntent)b.v37DiveIntent={version:VERSION,gkId:gk.id,shotTargetY:Number(b.shotTargetY),side,createdAt:m.time,v39EarlyReaction:true};
  if(!b.gkParryReach){
    b.gkParryReach={startedAt:m.time,startX:gk.x,startY:gk.y,targetX:gk.x,targetY,displacement:Math.abs(targetY-gk.y),approachStartGap:gap,side,v37LockedIntent:true,v37ShotTargetY:Number(b.shotTargetY),v39EarlyReaction:true,v39ApproachEnvelope:approachEnvelope};
  }else if(!b.gkParryReach.v39EarlyReaction&&Number(b.gkParryReach.displacement||0)<Math.abs(delta)){
    b.gkParryReach.targetY=targetY;b.gkParryReach.displacement=Math.abs(targetY-gk.y);b.gkParryReach.side=side;b.gkParryReach.v39EarlyReaction=true;b.gkParryReach.v39ApproachEnvelope=approachEnvelope;
  }
  if(!gk.v37DiveProfile){
    gk.vx=0;gk.vy=0;gk.v37DiveProfile={startedAt:m.time,duration:.48,startX:gk.x,startY:gk.y,targetX:gk.x,targetY,side,maxSpeed:clamp(6.75+(value(m,gk,'diving')-60)*.015+(value(m,gk,'agility')-60)*.010,6.2,7.5),recoverUntil:m.time+.72,v39EarlyReaction:true};
  }
  if(!gk.v37DivePresentation){
    gk.v37DivePresentation={startedAt:m.time-.08,side,originX:gk.x,originY:gk.y,resultAt:null,outcome:null,holdUntil:0,v39EarlyReaction:true};
  }
}
const base=E.step.bind(E);
E.step=function(m,dt){primeLiveShotDive(m);return base(m,dt);};
E.V39_GK_REACTION_TIMING_VERSION=VERSION;E.__v39GKReactionTiming=true;
})(typeof globalThis!=='undefined'?globalThis:this);
