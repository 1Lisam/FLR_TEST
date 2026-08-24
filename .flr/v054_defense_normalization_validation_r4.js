'use strict';
const path=require('path'),cp=require('child_process');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const base=cp.spawnSync(process.execPath,[path.join(__dirname,'v054_defense_normalization_validation.js'),root],{encoding:'utf8'});
let baseObj;try{baseObj=JSON.parse(base.stdout);}catch(e){console.error(base.stdout);console.error(base.stderr);throw e;}
const E=require(path.join(root,'runtime/continuous_match_core.js')),T=require(path.join(root,'runtime/tactical_movement.js'));
const checks=[...(baseObj.checks||[])],watches=[...(baseObj.watches||[])];const check=(id,pass,value)=>checks.push({id,pass:!!pass,value});
const LT=(team,p)=>team==='HOME'?{x:p.tx,y:p.ty}:{x:105-p.tx,y:68-p.ty};
function setLocal(m,id,x,y){const p=m.playersById[id],w=p.team==='HOME'?{x,y}:{x:105-x,y:68-y};Object.assign(p,{x:w.x,y:w.y,tx:w.x,ty:w.y,vx:0,vy:0});return p;}
function control(seed,id,x,y){const m=E.createMatch(seed,{dt:.05});m.time=100;m.restart=null;m.completed=false;const p=setLocal(m,id,x,y);E.choiceActionBridge().setControlled(m,p,true);m.ball.x=p.x;m.ball.y=p.y;m.ball.z=0;m.nextShape=0;return m;}
const m=control('V054-SECOND-BALL-STRICT','H-RW',90,56);m._tacticalRuntime={lastPossession:'HOME',teams:{HOME:{markProgress:90,lastAdvanceAt:100,surgeUntil:0,recoverUntil:0,wasSurging:false,boxWaveUntil:0,nextBoxWaveAt:999,boxPatternIndex:0,wideOutletSlot:'RW',wideOutletUntil:999,fullbackSurgeSlot:null,fullbackSurgeUntil:0,nextFullbackSurgeAt:999}}};T.assign(m);
const eights=['H-LCM','H-RCM'].map(id=>({id,x:LT('HOME',m.playersById[id]).x,y:LT('HOME',m.playersById[id]).y,task:m.playersById[id].tacticalTask})),box=eights.filter(q=>q.x>=87),edge=eights.filter(q=>q.x>=74&&q.x<=84),pivot={x:LT('HOME',m.playersById['H-CM']).x,task:m.playersById['H-CM'].tacticalTask};
check('EXACTLY_ONE_EIGHT_ATTACKS_BOX',box.length===1,{eights,pivot});
check('OTHER_EIGHT_HOLDS_SECOND_BALL_EDGE',edge.length===1,{eights,pivot});
check('MIDFIELD_TRIANGLE_HAS_THREE_LAYERS',box.length===1&&edge.length===1&&pivot.x<=65&&pivot.x<edge[0]?.x,{eights,pivot});
const status=(base.returncode===0&&checks.every(x=>x.pass))?'PASS':'FAIL';const out={schemaVersion:'FLR_V054_DEFENCE_NORMALIZATION_VALIDATION_R4',status,baseStatus:baseObj.status,checks,watches};console.log(JSON.stringify(out,null,2));if(status!=='PASS')process.exitCode=1;
