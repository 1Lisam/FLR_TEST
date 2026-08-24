'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const req=p=>require(path.join(root,p));
const T=req('runtime/tactical_movement.js'),E=req('runtime/continuous_match_core.js'),H=req('live_hybrid_session_v02.js'),A=req('live_v06_scene_authority_browser.js'),P=req('runtime/protagonist_match_controller.js');
const checks=[],watches=[];const check=(id,pass,value)=>checks.push({id,pass:!!pass,value});
const L=(team,p)=>team==='HOME'?{x:p.x,y:p.y}:{x:105-p.x,y:68-p.y};
const LT=(team,p)=>team==='HOME'?{x:p.tx,y:p.ty}:{x:105-p.tx,y:68-p.ty};
const pl=(f,id)=>(f.players||[]).find(p=>p.id===id)||null;
function setLocal(m,id,x,y){const p=m.playersById[id],w=p.team==='HOME'?{x,y}:{x:105-x,y:68-y};Object.assign(p,{x:w.x,y:w.y,tx:w.x,ty:w.y,vx:0,vy:0});return p;}
function control(seed,id,x,y){const m=E.createMatch(seed,{dt:.05});m.time=100;m.restart=null;m.completed=false;const p=setLocal(m,id,x,y);E.choiceActionBridge().setControlled(m,p,true);m.ball.x=p.x;m.ball.y=p.y;m.ball.z=0;m.nextShape=0;return m;}

// Wide carrier: same-side FB owns first pressure, not the nearest roaming CM.
{
 const m=control('V054-WIDE','H-RW',80,55);setLocal(m,'A-LB',29,13);setLocal(m,'A-LCM',26,20);setLocal(m,'A-LCB',24,27);setLocal(m,'A-RCB',24,41);setLocal(m,'A-RB',27,58);T.assign(m);
 const lock=m._defenceRoleLocks?.AWAY||{},pressers=m.players.filter(p=>p.team==='AWAY'&&['PRESS_CONTAIN','ENGAGE'].includes(p.tacticalTask));
 check('WIDE_CARRIER_FB_OWNS_PRESS',lock.pressId==='A-LB',{pressId:lock.pressId,coverId:lock.coverId});
 check('ONE_DIRECT_BALL_PRESSER',pressers.length<=1,pressers.map(p=>({id:p.id,task:p.tacticalTask})));
}

// Central ST must be a CB reference; CM/user-CM stays in screen/second-ball layer.
{
 const m=control('V054-CM-ST-GUARD','H-RW',82,55);setLocal(m,'H-ST',86,34);setLocal(m,'A-LCB',20,27);setLocal(m,'A-RCB',20,41);setLocal(m,'A-LCM',27,22);setLocal(m,'A-CM',28,34);setLocal(m,'A-RCM',27,46);T.assign(m);
 const cms=['A-LCM','A-CM','A-RCM'].map(id=>({id,mark:m.playersById[id].markTargetId,task:m.playersById[id].tacticalTask,target:LT('AWAY',m.playersById[id])}));
 check('CM_NEVER_STICKY_MARKS_CENTRAL_ST',cms.every(q=>q.mark!=='H-ST'),cms);
 check('CENTRAL_ST_HAS_CB_REFERENCE',['A-LCB','A-RCB'].some(id=>m.playersById[id].markTargetId==='H-ST'),['A-LCB','A-RCB'].map(id=>({id,mark:m.playersById[id].markTargetId,task:m.playersById[id].tacticalTask})));
}

// Deep block: midfield layer remains clearly ahead of CB targets. Box density is allowed.
{
 const m=control('V054-DEEP','H-ST',92,34);setLocal(m,'A-LCB',14.5,27);setLocal(m,'A-RCB',15,41);setLocal(m,'A-LB',17,10);setLocal(m,'A-RB',17,58);setLocal(m,'A-LCM',27,22);setLocal(m,'A-CM',28,34);setLocal(m,'A-RCM',27,46);T.assign(m);
 const cbMean=['A-LCB','A-RCB'].map(id=>LT('AWAY',m.playersById[id]).x).reduce((a,b)=>a+b,0)/2,cms=['A-LCM','A-CM','A-RCM'].map(id=>({id,x:LT('AWAY',m.playersById[id]).x,task:m.playersById[id].tacticalTask}));
 check('CM_LAYER_STAYS_AHEAD_OF_BACK_FOUR',cms.every(q=>q.x>=cbMean+5.3),{cbMean,cms});
 watches.push({id:'BOX_DENSITY_ALLOWED',value:m.players.filter(p=>p.team==='AWAY'&&p.role!=='GK'&&LT('AWAY',p).x<=23).length});
}

// Attack: both 8s reach a second-ball/cutback layer, central pivot remains rest defence.
{
 const m=control('V054-SECOND-BALL','H-RW',90,56);m._tacticalRuntime={lastPossession:'HOME',teams:{HOME:{markProgress:90,lastAdvanceAt:100,surgeUntil:0,recoverUntil:0,wasSurging:false,boxWaveUntil:0,nextBoxWaveAt:999,boxPatternIndex:0,wideOutletSlot:'RW',wideOutletUntil:999,fullbackSurgeSlot:null,fullbackSurgeUntil:0,nextFullbackSurgeAt:999}}};T.assign(m);
 const eights=['H-LCM','H-RCM'].map(id=>({id,x:LT('HOME',m.playersById[id]).x,task:m.playersById[id].tacticalTask})),pivot={x:LT('HOME',m.playersById['H-CM']).x,task:m.playersById['H-CM'].tacticalTask};
 check('EIGHTS_REACH_SECOND_BALL_LAYER',eights.every(q=>q.x>=68),{eights,pivot});
 check('PIVOT_REMAINS_REST_DEFENCE',pivot.x<=65,{eights,pivot});
}

