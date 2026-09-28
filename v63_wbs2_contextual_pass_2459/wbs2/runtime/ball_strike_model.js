(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_BALL_STRIKE_MODEL=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='TT051-BALL-STRIKE-0.4-THROUGH-DECEL';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Open-play lobs lose horizontal speed continuously in the air.  This is kept in
// the pure planner too: the launch is compensated from current geometry so the
// nominal, no-contact trajectory still arrives at the same current-state aim.
const OPEN_PLAY_LOB_AIR_DRAG=0.20;
function groundDragFor(distance,arrival,initialSpeed){
  const d=Math.max(0.1,Number(distance)||0.1),t=Math.max(0.1,Number(arrival)||0.1),v=Math.max(0.1,Number(initialSpeed)||0.1);
  if(v*t<=d*1.015)return 0.11;
  let lo=0.001,hi=4.0;
  for(let i=0;i<36;i++){const k=(lo+hi)/2,travel=v/k*(1-Math.exp(-k*t));if(travel>d)lo=k;else hi=k;}
  return Number(((lo+hi)/2).toFixed(4));
}
function passPlan(ctx={}){
  if(ctx.physicsProfile==='OPEN_PLAY_LOB_V1')return openPlayLobPlan(ctx);
  const kind=String(ctx.kind||'PASS'),d=Math.max(0.1,Number(ctx.distance)||1),mode=ctx.deliveryMode==='AERIAL'?'AERIAL':'GROUND';
  const pressure=Number(ctx.pressure)||99,targetSpeed=Number(ctx.targetSpeed)||0,forward=Number(ctx.forward)||0,targetLeadDistance=Math.max(0,Number(ctx.targetLeadDistance)||0);
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
      style='THROUGH_GROUND';const runnerArrival=targetSpeed>1.6&&targetLeadDistance>1.5?targetLeadDistance/targetSpeed:0,physicsFloor=d/22.5;arrival=runnerArrival>0?clamp(Math.max(physicsFloor,runnerArrival),0.82,2.85):clamp(0.72+d/41-(targetSpeed>4?0.03:0),0.84,1.55);const avg=d/arrival;speed=clamp(Math.max(avg*1.42,runnerArrival>0?13.2:12.4)+quality*0.18,12.4,24.8);loft=0.07;
    }
  }else if(kind==='LONG_PASS'){
    if(mode==='AERIAL'){
      style='LOFTED_LONG';arrival=clamp(1.05+d/35,1.35,2.25);speed=clamp(d/arrival+5.2+quality*1.1,17.0,25.0);loft=2.25;
    }else{
      style='DRIVEN_LONG';arrival=clamp(0.78+d/48,1.05,1.62);speed=clamp(d/arrival+0.8+quality*1.2,18.0,26.0);loft=0.08;
    }
  }else{
    if(d<=9.5&&forward<8){
      style='SHORT_GROUND';arrival=clamp(0.54+d/32,0.62,0.88);speed=clamp(d/arrival+quality*0.7,8.5,12.8);loft=0.06;
    }else{
      style='FIRM_GROUND';arrival=clamp(0.72+d/34-(pressure<1.55?0.04:0),0.86,1.48);speed=clamp(d/arrival+quality*0.9,10.5,16.8);loft=0.07;
    }
  }
  // A pressured ball-carrier tends to punch a ground pass more firmly; aerial balls are not sped up artificially.
  if(mode==='GROUND'&&pressure<1.55&&kind!=='CUTBACK')speed=clamp(speed+0.6,8.5,22.0);
  // Preserve the old physical arrival window, then solve the rolling integral
  // for the stronger drag. This changes the pace profile, not the current aim.
  let groundDragK=mode!=='GROUND'?null:kind==='THROUGH'?groundDragFor(d,arrival,speed):null;
  const rolling=mode==='GROUND'?{SHORT_GROUND:[.38,.70,14],FIRM_GROUND:[.24,.50,20],DRIVEN_LONG:[.20,.42,30]}[style]:null;
  if(rolling){
    const [oldDrag,drag,cap]=rolling;
    const oldArrival=-Math.log(Math.max(.05,1-d*oldDrag/speed))/oldDrag;
    arrival=clamp(oldArrival,.45,3.4);groundDragK=drag;
    speed=d*drag/-Math.expm1(-drag*arrival);
    if(speed>cap){
      // Cap the launch by relaxing drag, not by stranding the ball short of aim.
      // Very long driven lanes need a feasible duration before solving the integral.
      speed=cap;arrival=Math.max(arrival,d/(cap-4));
      groundDragK=Math.min(drag,groundDragFor(d,arrival,speed));
    }
    arrival=-Math.log(Math.max(.01,1-d*groundDragK/speed))/groundDragK;
  }
  let ordinaryAirDragK;
  if(ctx.ordinaryOpenPlay===true&&mode==='AERIAL'&&['LONG_PASS','THROUGH','CROSS'].includes(kind)){
    const lateral=Math.abs(Number(ctx.lateral)||0),wideSwitch=lateral>=26&&(d>=34||ctx.switchPlay)||lateral>=20&&ctx.switchPlay;
    const recycle=!!ctx.recycle||!!ctx.backward||forward< -4;
    const penetrating=kind==='THROUGH'||ctx.running&&ctx.penetrating&&forward>10&&!recycle;
    // Relative game pacing, not measured football constants: retain quick crosses/
    // penetration, give neutral lofts time, and give switches/recycles a higher arc.
    // Flight stays inside the existing 4.2s loose-ball timeout. The integral below
    // preserves the current aim despite drag; no receiver/result is predicted.
    if(kind==='CROSS'){arrival=clamp(d/23.5,1.35,3.8);ordinaryAirDragK=.10;}
    else if(penetrating){style='LOFTED_THROUGH';arrival=clamp(d/23,1.12,3.8);ordinaryAirDragK=.12;}
    else if(wideSwitch||recycle){style=recycle?'LOFTED_RECYCLE':'LOFTED_SWITCH';arrival=clamp(1.35+d/27,1.8,3.9);ordinaryAirDragK=.18;}
    else{style='LOFTED_LONG';arrival=clamp(1.05+d/35,1.35,3.8);ordinaryAirDragK=.16;}
    speed=d*ordinaryAirDragK/-Math.expm1(-ordinaryAirDragK*arrival);
    // setBallFlight starts these arcs at z=.15; solve the matching ground arrival.
    const vz=(4.905*arrival*arrival-.15)/arrival;loft=vz*vz/(2*9.81);
  }
  return{style,speed:Number(speed.toFixed(3)),loft:Number(loft.toFixed(3)),arrival:Number(arrival.toFixed(3)),groundDragK,
    ...(ordinaryAirDragK===undefined?{}:{ordinaryAirDragK})};
}
// Pure current-state intent only. No RNG, player stepping or reception prediction.
function openPlayLobPlan(ctx){
  const o=ctx.origin,t=ctx.target;
  if(!o||!t||![o.x,o.y,o.z,t.x,t.y,t.vx,t.vy].every(Number.isFinite)||o.z<0)return null;
  const leadScale=Math.min(1,4/Math.max(0.001,Math.hypot(t.vx,t.vy)));
  const aim={x:clamp(t.x+t.vx*leadScale,0,105),y:clamp(t.y+t.vy*leadScale,0,68)};
  const distance=Math.hypot(aim.x-o.x,aim.y-o.y),arrival=clamp(1.1+distance/50,1.25,1.9);
  // Integral of v0*exp(-kt) is v0*(1-exp(-kt))/k.  Solving that integral
  // for v0 compensates drag without anticipating a receiver or a result.
  const airDragK=OPEN_PLAY_LOB_AIR_DRAG,travelFactor=(1-Math.exp(-airDragK*arrival))/airDragK;
  const vx=(aim.x-o.x)/travelFactor,vy=(aim.y-o.y)/travelFactor,vz=(4.905*arrival*arrival-o.z)/arrival;
  if(distance<3||distance>40||Math.hypot(vx,vy)>26||vz<=0||vz>10)return null;
  const skill=clamp(Number(ctx.passSkill)||60,1,100),control=clamp(Number(ctx.ballControl)||60,1,100);
  const pressure=clamp((3-(Number.isFinite(ctx.pressure)?ctx.pressure:99))/3,0,1);
  const movement=clamp((Number(ctx.sourceSpeed)||0)/8,0,1),misalignment=clamp(Math.abs(Number(ctx.misalignment)||0)/Math.PI,0,1);
  const difficulty=(200-skill-control)/200+pressure*.35+movement*.15+misalignment*.25;
  return{physicsProfile:'OPEN_PLAY_LOB_V1',style:'OPEN_PLAY_LOB',aim,arrival,vx,vy,vz,airDragK,
    error:{azimuth:clamp(.015+difficulty*.06,.015,.10),horizontal:clamp(.025+difficulty*.10,.025,.18),vertical:clamp(.025+difficulty*.08,.025,.15)}};
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
