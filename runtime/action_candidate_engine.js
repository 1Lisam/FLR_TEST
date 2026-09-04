(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_ACTION_CANDIDATE_ENGINE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='TT049-CANDIDATE-ACTION-1.2-RUN-DECISION';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function c(id,score,reason,meta={}){return{id,score:Number(score.toFixed(3)),reason,meta};}
function generate(ctx){
  const out=[];const role=ctx.role,x=ctx.localX,wide=ctx.wide,pressure=ctx.pressure,space=ctx.space,held=ctx.held;
  const shot=ctx.shot||{},pass=ctx.pass||{},early=ctx.earlyCross||null,deep=ctx.deepDelivery||null,takeOn=ctx.takeOn||null;
  const inBox=!!shot.inBox,frontChain=ctx.frontPassChain||0,recycle=!!ctx.recycleActive,clearRunway=!!ctx.clearRunway,attackingReceive=!!ctx.attackingThroughReceive;
  const cleanOpenChance=inBox&&!!shot.openWindow&&(shot.blockers||0)===0&&(shot.dGoal||99)<=18.5&&(shot.centrality??99)<=12.5&&['ST','WF','CM'].includes(role);
  if(['ST','WF','CM'].includes(role)&&(inBox||(x>=78&&shot.dGoal<=27)||(x>=66&&x<78&&shot.dGoal<=40&&(shot.blockers||0)===0&&pressure>=1.15&&(shot.centrality??99)<=16.5))){
    let s=(shot.score||0)*0.68+(shot.oneVOne?7.5:0)+(shot.openWindow?1.8:0)-(shot.blockers||0)*0.55;
    if(inBox&&shot.openWindow&&(shot.blockers||0)===0&&(shot.centrality??99)<=10.5)s+=0.75;
    if(ctx.recentTakeOnWin&&inBox&&(shot.oneVOne||shot.openWindow))s+=2.1;
    if(!inBox)s-=role==='CM'?4.2:2.9;if(attackingReceive&&(shot.blockers||0)===0&&shot.dGoal<=26)s+=0.85;if(ctx.recentTeamShot)s-=2.2;if(!shot.oneVOne&&!shot.clearKeeperChance)s-=6.0;
    const longRange=!inBox&&shot.dGoal>27; if(longRange)s-=2.1;if(shot.turningRequired)s-=1.35+(shot.backToGoal?0.65:0)+(longRange?0.55:0);out.push(c('SHOT',s,longRange?'long_range_open_window':'spatial_shot_window',{dGoal:shot.dGoal,inBox,oneVOne:shot.oneVOne,openWindow:shot.openWindow,longRange,turningRequired:!!shot.turningRequired,backToGoal:!!shot.backToGoal,facingAlignment:shot.facingAlignment}));
  }
  let carry=0.82+clamp(space,0,8)*0.22+(pressure>2.6?0.55:0)+(x>72?0.50:0)-(pressure<1.05?0.55:0);
  if(clearRunway)carry+=3.4;if(space>5.2&&pressure>1.6)carry+=0.68;if(role==='WF'&&wide)carry+=0.42;if(inBox)carry+=0.30;if(wide&&x>=80&&x<92&&['WF','FB'].includes(role))carry+=1.35;if(x>94)carry-=2.4;if(frontChain>=2&&['ST','WF'].includes(role))carry+=1.25;if(attackingReceive)carry+=0.55;
  if(ctx.deepEntryRestricted){
    let entryPenalty=1.15;if(pressure<1.5)entryPenalty+=1.35;else if(pressure<2.2)entryPenalty+=0.75;if(space<2.0)entryPenalty+=0.80;else if(space<4.5)entryPenalty+=0.35;carry-=entryPenalty;
  }
  if(inBox&&(ctx.boxCarryChain||0)>=1)carry-=Math.min(3.2,0.95*(ctx.boxCarryChain||0)+((ctx.boxCarryChain||0)>=2?0.65:0));
  out.push(c('CARRY',carry,'space_and_pressure',{space,pressure,clearRunway}));
  if(takeOn){
    const adv=clamp(takeOn.skillAdvantage??0,-35,35),behind=clamp(takeOn.spaceBehind||0,0,12),dd=clamp(takeOn.defenderDistance||2.5,0.8,5.5);
    let s=1.95+behind*0.060+adv*0.022+(role==='WF'?0.42:role==='ST'?0.18:0.05)+(wide?0.22:0)+(x>62?0.12:0);
    if(dd<1.15)s-=0.75;if(attackingReceive)s+=0.25;if(ctx.recentTakeOn)s-=2.20;if(inBox&&shot.openWindow)s-=1.6;
    out.push(c('TAKE_ON',s,'beat_front_defender',{defenderId:takeOn.defenderId,defenderDistance:dd,spaceBehind:behind,skillAdvantage:adv,wide:!!wide}));
  }
  if(pass.runner){let s=2.65+pass.runner.score*0.46+clamp(pass.runner.leadForward,0,18)*0.085;if(frontChain>=2&&['ST','WF'].includes(role))s-=1.45;if(recycle)s+=0.45;if(['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(pass.runner.task)&&role==='ST')s+=0.65;if(pass.runner.offsideRisk)s-=0.20;out.push(c('THROUGH_PASS',s,'runner_lane',{targetId:pass.runner.targetId,leadForward:pass.runner.leadForward,offsideRisk:!!pass.runner.offsideRisk,offsideMargin:pass.runner.offsideMargin||0,runnerTask:pass.runner.task||null,running:!!pass.runner.running,leadX:pass.runner.leadX??null,leadY:pass.runner.leadY??null}));}
  if(pass.progressive){let s=2.45+pass.progressive.score*0.49+(x<80?0.25:0);if(frontChain>=2&&['ST','WF'].includes(role))s-=1.15;if(recycle)s+=0.75;out.push(c('PROGRESSIVE_PASS',s,'progressive_lane',{targetId:pass.progressive.targetId}));}
  if(early){
    const facing=clamp(early.facingAlignment??0.5,0,1),targetOpen=clamp(early.targetOpen||0,0,6),runners=clamp(early.boxTargets||1,1,4);
    let s=2.95+(x-74)*0.085+targetOpen*0.27+runners*0.31+facing*1.20;
    if(pressure>3.2)s+=0.35;else if(pressure<1.15)s-=0.75;if(held>2.1)s-=0.30;if(!wide)s-=5;
    out.push(c('EARLY_CROSS',s,'wide_early_delivery',{targetId:early.targetId,targetOpen,boxTargets:runners,facingAlignment:facing}));
  }
  if(deep){const id=deep.kind==='CUTBACK'?'CUTBACK':'DEEP_CROSS';let s=3.45+(x>92?1.15:0)+(deep.targetOpen||0)*0.24+(inBox?0.55:0)+(deep.sourceTouchline&&id==='DEEP_CROSS'?0.45:0);if(x>=94&&wide)s+=0.85;out.push(c(id,s,'deep_final_delivery',{targetId:deep.targetId,sourceTouchline:!!deep.sourceTouchline,sourceX:deep.sourceX||x,targetLocalX:deep.targetLocalX,deliveryIntent:deep.deliveryIntent||null}));}
  const deepWideIntent=!!deep&&wide&&x>=92.5;
  if(pass.switch){let s=1.85+pass.switch.score*0.38+(held>1.2?0.45:0)+(recycle?0.65:0);if(deepWideIntent)s-=1.15;out.push(c('SWITCH_PASS',s,'switch_play',{targetId:pass.switch.targetId}));}
  if(pass.safe){let s=1.55+pass.safe.score*0.28+(pressure<1.25?0.75:0)+(held>2.2?0.55:0);if(x>82)s-=0.75;if(deepWideIntent)s-=1.35;if(attackingReceive&&held<1.55)s-=0.35;if(cleanOpenChance)s-=5.0;out.push(c('SAFE_PASS',s,'safe_outlet',{targetId:pass.safe.targetId}));}
  if(pass.recycle&&x>70){let s=1.35+pass.recycle.score*0.26+(held>1.6?0.55:0);if(recycle)s-=0.9;if(deepWideIntent)s-=1.25;if(attackingReceive&&held<1.55)s-=0.55;if(cleanOpenChance)s-=5.5;out.push(c('RECYCLE',s,'reset_attack',{targetId:pass.recycle.targetId}));}
  const hold=1.05+(pressure<1.25?0.55:0)+(held<0.40?0.45:0)+(inBox?0.15:0);out.push(c('HOLD',hold,'retain_and_scan'));
  out.push(c('TURN_BACK',0.65+(pressure<0.95?0.55:0)+(space<1.5?0.45:0),'escape_dead_end'));
  return out.sort((a,b)=>b.score-a.score);
}
function top(ctx){return generate(ctx)[0]||null;}
function commitment(candidate,ctx){
  if(!candidate)return 0;const shot=ctx.shot||{},pressure=ctx.pressure,held=ctx.held;
  switch(candidate.id){
    case 'SHOT':{
      if(shot.oneVOne)return 1;if(shot.inBox&&shot.dGoal<=9.5&&(shot.blockers||0)===0)return 1;
      // An open central box window must be a real option, not a ~5% lottery that repeatedly
      // turns into another carry. It is still not forced: distance, role and possession time
      // determine how quickly the attacker commits to the finish.
      if(shot.inBox&&shot.openWindow&&(shot.blockers||0)===0){
        // A visible shooting lane is a real option, but wide/long box entries should not
        // automatically become a shot every possession. Central ST windows keep priority;
        // marginal-angle WF windows more often continue with a pass/carry/cut-back.
        let p=0.022;
        if(shot.dGoal<=14.5)p+=0.045;else if(shot.dGoal<=18.0)p+=0.015;
        const centrality=shot.centrality??99;
        if(centrality<=10.5)p+=0.030;
        if(ctx.role==='ST')p+=0.028;else if(ctx.role==='WF')p+=0.020;else if(ctx.role==='CM')p+=0.012;
        if(shot.dGoal>17.0)p*=0.80;
        if(shot.dGoal>20.0)p*=0.72;
        if(centrality>12.5)p*=0.60;
        if(ctx.role==='WF'&&centrality>11.5)p*=0.78;
        p+=Math.min(2.0,Math.max(0,held))*0.012;
        if(ctx.recentTakeOnWin)p+=0.16;
        if(ctx.attackingThroughReceive)p+=0.035;
        if(ctx.recentTeamShot)p*=0.55;
        return clamp(p,0.018,0.22);
      }
      let p=shot.inBox?0.018:0.004;if(shot.openWindow)p+=0.025;if((shot.blockers||0)===0)p+=0.010;if(shot.dGoal<=14)p+=0.015;if(pressure>2.4)p+=0.006;if(ctx.recentTeamShot)p*=0.22;return clamp(p,0.003,0.085);
    }
    case 'THROUGH_PASS': return clamp(0.030+(candidate.meta?.leadForward||0)*0.003+(pressure>2.2?0.010:0),0.030,0.105);
    case 'EARLY_CROSS': return clamp(0.045+(candidate.meta?.facingAlignment||0)*0.045+(candidate.meta?.boxTargets||1)*0.010,0.050,0.135);
    // INTERNAL V0.6 rhythm: keep the accepted cut-back as a strong final-third action,
    // but do not turn every deep wide possession into an immediate aerial cross.
    case 'DEEP_CROSS': return candidate.meta?.sourceX>=94?0.22:(candidate.meta?.sourceTouchline?0.13:0.09);
    case 'CUTBACK': return candidate.meta?.sourceX>=94?0.35:0.28;
    case 'PROGRESSIVE_PASS': return 0.82;
    case 'SWITCH_PASS': return held>1.1?0.62:0.42;
    case 'SAFE_PASS': return 0.58;
    case 'RECYCLE': return 0.48;
    case 'TAKE_ON': return clamp(0.065+(candidate.meta?.skillAdvantage||0)*0.0028+(candidate.meta?.spaceBehind||0)*0.005+(candidate.meta?.wide?0.020:0)+(ctx.attackingThroughReceive?0.08:0),0.045,0.32);
    case 'CARRY':{const chain=ctx.boxCarryChain||0;if(ctx.deepEntryRestricted)return pressure<1.5?0.14:0.24;if((ctx.shot||{}).inBox&&chain>=2)return ctx.clearRunway?0.46:0.28;if((ctx.shot||{}).inBox&&chain===1)return ctx.clearRunway?0.70:0.42;return ctx.clearRunway?1:0.62;}
    case 'HOLD': case 'TURN_BACK': return 1;
    default:return 0.8;
  }
}
return{VERSION,generate,top,commitment};
});
