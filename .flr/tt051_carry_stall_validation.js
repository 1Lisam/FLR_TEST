'use strict';
const path=require('path');const root=path.resolve(process.argv[2]||'.');
const E=require(path.join(root,'runtime/continuous_match_core.js'));const P=require(path.join(root,'runtime/protagonist_match_controller.js'));const B=E.choiceActionBridge();
const checks=[];const add=(name,ok,detail={})=>checks.push({name,ok:!!ok,detail});
const ctl=require('fs').readFileSync(path.join(root,'runtime/protagonist_match_controller.js'),'utf8');
add('static-blocked-stall-threshold',ctl.includes('blockedStall=carryAge>=.95&&moved<.75&&Number(f.pressure??99)<=1.55'));
add('static-stall-clears-carry-lock',ctl.includes('userCarryStallReopens')&&ctl.includes("h.action='HOLD_BALL'"));
function pos(p,x,y){p.x=x;p.y=y;p.tx=x;p.ty=y;p.vx=0;p.vy=0;p.hasBall=false;p.runUntil=0;p.lockTargetUntil=0;p.nextThink=99999;p.action='HOLD_SHAPE';p.tacticalTask='HOLD_SHAPE';}
function setup(close){const s=P.create(`CARRY-STALL-${close?'BLOCKED':'FREE'}`,{heroPlayerId:'H-ST',mode:'PLAYER_ALL'}),m=s.m,ps=m.playersById;m.time=1200;m.phase='OPEN_PLAY';m.restart=null;m.completed=false;m.possession='HOME';m.nextShape=99999;
 for(const p of m.players){if(p.team==='HOME')pos(p,45,10+(p.slot?.length||1)*4);else pos(p,30,10+(p.slot?.length||1)*4);}const h=ps['H-ST'];pos(h,close?80:60,34);h.controlledSince=m.time-2;h.nextThink=m.time;B.setControlled(m,h,true);h.controlledSince=m.time-2;h.nextThink=m.time;
 const d=ps['A-RCB'];pos(d,h.x+(close?1.25:12),34);d.nextThink=99999;s.lastPauseAt=m.time-5;P.maybeCheckpoint(s);return{s,m,h,d};}
function pickCarry(env){const {s}=env;if(!s.pending)return{ok:false,reason:'NO_PENDING'};const c=s.pending.options.find(o=>o.id==='CARRY');if(!c)return{ok:false,reason:'NO_CARRY',options:s.pending.options.map(o=>o.id)};const r=P.applyChoice(s,'CARRY',null,{source:'QA_CARRY_STALL'});return{ok:r.ok,receipt:r};}
const blocked=setup(true),bPick=pickCarry(blocked);let bNext=null,bLost=null,bStart=blocked.m.time,bFrames=0;
if(bPick.ok){const anchor={x:blocked.h.x,y:blocked.h.y};for(let i=0;i<25&&!blocked.s.pending;i++){blocked.h.x=anchor.x;blocked.h.y=anchor.y;blocked.h.tx=anchor.x;blocked.h.ty=anchor.y;blocked.h.vx=0;blocked.h.vy=0;blocked.d.x=anchor.x+1.25;blocked.d.y=anchor.y;blocked.d.tx=blocked.d.x;blocked.d.ty=blocked.d.y;blocked.d.vx=0;blocked.d.vy=0;blocked.m.nextShape=99999;P.step(blocked.s,.1);bFrames++;if(blocked.m.possession!=='HOME'){bLost=blocked.m.time;break;}if(blocked.s.pending){bNext=blocked.m.time;break;}}}
const bElapsed=(bNext??bLost??blocked.m.time)-bStart;add('blocked-carry-scenario-valid',bPick.ok,{pick:bPick,elapsed:bElapsed,next:bNext,lost:bLost});
add('blocked-carry-resolves-or-reopens-fast',bPick.ok&&bElapsed<=1.55&&(bNext!=null||bLost!=null),{elapsed:bElapsed,next:bNext,lost:bLost,stallReopens:blocked.m.stats.userCarryStallReopens||0,pending:blocked.s.pending?.options?.map(o=>o.id)||null});
add('blocked-carry-no-unchosen-material-action',!(blocked.m.events||[]).some(e=>e.t>bStart+.001&&e.actorId==='H-ST'&&['PASS','SHOT','TAKE_ON'].includes(e.type)),(blocked.m.events||[]).filter(e=>e.t>=bStart-.01).slice(-10));
const free=setup(false),fPick=pickCarry(free);let fEarly=false,fStart=free.m.time;if(fPick.ok){for(let i=0;i<11;i++){P.step(free.s,.1);if(free.s.pending){fEarly=true;break;}}}
add('free-carry-scenario-valid',fPick.ok,{pick:fPick});add('free-carry-not-falsely-stall-reopened',fPick.ok&&!fEarly&&(free.m.stats.userCarryStallReopens||0)===0,{elapsed:free.m.time-fStart,pending:!!free.s.pending,stallReopens:free.m.stats.userCarryStallReopens||0,hero:[free.h.x,free.h.y]});
add('future-not-precomputed',blocked.s.futureOutcomePrecomputed===false&&free.s.futureOutcomePrecomputed===false);
const failures=checks.filter(x=>!x.ok);console.log(JSON.stringify({schemaVersion:'FLR_TT051_CARRY_STALL_VALIDATION_1.0',pass:failures.length===0,checks,failures},null,2));process.exit(failures.length?1:0);
