'use strict';
const fs=require('fs');
const E=require('../runtime/continuous_match_core.js');
const P=require('../runtime/protagonist_match_controller.js');

const MAT=new Set(['PASS','SHOT','TAKE_ON','TAKE_ON_TACKLED','TAKE_ON_LOOSE']);
const heroId={ST:'H-ST',CM:'H-CM',CB:'H-LCB',GK:'H-GK'};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const localX=p=>p.team==='HOME'?p.x:105-p.x;
function maxContig(rows){let cur=0,max=0;for(const x of rows){if(x){cur+=.1;max=Math.max(max,cur);}else cur=0;}return +max.toFixed(2);}
function pickOption(s,mode){const o=s.pending?.options||[];if(!o.length)return null;if(mode==='TRAP'){const x=o.find(v=>v.id==='TRAP_CONTROL');if(x)return x;}if(mode==='CARRY'){const x=o.find(v=>v.id==='CARRY');if(x)return x;}return P.autoPick(s)||o[0];}
function recentRestart(m,t){return [...(m.events||[])].reverse().find(e=>['KICKOFF','SECOND_HALF','HALF_TIME'].includes(e.type)&&Math.abs((e.t??-99)-t)<.35)||null;}
function runOne(seed,role,mode='AUTO',seconds=1800){
 const id=heroId[role],s=P.create(seed,{heroPlayerId:id,mode:'PLAYER_ALL',replaySeconds:10});
 const out={seed,role,mode,score:null,choices:0,traps:0,trapAuto:0,carries:0,carryResults:[],maxHeroFrameSpeed:0,restartSpeedJumps:[],nonRestartSpeedJumps:[],maxDuelSeconds:0,maxRcmOverlapSeconds:0,farSideWindows:0,farSideMissing:0,farSideMissingExamples:[]};
 let prev=null,duelRows=[],overlapRows=[],trapWatch=null,carryWatch=null,guard=0;
 function finishCarry(reason){if(!carryWatch)return;const cur=s.m.playersById[id];if(cur){const elapsed=Math.max(.01,s.m.time-carryWatch.t),move=dist(cur,carryWatch),forward=cur.team==='HOME'?cur.x-carryWatch.x:carryWatch.x-cur.x,events=s.m.events.slice(carryWatch.eventIndex).filter(e=>e.t>=carryWatch.t-.01),terminal=events.find(e=>['TACKLE','INTERCEPT','LOOSE','TAKE_ON_TACKLED','TAKE_ON_LOOSE'].includes(e.type));out.carryResults.push({elapsed:+elapsed.toFixed(2),move:+move.toFixed(2),forward:+forward.toFixed(2),stillOwner:s.m.ball.ownerId===id,pending:!!s.pending,terminal:terminal?.type||null,reason});}carryWatch=null;}
 while(!s.m.completed&&s.m.time<seconds&&guard++<300000){
   if(s.pending){
     if(carryWatch)finishCarry('NEXT_CHOICE');
     const ci=s.currentScene?.checkpointInspect||null,st=s.m.playersById[id];
     if(role==='ST'&&ci?.kind==='ON_BALL'&&st){
       const B=E.choiceActionBridge(),po=B.passOptions(s.m,st,'PLAYER');
       const viable=po.filter(o=>['H-LW','H-RW'].includes(o.p.id)&&!o.offsideRisk&&o.block<=1&&o.forward>1.2&&o.open>=.35&&(o.running||(o.p.tacticalTask||'').includes('RUN')||Math.hypot(o.p.vx||0,o.p.vy||0)>1.2));
       if(viable.length){out.farSideWindows++;const passIds=new Set(['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS']);const ok=(s.pending.options||[]).some(o=>passIds.has(o.id)&&viable.some(w=>w.p.id===o.targetId));if(!ok){out.farSideMissing++;if(out.farSideMissingExamples.length<5)out.farSideMissingExamples.push({t:+s.m.time.toFixed(2),hero:[+st.x.toFixed(2),+st.y.toFixed(2)],ball:[+s.m.ball.x.toFixed(2),+s.m.ball.y.toFixed(2)],viable:viable.map(o=>({id:o.p.id,forward:+o.forward.toFixed(2),open:+o.open.toFixed(2),block:o.block,running:!!o.running,task:o.p.tacticalTask||null,leadForward:Number.isFinite(o.leadForward)?+o.leadForward.toFixed(2):null})),shown:(s.pending.options||[]).map(o=>[o.id,o.targetId||null])});}}
     }
     const p=pickOption(s,mode);if(!p){s.pending=null;continue;}
     const beforeEvents=s.m.events.length,h0=s.m.playersById[id],beforeT=s.m.time;
     const r=P.applyChoice(s,p.id,p.targetId||null,{source:'HISTORICAL_AUDIT'});if(!r.ok){s.pending=null;continue;}out.choices++;
     if(p.id==='TRAP_CONTROL'){out.traps++;trapWatch={eventIndex:beforeEvents,started:s.m.time};}
     if(p.id==='CARRY'&&h0){out.carries++;carryWatch={x:h0.x,y:h0.y,t:beforeT,eventIndex:beforeEvents};}
     continue;
   }
   const h=s.m.playersById[id];
   P.step(s,.1);
   const hh=s.m.playersById[id];if(hh){
     if(prev){const dt=Math.max(.001,s.m.time-prev.t),v=Math.hypot(hh.x-prev.x,hh.y-prev.y)/dt;out.maxHeroFrameSpeed=Math.max(out.maxHeroFrameSpeed,v);if(v>16){const rec={t:+s.m.time.toFixed(2),v:+v.toFixed(1),from:[+prev.x.toFixed(2),+prev.y.toFixed(2)],to:[+hh.x.toFixed(2),+hh.y.toFixed(2)],phase:s.m.phase},rst=recentRestart(s.m,s.m.time);if(rst)out.restartSpeedJumps.push({...rec,restart:rst.type});else out.nonRestartSpeedJumps.push(rec);}}
     prev={t:s.m.time,x:hh.x,y:hh.y};
     if(role==='ST'){
       const nearest=s.m.players.filter(p=>p.team!=='HOME').map(p=>({p,d:dist(hh,p)})).sort((a,b)=>a.d-b.d)[0];duelRows.push(!!(s.m.ball.ownerId===id&&nearest&&nearest.d<1.6&&!s.pending));
       const rcm=s.m.playersById['H-RCM'];overlapRows.push(!!(rcm&&localX(hh)>72&&dist(hh,rcm)<1.35));
     }
   }
   if(trapWatch){const ev=s.m.events.slice(trapWatch.eventIndex).filter(e=>e.t>=trapWatch.started-.01&&e.actorId===id&&MAT.has(e.type));if(ev.length){out.trapAuto+=ev.length;trapWatch=null;}else if(s.pending||s.m.ball.ownerId!==id||s.m.time-trapWatch.started>4.5)trapWatch=null;}
   if(carryWatch&&(s.m.time-carryWatch.t>=1.1||s.m.ball.ownerId!==id))finishCarry(s.m.ball.ownerId!==id?'POSSESSION_ENDED':'TIME_SAMPLE');
 }
 if(carryWatch)finishCarry('RUN_END');out.maxDuelSeconds=maxContig(duelRows);out.maxRcmOverlapSeconds=maxContig(overlapRows);out.maxHeroFrameSpeed=+out.maxHeroFrameSpeed.toFixed(2);out.score={...s.m.score};return out;
}
function syntheticThrough(){
 const m=E.createMatch('HIST-THROUGH-SYN');const B=E.choiceActionBridge(),C=E.choiceStateBridge(),st=B.playerById(m,'H-ST'),lw=B.playerById(m,'H-LW');
 m.time=120;m.possession='HOME';st.x=70;st.y=34;lw.x=78;lw.y=18;lw.vx=4.2;lw.vy=-.2;lw.tx=84;lw.ty=17.5;lw.runUntil=124;lw.runTx=84;lw.runTy=17.5;lw.runType='WIDE_RELEASE_OUTLET';lw.tacticalTask='WIDE_RELEASE_OUTLET';for(const id of['A-LCB','A-RCB']){const p=B.playerById(m,id);p.x=id==='A-LCB'?84:86;p.y=id==='A-LCB'?40:28;}
 m.ball.x=70.4;m.ball.y=34;m.ball.mode='CONTROLLED';m.ball.ownerId=st.id;m.ball.lastTouchTeam='HOME';m.ball.lastTouchPlayer=st.id;B.setControlled(m,st,true);st.controlledSince=118;st.nextThink=119;
 const f=C.inspect(m,st.id),all=(f?.candidates||[]).map(c=>[c.id,c.targetId||null]),cand=(f?.candidates||[]).find(c=>c.id==='THROUGH_PASS'&&c.targetId===lw.id);if(!cand)return{available:false,candidates:all};
 const before={x:lw.x,y:lw.y,vx:lw.vx,vy:lw.vy};const r=C.applyCandidate(m,st.id,'THROUGH_PASS',lw.id,{inputSource:'HIST_AUDIT'});return{available:true,applied:!!r?.ok,intendedReceiverId:m.ball.intendedReceiverId,targetX:Number.isFinite(m.ball.targetX)?+m.ball.targetX.toFixed(2):null,targetY:Number.isFinite(m.ball.targetY)?+m.ball.targetY.toFixed(2):null,receiver:before,leadDx:Number.isFinite(m.ball.targetX)?+(m.ball.targetX-before.x).toFixed(2):null,leadDy:Number.isFinite(m.ball.targetY)?+(m.ball.targetY-before.y).toFixed(2):null,ballSpeed:+Math.hypot(m.ball.vx||0,m.ball.vy||0).toFixed(2),candidates:all};
}
const rows=[];for(const role of['ST','CM','CB','GK'])for(let i=1;i<=5;i++)rows.push(runOne(`HIST-${role}-${i}`,role,'AUTO',role==='ST'?2400:1800));for(let i=1;i<=4;i++)rows.push(runOne(`HIST-TRAP-${i}`,'ST','TRAP',1800));for(let i=1;i<=4;i++)rows.push(runOne(`HIST-CARRY-${i}`,'ST','CARRY',1200));
const st=rows.filter(x=>x.role==='ST'&&x.mode==='AUTO'),trap=rows.filter(x=>x.mode==='TRAP'),carry=rows.filter(x=>x.mode==='CARRY'),carryResults=carry.flatMap(x=>x.carryResults),carryStalls=carryResults.filter(x=>x.stillOwner&&!x.pending&&!x.terminal&&x.elapsed>=.9&&x.move<.7);
const restartJumps=rows.reduce((n,x)=>n+x.restartSpeedJumps.length,0),nonRestartJumps=rows.reduce((n,x)=>n+x.nonRestartSpeedJumps.length,0);
const result={schemaVersion:'FLR_HISTORICAL_CLOSURE_AUDIT_1.1',generatedAt:new Date().toISOString(),summary:{stAutoRuns:st.length,trapRuns:trap.length,carryRuns:carry.length,maxStDuelSeconds:Math.max(...st.map(x=>x.maxDuelSeconds)),maxStRcmOverlapSeconds:Math.max(...st.map(x=>x.maxRcmOverlapSeconds)),restartSpeedJumpCount:restartJumps,nonRestartSpeedJumpCount:nonRestartJumps,maxHeroFrameSpeed:Math.max(...rows.map(x=>x.maxHeroFrameSpeed)),traps:trap.reduce((n,x)=>n+x.traps,0),trapAutoMaterialActions:trap.reduce((n,x)=>n+x.trapAuto,0),carries:carry.reduce((n,x)=>n+x.carries,0),carrySamples:carryResults.length,carryStalls:carryStalls.length,farSideWindows:st.reduce((n,x)=>n+x.farSideWindows,0),farSideMissing:st.reduce((n,x)=>n+x.farSideMissing,0)},syntheticThrough:syntheticThrough(),carryStallExamples:carryStalls.slice(0,10),farSideMissingExamples:st.flatMap(x=>x.farSideMissingExamples.map(e=>({seed:x.seed,...e}))).slice(0,12),runs:rows};
result.gates={protagonistAuthority:result.summary.trapAutoMaterialActions===0,duelStall:result.summary.maxStDuelSeconds<=6,rcmStOverlap:result.summary.maxStRcmOverlapSeconds<=5,carrySemantics:result.summary.carryStalls===0,farSideChoice:result.summary.farSideMissing===0,nonRestartSpeedContinuity:result.summary.nonRestartSpeedJumpCount===0,throughLead:result.syntheticThrough.available&&result.syntheticThrough.applied&&result.syntheticThrough.intendedReceiverId==='H-LW'&&result.syntheticThrough.leadDx>0};result.status=Object.values(result.gates).every(Boolean)?'PASS':'FAIL';fs.writeFileSync(process.argv[2]||'.flr/historical-closure-status.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,summary:result.summary,gates:result.gates,syntheticThrough:result.syntheticThrough,carryStallExamples:result.carryStallExamples,farSideMissingExamples:result.farSideMissingExamples},null,2));
