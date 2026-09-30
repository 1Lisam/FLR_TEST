'use strict';
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');
function chk(id,pass,detail){return{id,pass:!!pass,detail};}
function place(m,id,x,y){const p=m.playersById[id];p.x=x;p.y=y;p.tx=x;p.ty=y;p.vx=0;p.vy=0;return p;}
function setup(seed,ownerId,x,y){
 const m=E.createMatch(seed,{telemetry:{}});m.time=100;m.possession='AWAY';m._lastTacticalPossession='AWAY';m.transitionUntil=0;m.restart=null;
 const o=place(m,ownerId,x,y);m.ball.mode='CONTROLLED';m.ball.ownerId=ownerId;m.ball.x=x;m.ball.y=y;m.ball.vx=0;m.ball.vy=0;m.ball.kind=null;m.ball.controlledSince=98;
 o.controlledSince=98;return m;
}
const out=[];
// G7-A: higher wide carrier + genuinely nearby front player -> front pressure, FB depth cover.
{
 const m=setup('G7-WIDE-FRONT','A-RW',42,12);
 place(m,'H-LW',38,12); place(m,'H-LCM',48,17); place(m,'H-LB',31,12); place(m,'H-LCB',26,27); place(m,'H-RCB',25,41);
 T.assign(m); const lock=m._defenceRoleLocks?.HOME||{}; const lb=m.playersById['H-LB']; const lw=m.playersById['H-LW'];
 out.push(chk('G7_WIDE_FRONT_PRIMARY_IS_NEAR_FRONT_PLAYER',lock.pressId==='H-LW',{lock,lwTask:lw.tacticalTask,lbTask:lb.tacticalTask}));
 const carrier=m.playersById['A-RW'];
 const lbDepthCover=lb.tx<=carrier.x-2.0&&Math.abs(lb.ty-carrier.y)<=10.0&&!['ENGAGE','PRESS_CONTAIN','CLOSE_DOWN'].includes(lb.tacticalTask);
 out.push(chk('G7_SAME_SIDE_FB_IS_DEPTH_COVER',lbDepthCover,{lock,lbTask:lb.tacticalTask,carrier:[carrier.x,carrier.y],lb:[lb.x,lb.y],lbTarget:[lb.tx,lb.ty]}));
 out.push(chk('G7_FB_REMAINS_GOALSIDE_OF_WIDE_CARRIER',lb.tx<=carrier.x+0.35,{carrierX:carrier.x,lbX:lb.x,lbTx:lb.tx}));
}
// G7-B: once the wide carrier is deep, the same-side FB owns direct containment.
{
 const m=setup('G7-WIDE-DEEP','A-RW',20,11);
 place(m,'H-LW',32,12); place(m,'H-LCM',30,18); place(m,'H-LB',17.5,11.5); place(m,'H-LCB',15,27); place(m,'H-RCB',14,41);
 T.assign(m); const lock=m._defenceRoleLocks?.HOME||{}; const rw=m.playersById['A-RW'];
 const dup=m.players.filter(p=>p.team==='HOME'&&p.id!==lock.pressId&&p.markTargetId===rw.id&&['CM','CB'].includes(p.role));
 out.push(chk('G7_DEEP_WIDE_FB_CAN_OWN_PRIMARY',lock.pressId==='H-LB',{lock,task:m.playersById['H-LB'].tacticalTask}));
 out.push(chk('G7_NO_CM_CB_DUPLICATE_WIDE_PRIMARY',dup.length===0,dup.map(p=>({id:p.id,role:p.role,task:p.tacticalTask,mark:p.markTargetId}))));
}
// G7-C: a far front player must recover defensively but not steal unique primary ownership from an arrived FB.
{
 const m=setup('G7-WIDE-FAR-RECOVER','A-RW',42,12);
 place(m,'H-LW',58,12); place(m,'H-LCM',55,18); place(m,'H-LB',35,12); place(m,'H-LCB',27,27); place(m,'H-RCB',26,41);
 T.assign(m); const lock=m._defenceRoleLocks?.HOME||{},front=['H-LW','H-LCM'].map(id=>m.playersById[id]);
 const recovering=front.filter(p=>p.id!==lock.pressId&&p.tx<p.x-0.25&&!['ENGAGE','PRESS_CONTAIN','CLOSE_DOWN'].includes(p.tacticalTask));
 out.push(chk('G7_FAR_FRONT_DOES_NOT_STEAL_PRIMARY',lock.pressId==='H-LB',{lock,front:front.map(p=>({id:p.id,task:p.tacticalTask})),fbTask:m.playersById['H-LB'].tacticalTask}));
 out.push(chk('G7_FAR_FRONT_SHOWS_DEFENSIVE_RECOVERY',recovering.length>=1,{front:front.map(p=>({id:p.id,task:p.tacticalTask,x:p.x,tx:p.tx})),recovering:recovering.map(p=>p.id)}));
}
// G8-A: central ST has beaten one CB. Beaten CB chases; partner CB is last cover.
{
 const m=setup('G8-LAST-COVER','A-ST',22,34);
 place(m,'H-LCB',24.2,33); place(m,'H-RCB',17.2,38); place(m,'H-CM',26,34); place(m,'H-LCM',29,25); place(m,'H-RCM',29,43);
 T.assign(m);const lock=m._defenceRoleLocks?.HOME||{},lcb=m.playersById['H-LCB'],rcb=m.playersById['H-RCB'];
 out.push(chk('G8_BEATEN_CB_RECOVERY_PRESS',lock.pressId==='H-LCB'&&lcb.tacticalTask==='RECOVERY_CHASE',{lock,lcbTask:lcb.tacticalTask}));
 out.push(chk('G8_PARTNER_CB_LAST_COVER',lock.coverId==='H-RCB'&&['SHOT_LANE_COVER','LAST_COVER_SCREEN'].includes(rcb.tacticalTask),{lock,rcbTask:rcb.tacticalTask,rcbTarget:[rcb.tx,rcb.ty]}));
 out.push(chk('G8_LAST_COVER_IS_GOALSIDE',rcb.tx<m.playersById['A-ST'].x,{stX:m.playersById['A-ST'].x,rcbX:rcb.x,rcbTx:rcb.tx}));
 const cmSt=m.players.filter(p=>p.team==='HOME'&&p.role==='CM'&&p.markTargetId==='A-ST');
 out.push(chk('G8_CM_NEVER_BODY_MARKS_CENTRAL_ST_DEEP',cmSt.length===0,cmSt.map(p=>({id:p.id,task:p.tacticalTask}))));
}
// G8-B: normal central threat uses a CB as primary and the other CB as cover, never two direct pressers.
{
 const m=setup('G8-CB-PAIR','A-ST',27,34);
 place(m,'H-LCB',22.2,31.5); place(m,'H-RCB',21.8,38.5); place(m,'H-CM',25.5,34); place(m,'H-LCM',30,24); place(m,'H-RCM',30,44);
 T.assign(m);const lock=m._defenceRoleLocks?.HOME||{};const p=m.playersById[lock.pressId],c=m.playersById[lock.coverId];
 out.push(chk('G8_CENTRAL_ST_PRIMARY_IS_CB',p?.role==='CB',{lock,press:p&&{id:p.id,role:p.role,task:p.tacticalTask}}));
 out.push(chk('G8_CENTRAL_ST_COVER_IS_OTHER_CB',c?.role==='CB'&&c.id!==p?.id,{lock,cover:c&&{id:c.id,role:c.role,task:c.tacticalTask}}));
 const direct=m.players.filter(q=>q.team==='HOME'&&['ENGAGE','PRESS_CONTAIN','RECOVERY_CHASE'].includes(q.tacticalTask));
 out.push(chk('G8_ONE_DIRECT_CENTRAL_PRESSER',direct.length===1,{direct:direct.map(q=>({id:q.id,task:q.tacticalTask}))}));
}
const pass=out.every(x=>x.pass);console.log(JSON.stringify({pass,results:out},null,2));if(!pass)process.exit(1);