const scenarios=[
 ['DEFENSIVE_ROLE_STABILITY','DEV-RECENT-1787573272419-1'],
 ['PASS_FLIGHT_WIDE_TRACK','DEV-RECENT-1787575663982-11'],
 ['MARK_TARGET_STABILITY','DEV-RECENT-1787575803967-13'],
 ['MARK_TARGET_STABILITY','DEV-RECENT-1787575897894-18'],
 ['STRIKER_RUN_LANE','DEV-RECENT-1787575948505-19'],
 ['CARRIER_SHIELD_FLOW','DEV-RECENT-1787576057595-34'],
 ['OFFSIDE_INVOLVEMENT','DEV-RECENT-1787576131788-41']
];
function backFourOrder(d){const ps=d.boundary.stateSnapshot?.spatial?.players||{},lb=ps['A-LB'],rb=ps['A-RB'],lcb=ps['A-LCB'],rcb=ps['A-RCB'];if(!lb||!rb||!lcb||!rcb)return null;return{lb:L('AWAY',lb).y,rb:L('AWAY',rb).y,lcb:L('AWAY',lcb).y,rcb:L('AWAY',rcb).y};}
for(const [key,seed] of scenarios){const d=H.createDeveloperScenario({key,seed}),o=backFourOrder(d);if(o)check(`${key}:${seed}:START_BACK_FOUR_SIDE_ORDER`,o.lb<o.rb&&o.lcb<o.rcb,o);}

// Exact visual path: quantify CM collapsing onto/behind CB line across reported defence seeds.
for(const [key,seed] of scenarios.slice(0,5)){
 const d=H.createDeveloperScenario({key,seed}),v=A.runDeveloperVisualWindow(d.boundary,{runtimeDir:path.join(root,'runtime'),seed:d.seed,durationSeconds:9}),rows=v.frames||[];let violations=0,frames=0;
 for(const f of rows){const cbs=['A-LCB','A-RCB'].map(id=>pl(f,id)).filter(Boolean);if(cbs.length<2)continue;const mean=cbs.map(q=>L('AWAY',q).x).reduce((a,b)=>a+b,0)/2;frames++;for(const id of ['A-LCM','A-CM','A-RCM']){const q=pl(f,id);if(q&&L('AWAY',q).x<=mean+1.5)violations++;}}
 const ratio=frames?violations/(frames*3):0;check(`${key}:${seed}:CM_BACKLINE_COLLAPSE_RATIO`,ratio<=0.035,{frames,violations,ratio:+ratio.toFixed(4)});
}

// User's offside debug must expose a forward target and actually be able to cause an offside call.
{
 const key='OFFSIDE_INVOLVEMENT',seed='DEV-RECENT-1787576131788-41',d=H.createDeveloperScenario({key,seed}),o=A.runToChoice(d.boundary,{runtimeDir:path.join(root,'runtime'),seed:d.seed,minPreSeconds:.8,maxSearchSeconds:9}),opts=o?.state?.pending?.options||o?.pending?.options||[],direct=opts.find(x=>['H-ST','H-RW'].includes(x.targetId)&&['THROUGH_PASS','LOFTED_THROUGH_PASS','AVAILABLE_PASS','PROGRESSIVE_PASS'].includes(x.id));
 check('OFFSIDE_TEST_EXPOSES_FORWARD_TARGET',!!direct,opts.map(x=>({id:x.id,targetId:x.targetId})));
 if(direct&&o.state){const m=o.state.m,t0=m.time,res=P.applyChoice(o.state,direct.id,direct.targetId,{source:'AUTO_SIMULATION'});let call=null;for(let i=0;i<55&&!m.completed;i++){P.step(o.state,.1);call=(m.events||[]).find(e=>e.type==='OFFSIDE'&&e.t>=t0-.01);if(call)break;}check('OFFSIDE_TEST_CAN_TRIGGER_OFFSIDE',!!call,{choice:{id:direct.id,targetId:direct.targetId},applyOk:!!res?.ok,call:call||null});}
}

// General runtime smoke on both ordinary and reported seeds.
for(const seed of ['V054-SMOKE-01','V054-SMOKE-02','DEV-RECENT-1787573272419-1','DEV-RECENT-1787575663982-11']){const r=E.runToEnd(seed,{dt:.05}),s=r.snapshot,finite=s.players.every(p=>[p.x,p.y,p.tx,p.ty].every(Number.isFinite));check(`CORE_SMOKE:${seed}`,s.completed&&s.players.length===22&&finite,{score:s.score,shots:s.stats.shots,passes:s.stats.passes,completed:s.completed});}
const status=checks.every(x=>x.pass)?'PASS':'FAIL';const out={schemaVersion:'FLR_V054_DEFENCE_NORMALIZATION_VALIDATION_1.0',status,checks,watches};console.log(JSON.stringify(out,null,2));if(status!=='PASS')process.exitCode=1;
