'use strict';
const E=require('../runtime/continuous_match_core.js');
const T=require('../runtime/tactical_movement.js');
const H=require('../live_hybrid_session_v02.js');
function chk(id,pass,detail){return{id,pass:!!pass,detail};}
function place(m,id,x,y){const p=m.playersById[id];p.x=x;p.y=y;p.tx=x;p.ty=y;p.vx=0;p.vy=0;return p;}
function setup(seed,ownerId,x,y){const m=E.createMatch(seed,{telemetry:{}});m.time=100;m.possession='AWAY';m._lastTacticalPossession='AWAY';m.transitionUntil=0;m.restart=null;const o=place(m,ownerId,x,y);m.ball.mode='CONTROLLED';m.ball.ownerId=ownerId;m.ball.x=x;m.ball.y=y;m.ball.vx=0;m.ball.vy=0;m.ball.kind=null;m.ball.controlledSince=98;o.controlledSince=98;return m;}
const out=[];
// 1. No rapid semantic orbit/churn under micro ball movement.
{
 const m=setup('G10-ORBIT','A-ST',31,20);place(m,'H-RCM',34,22);place(m,'H-CM',36,30);place(m,'H-RB',28,54);place(m,'H-RCB',24,38);
 const p=m.playersById['H-RCM'],hist=[];for(let i=0;i<12;i++){m.time=100+i*.1;m.ball.x=31+Math.sin(i*.7)*.18;m.ball.y=20+Math.cos(i*.6)*.16;const o=m.playersById['A-ST'];o.x=m.ball.x;o.y=m.ball.y;T.assign(m);hist.push(`${p.tacticalTask}|${p.markTargetId||'-'}`);}let switches=0;for(let i=1;i<hist.length;i++)if(hist[i]!==hist[i-1])switches++;
 out.push(chk('G10_1_NO_CM_ORBIT_FROM_MICRO_CHURN',switches<=2,{switches,hist}));
}
// 2/3/4. Duplicate ownership must not collapse CM+CB+FB or CM+FB onto one threat, mirrored both sides.
function duplicateScenario(side){const left=side==='LEFT',owner=left?'A-RW':'A-LW',wx=29,wy=left?12:56,m=setup(`G10-DUP-${side}`,owner,wx,wy);place(m,left?'H-LB':'H-RB',24,wy);place(m,left?'H-LCM':'H-RCM',33,left?17:51);place(m,left?'H-LW':'H-RW',35,wy);place(m,left?'H-LCB':'H-RCB',22,left?27:41);place(m,left?'H-RCB':'H-LCB',21,left?41:27);place(m,'A-ST',28,34);T.assign(m);return m;}
for(const side of ['LEFT','RIGHT']){const m=duplicateScenario(side),wid=side==='LEFT'?'A-RW':'A-LW',fb=m.playersById[side==='LEFT'?'H-LB':'H-RB'],cm=m.playersById[side==='LEFT'?'H-LCM':'H-RCM'],cb=m.playersById[side==='LEFT'?'H-LCB':'H-RCB'];const direct=[fb,cm,cb].filter(p=>p.markTargetId===wid||(['ENGAGE','PRESS_CONTAIN','RECOVERY_CHASE'].includes(p.tacticalTask)&&m._defenceRoleLocks?.HOME?.pressId===p.id));out.push(chk(`G10_${side}_NO_DUPLICATE_WIDE_OWNERSHIP`,direct.length<=1,{direct:direct.map(p=>({id:p.id,task:p.tacticalTask,mark:p.markTargetId})),lock:m._defenceRoleLocks?.HOME}));const trio=[fb,cm,cb],pairs=[];for(let i=0;i<trio.length;i++)for(let j=i+1;j<trio.length;j++)pairs.push([trio[i].id,trio[j].id,Math.hypot(trio[i].tx-trio[j].tx,trio[i].ty-trio[j].ty)]);out.push(chk(`G10_${side}_NO_THREE_MAN_TARGET_COLLAPSE`,pairs.filter(x=>x[2]<2.0).length===0,{pairs}));}
// 5. Hybrid entry: inherited attacking CM motion must not be immediately assigned a strongly backward target.
{
 const m=E.createMatch('G10-INTENT-SEAM',{telemetry:{}});m.time=100;m.possession='HOME';m._lastTacticalPossession='HOME';const ids=['H-LCM','H-RCM'];const before={};for(const id of ids){const p=m.playersById[id];p.x=id==='H-LCM'?64:63;p.y=id==='H-LCM'?25:45;p.vx=6.0;p.vy=0;p.tx=p.x+5;p.ty=p.y;before[id]={x:p.x,y:p.y,vx:p.vx,vy:p.vy,tx:p.tx,ty:p.ty};}m._hybridEntryContinuity={startedAt:m.time,shapeDelayUntil:m.time+.55,fadeUntil:m.time+6,players:Object.fromEntries(m.players.map(p=>[p.id,{x:p.x,y:p.y,vx:p.vx||0,vy:p.vy||0,tx:p.tx??p.x,ty:p.ty??p.y,task:p.tacticalTask||p.action||null,markTargetId:p.markTargetId||null,offsetX:null,offsetY:null}]))};T.assign(m);const proj=ids.map(id=>{const p=m.playersById[id],b=before[id],dx=p.tx-p.x,dy=p.ty-p.y;return{id,forwardProjection:(dx*b.vx+dy*b.vy)/Math.max(.001,Math.hypot(b.vx,b.vy)),target:[p.tx,p.ty],pos:[p.x,p.y]};});out.push(chk('G10_5_NO_IMMEDIATE_ATTACKING_CM_REVERSE_TARGET',proj.every(x=>x.forwardProjection>=-0.5),proj));
}
// 6. If FB already owns a wide threat, free CB must preserve central/depth responsibility rather than chase same winger.
{
 const m=setup('G10-FREE-CB','A-RW',20,11);place(m,'A-ST',23,34);place(m,'H-LB',17.5,11.5);place(m,'H-LCB',16,29);place(m,'H-RCB',15,39);place(m,'H-LCM',29,19);T.assign(m);const cbs=['H-LCB','H-RCB'].map(id=>m.playersById[id]),wideTake=cbs.filter(p=>p.markTargetId==='A-RW');const central=cbs.filter(p=>p.markTargetId==='A-ST'||['SHOT_LANE_COVER','LAST_COVER_SCREEN'].includes(p.tacticalTask));out.push(chk('G10_6_FREE_CB_DOES_NOT_TAKE_FB_WINGER',wideTake.length===0,{cbs:cbs.map(p=>({id:p.id,task:p.tacticalTask,mark:p.markTargetId,tx:p.tx,ty:p.ty})),lock:m._defenceRoleLocks?.HOME}));out.push(chk('G10_6_CB_CENTRAL_DEPTH_RESPONSIBILITY_EXISTS',central.length>=1,{central:central.map(p=>({id:p.id,task:p.tacticalTask,mark:p.markTargetId}))}));
}
// 7. "New seed" must change categorical football context, not only sub-metre jitter.
{
 const seeds=['G10-SEED-A','G10-SEED-B','G10-SEED-E','G10-SEED-F'];const sigs=[];for(const seed of seeds){const r=H.createDeveloperScenario({seed,key:'FORMATION_CONTINUITY'}),s=r.boundary.stateSnapshot,sp=s.spatial?.players||{},st=sp['H-ST']||{},lw=sp['H-LW']||{},rw=sp['H-RW']||{};const stBand=st.y<27?'LEFT':st.y>41?'RIGHT':'CENTRE',frontSide=(Number(lw.x)>Number(rw.x)+2)?'LW':(Number(rw.x)>Number(lw.x)+2)?'RW':'BALANCED';sigs.push({seed,owner:s.ball.ownerId,lane:s.ball.lane||null,stBand,frontSide,signature:`${s.ball.ownerId}|${s.ball.lane||'-'}|${stBand}|${frontSide}`});}const unique=new Set(sigs.map(x=>x.signature));out.push(chk('G10_7_NEW_SEED_CHANGES_MATERIAL_FOOTBALL_CONTEXT',unique.size>=2,{unique:[...unique],sigs}));
}
const pass=out.every(x=>x.pass);console.log(JSON.stringify({pass,results:out},null,2));if(!pass)process.exit(1);
