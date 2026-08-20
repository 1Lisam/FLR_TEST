(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_BALL_STRIKE_MODEL=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='STEP72-BALL-STRIKE-0.3-FACING';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function passPlan(ctx={}){
  const kind=String(ctx.kind||'PASS'),d=Math.max(0.1,Number(ctx.distance)||1),mode=ctx.deliveryMode==='AERIAL'?'AERIAL':'GROUND';
  const pressure=Number(ctx.pressure)||99,targetSpeed=Number(ctx.targetSpeed)||0,forward=Number(ctx.forward)||0;
  const passSkill=clamp(Number(ctx.passSkill)||60,1,100),quality=(passSkill-60)/100;
  let style='FIRM_GROUND',arrival=0.90,speed=16,loft=0.10;
  if(kind==='CUTBACK'){
    style='CUTBACK';arrival=clamp(0.54+d/58,0.60,0.92);speed=clamp(d/arrival+quality*0.8,14.2,20.5);loft=0.08;
  }else if(kind==='CROSS'){
    style=ctx.sourceX>=94?'BYLINE_CROSS':'CROSS';arrival=clamp(0.82+d/48,0.95,1.45);speed=clamp(d/arrival+3.6+quality*1.1,18.2,25.2);loft=ctx.sourceX>=94?2.65:3.05;
  }else if(kind==='THROUGH'){
    if(mode==='AERIAL'){
      style='LOFTED_THROUGH';arrival=clamp(0.95+d/41,1.12,1.72);speed=clamp(d/arrival+3.0+quality,16.0,23.8);loft=1.55;
    }else{
      style='THROUGH_GROUND';arrival=clamp(0.60+d/45-(targetSpeed>4?0.07:0),0.72,1.28);speed=clamp(d/arrival+quality*1.0,16.0,24.5);loft=0.07;
    }
  }else if(kind==='LONG_PASS'){
    if(mode==='AERIAL'){
      style='LOFTED_LONG';arrival=clamp(1.05+d/35,1.35,2.25);speed=clamp(d/arrival+5.2+quality*1.1,17.0,25.0);loft=2.25;
    }else{
      style='DRIVEN_LONG';arrival=clamp(0.78+d/48,1.05,1.62);speed=clamp(d/arrival+quality*1.2,18.0,26.0);loft=0.08;
    }
  }else{
    if(d<=9.5&&forward<8){
      style='SHORT_GROUND';arrival=clamp(0.48+d/34,0.55,0.78);speed=clamp(d/arrival+quality*0.7,9.5,15.5);loft=0.06;
    }else{
      style='FIRM_GROUND';arrival=clamp(0.56+d/43-(pressure<1.55?0.06:0),0.68,1.12);speed=clamp(d/arrival+quality*0.9,13.8,21.8);loft=0.07;
    }
  }
  // A pressured ball-carrier tends to punch a ground pass more firmly; aerial balls are not sped up artificially.
  if(mode==='GROUND'&&pressure<1.55&&kind!=='CUTBACK')speed=clamp(speed+0.8,9.5,26.0);
  return{style,speed:Number(speed.toFixed(3)),loft:Number(loft.toFixed(3)),arrival:Number(arrival.toFixed(3))};
}
function shotPlan(ctx={}){
  const d=Number(ctx.dGoal)||18,oneVOne=!!ctx.oneVOne,open=!!ctx.openWindow,centrality=Math.abs(Number(ctx.centrality)||0),pressure=Number(ctx.pressure)||2;
  const finishing=clamp(Number(ctx.finishing)||60,1,100),longShots=clamp(Number(ctx.longShots)||60,1,100),flair=clamp(Number(ctx.flair)||60,1,100),control=clamp(Number(ctx.ballControl)||60,1,100);
  const gkAdvance=Math.max(0,Number(ctx.gkAdvance)||0),roll=clamp(Number(ctx.roll)||0,0,0.999999),turning=!!ctx.turningRequired,backToGoal=!!ctx.backToGoal;
  let style='POWER',loft=0.20,curve=0,speedMin=24,speedMax=30;
  if(turning){style='TURNING';loft=backToGoal?0.24:0.21;speedMin=21.5;speedMax=27.0;const t=clamp((d-7)/23,0,1),speed=speedMin+(speedMax-speedMin)*(0.35+0.65*t);return{style,loft:Number(loft.toFixed(3)),curve:0,speed:Number(speed.toFixed(3))};}
  // Chip is deliberately rare and contextual: a true breakaway plus a keeper well off the line.
  const chipP=oneVOne&&d<=14&&gkAdvance>=5.0?clamp(0.05+(flair-55)*0.002+(control-55)*0.0015+(gkAdvance-5)*0.025,0.05,0.28):0;
  if(roll<chipP){
    style='CHIP';
    const technique=(finishing+flair+control)/300,chipExec=chipP>0?clamp(roll/chipP,0,1):0.5;
    loft=clamp(2.65+gkAdvance*0.090+(technique-0.55)*2.00+(chipExec-0.5)*0.25,2.85,4.05);
    speedMin=11.8;speedMax=14.8;
  }else{
    const placedBase=(oneVOne?0.44:open?0.22:0)+(finishing-55)*0.0025+(control-55)*0.0015-(pressure<1.1?0.05:0);
    const curlWindow=d>=12&&d<=25&&centrality>=4&&centrality<=18;
    const curlP=curlWindow?clamp(0.08+(flair-55)*0.0025+(longShots-55)*0.0020+(finishing-55)*0.0012,0.06,0.34):0;
    if(roll<chipP+curlP){style='CURLED';loft=0.28;curve=clamp(7.4+(flair-50)*0.075+(longShots-50)*0.055,6.8,13.2);speedMin=22.0;speedMax=27.2;}
    else if(roll<chipP+curlP+clamp(placedBase,0.08,0.58)){style='PLACED';loft=0.18;speedMin=21.5;speedMax=27.0;}
  }
  const t=clamp((d-7)/23,0,1),speed=speedMin+(speedMax-speedMin)*(0.35+0.65*t);
  return{style,loft:Number(loft.toFixed(3)),curve:Number(curve.toFixed(3)),speed:Number(speed.toFixed(3))};
}
return{VERSION,passPlan,shotPlan};
});
