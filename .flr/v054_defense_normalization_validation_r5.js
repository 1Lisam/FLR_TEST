'use strict';
const path=require('path'),cp=require('child_process');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const base=cp.spawnSync(process.execPath,[path.join(__dirname,'v054_defense_normalization_validation_r4.js'),root],{encoding:'utf8'});let obj;try{obj=JSON.parse(base.stdout);}catch(e){console.error(base.stdout,base.stderr);throw e;}
const E=require(path.join(root,'runtime/continuous_match_core.js')),T=require(path.join(root,'runtime/tactical_movement.js')),P=require(path.join(root,'runtime/protagonist_match_controller.js'));
const checks=[...(obj.checks||[])],watches=[...(obj.watches||[])];const check=(id,pass,value)=>checks.push({id,pass:!!pass,value});
const L=(team,p)=>team==='HOME'?{x:p.x,y:p.y}:{x:105-p.x,y:68-p.y};
function setLocal(m,id,x,y){const p=m.playersById[id],w=p.team==='HOME'?{x,y}:{x:105-x,y:68-y};Object.assign(p,{x:w.x,y:w.y,tx:w.x,ty:w.y,vx:0,vy:0});return p;}
function forcePossession(m,id,x,y){const p=setLocal(m,id,x,y);E.choiceActionBridge().setControlled(m,p,true);m.ball.x=p.x;m.ball.y=p.y;m.ball.z=0;m.restart=null;m.phase='OPEN_PLAY';m.completed=false;m.nextShape=0;return p;}
{
 const m=E.createMatch('V054-WIDE-MIRROR',{dt:.05});m.time=100;forcePossession(m,'H-LW',80,13);setLocal(m,'A-RB',29,55);setLocal(m,'A-RCM',26,48);setLocal(m,'A-RCB',24,41);setLocal(m,'A-LCB',24,27);T.assign(m);const lock=m._defenceRoleLocks?.AWAY||{};check('LEFT_WIDE_CARRIER_SAME_SIDE_FB_OWNS_PRESS',lock.pressId==='A-RB',lock);
}
{
 const state=P.create('V054-HERO-CM-ST',{heroPlayerId:'H-CM',mode:'FULL_SKIP',replaySeconds:10}),m=state.m;m.time=100;forcePossession(m,'A-RW',82,55);setLocal(m,'A-ST',86,34);setLocal(m,'H-LCB',14.5,27);setLocal(m,'H-RCB',15,41);setLocal(m,'H-LB',17,10);setLocal(m,'H-RB',17,58);setLocal(m,'H-LCM',27,22);setLocal(m,'H-CM',28,34);setLocal(m,'H-RCM',27,46);
 let sticky=0,markFrames=0,minGap=99,rows=[];for(let i=0;i<30;i++){P.step(state,.1);const cm=m.playersById['H-CM'],st=m.playersById['A-ST'];if(cm.markTargetId==='A-ST')markFrames++;const gap=Math.hypot(cm.x-st.x,cm.y-st.y);minGap=Math.min(minGap,gap);if(gap<2.4)sticky++;if(i%5===0)rows.push({t:+m.time.toFixed(2),mark:cm.markTargetId||null,task:cm.tacticalTask,gap:+gap.toFixed(2),cm:L('HOME',cm),st:L('HOME',st)});}
 check('PROTAGONIST_CM_NOT_ASSIGNED_ST_BODY_MARK',markFrames===0,{markFrames,sticky,minGap:+minGap.toFixed(2),rows});
 check('PROTAGONIST_CM_NOT_GLUE_DISTANCE',sticky<=1,{markFrames,sticky,minGap:+minGap.toFixed(2),rows});
}
const failedIds=checks.filter(x=>!x.pass).map(x=>x.id),status=(base.returncode===0&&failedIds.length===0)?'PASS':'FAIL';
console.log(JSON.stringify({schemaVersion:'FLR_V054_DEFENCE_NORMALIZATION_VALIDATION_R5_DIAGNOSTIC',status,baseStatus:obj.status,baseReturnCode:base.returncode,baseStderr:String(base.stderr||'').slice(-4000),failedIds,checks,watches},null,2));if(status!=='PASS')process.exitCode=1;
