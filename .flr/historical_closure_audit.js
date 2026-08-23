'use strict';
const fs=require('fs');
const E=require('../runtime/continuous_match_core.js');
const P=require('../runtime/protagonist_match_controller.js');

const MAT=new Set(['PASS','SHOT','TAKE_ON','TAKE_ON_TACKLED','TAKE_ON_LOOSE']);
const heroId={ST:'H-ST',CM:'H-CM',CB:'H-LCB',GK:'H-GK'};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const localX=p=>p.team==='HOME'?p.x:105-p.x;
function maxContig(rows,threshold){let cur=0,max=0;for(const x of rows){if(x){cur+=.1;max=Math.max(max,cur);}else cur=0;}return +max.toFixed(2);}
function pickOption(s,mode){const o=s.pending?.options||[];if(!o.length)return null;if(mode==='TRAP'){const x=o.find(v=>v.id==='TRAP_CONTROL');if(x)return x;}if(mode==='CARRY'){const x=o.find(v=>v.id==='CARRY');if(x)return x;}return P.autoPick(s)||o[0];}
function runOne(seed,role,mode='AUTO',seconds=1800){
 const id=heroId[role],s=P.create(seed,{heroPlayerId:id,mode:'PLAYER_ALL',replaySeconds:10});
 const out={seed,role,mode,score:null,choices:0,traps:0,trapAuto:0,carries:0,carryMoves:[],maxHeroFrameSpeed:0,speedJumps:[],maxDuelSeconds:0,maxRcmOverlapSeconds:0,farSideWindows:0,farSideMissing:0};
 let prev=null,duelRows=[],overlapRows=[],trapWatch=null,carryWatch=null,guard=0;
 while(!s.m.completed&&s.m.time<seconds&&guard++<300000){
   if(s.pending){
     const ci=s.currentScene?.checkpointInspect||null,st=s.m.playersById[id];
     if(role==='ST'&&ci?.kind==='ON_BALL'&&st){
       const opp=s.m.players.filter(p=>p.team!=='HOME'&&p.role!=='GK').map(p=>p.x).sort((a,b)=>a-b),line=opp.at(-2)??105;
       const wings=['H-LW','H-RW'].map(x=>s.m.playersById[x]).filter(Boolean);
       const viable=wings.filter(w=>w.x<=Math.max(s.m.ball.x,line)+.25&&w.x>st.x+1.2&&((w.tacticalTask||'').includes('RUN')||Math.hypot(w.vx||0,w.vy||0)>1.2));
       if(viable.length){out.farSideWindows++;const passIds=new Set(['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS']);const ok=(s.pending.options||[]).some(o=>passIds.has(o.id)&&viable.some(w=>w.id===o.targetId));if(!ok)out.farSideMissing++;}
     }
     const p=pickOption(s,mode);if(!p){s.pending=null;continue;}
     const beforeEvents=s.m.events.length,beforeX=s.m.playersById[id]?.x??0,beforeT=s.m.time;
     const r=P.applyChoice(s,p.id,p.targetId||null,{source:'HISTORICAL_AUDIT'});if(!r.ok){s.pending=null;continue;}out.choices++;
     if(p.id==='TRAP_CONTROL'){out.traps++;trapWatch={eventIndex:beforeEvents,started:s.m.time};}
     if(p.id==='CARRY'){out.carries++;carryWatch={x:beforeX,t:beforeT};}
     continue;
   }
   const h=s.m.playersById[id],before={t:s.m.time,x:h?.x??0,y:h?.y??0,phase:s.m.phase};
   P.step(s,.1);
   const hh=s.m.playersById[id];if(hh){
     if(prev){const dt=Math.max(.001,s.m.time-prev.t),v=Math.hypot(hh.x-prev.x,hh.y-prev.y)/dt;out.maxHeroFrameSpeed=Math.max(out.maxHeroFrameSpeed,v);if(v>16)out.speedJumps.push({t:+s.m.time.toFixed(2),v:+v.toFixed(1),from:[+prev.x.toFixed(2),+prev.y.toFixed(2)],to:[+hh.x.toFixed(2),+hh.y.toFixed(2)],phase:s.m.phase});}
     prev={t:s.m.time,x:hh.x,y:hh.y};
     if(role==='ST'){
       const nearest=s.m.players.filter(p=>p.team!=='HOME').map(p=>({p,d:dist(hh,p)})).sort((a,b)=>a.d-b.d)[0];duelRows.push(!!(s.m.ball.ownerId===id&&nearest&&nearest.d<1.6&&!s.pending));
       const rcm=s.m.playersById['H-RCM'];overlapRows.push(!!(rcm&&localX(hh)>72&&dist(hh,rcm)<1.35));
     }
   }
   if(trapWatch){
     const ev=s.m.events.slice(trapWatch.eventIndex).filter(e=>e.t>=trapWatch.started-.01&&e.actorId===id&&MAT.has(e.type));
     if(ev.length){out.trapAuto+=ev.length;trapWatch=null;}
     else if(s.pending||s.m.ball.ownerId!==id||s.m.time-trapWatch.started>4.5)trapWatch=null;
   }
   if(carryWatch&&s.m.time-carryWatch.t>=1.1){const cur=s.m.playersById[id];if(cur){const dx=(cur.team==='HOME'?cur.x-carryWatch.x:carryWatch.x-cur.x);out.carryMoves.push(+dx.toFixed(2));}carryWatch=null;}
 }
 out.maxDuelSeconds=maxContig(duelRows,true);out.maxRcmOverlapSeconds=maxContig(overlapRows,true);out.maxHeroFrameSpeed=+out.maxHeroFrameSpeed.toFixed(2);out.score={...s.m.score};return out;
}
function syntheticThrough(){
 const m=E.createMatch('HIST-THROUGH-SYN');const B=E.choiceActionBridge(),C=E.choiceStateBridge(),st=B.playerById(m,'H-ST'),lw=B.playerById(m,'H-LW');
 st.x=70;st.y=34;lw.x=78;lw.y=18;lw.vx=4.2;lw.vy=-.2;lw.tx=84;lw.ty=17.5;for(const id of['A-LCB','A-RCB']){const p=B.playerById(m,id);p.x=id==='A-LCB'?83:85;p.y=id==='A-LCB'?40:28;}
 m.time=120;m.possession='HOME';m.ball.x=70.4;m.ball.y=34;m.ball.mode='CONTROLLED';m.ball.ownerId=st.id;m.ball.lastTouchTeam='HOME';m.ball.lastTouchPlayer=st.id;B.setControlled(m,st,true);st.controlledSince=118;
 const f=C.inspect(m,st.id),cand=(f?.candidates||[]).find(c=>c.id==='THROUGH_PASS'&&c.targetId===lw.id);if(!cand)return{available:false};
 const before={x:lw.x,y:lw.y,vx:lw.vx,vy:lw.vy};const r=C.applyCandidate(m,st.id,'THROUGH_PASS',lw.id,{inputSource:'HIST_AUDIT'});return{available:true,applied:!!r?.ok,intendedReceiverId:m.ball.intendedReceiverId,targetX:Number.isFinite(m.ball.targetX)?+m.ball.targetX.toFixed(2):null,targetY:Number.isFinite(m.ball.targetY)?+m.ball.targetY.toFixed(2):null,receiver:before,leadDx:Number.isFinite(m.ball.targetX)?+(m.ball.targetX-before.x).toFixed(2):null,ballSpeed:+Math.hypot(m.ball.vx||0,m.ball.vy||0).toFixed(2)};
}
const rows=[];for(const role of['ST','CM','CB','GK'])for(let i=1;i<=5;i++)rows.push(runOne(`HIST-${role}-${i}`,role,'AUTO',role==='ST'?2400:1800));
for(let i=1;i<=4;i++)rows.push(runOne(`HIST-TRAP-${i}`,'ST','TRAP',1800));
for(let i=1;i<=4;i++)rows.push(runOne(`HIST-CARRY-${i}`,'ST','CARRY',1200));
const st=rows.filter(x=>x.role==='ST'&&x.mode==='AUTO'),trap=rows.filter(x=>x.mode==='TRAP'),carry=rows.filter(x=>x.mode==='CARRY');
const result={schemaVersion:'FLR_HISTORICAL_CLOSURE_AUDIT_1.0',generatedAt:new Date().toISOString(),summary:{stAutoRuns:st.length,trapRuns:trap.length,carryRuns:carry.length,maxStDuelSeconds:Math.max(...st.map(x=>x.maxDuelSeconds)),maxStRcmOverlapSeconds:Math.max(...st.map(x=>x.maxRcmOverlapSeconds)),speedJumpCount:rows.reduce((n,x)=>n+x.speedJumps.length,0),maxHeroFrameSpeed:Math.max(...rows.map(x=>x.maxHeroFrameSpeed)),traps:trap.reduce((n,x)=>n+x.traps,0),trapAutoMaterialActions:trap.reduce((n,x)=>n+x.trapAuto,0),carries:carry.reduce((n,x)=>n+x.carries,0),carryMinForward:Math.min(...carry.flatMap(x=>x.carryMoves).filter(Number.isFinite),999),farSideWindows:st.reduce((n,x)=>n+x.farSideWindows,0),farSideMissing:st.reduce((n,x)=>n+x.farSideMissing,0)},syntheticThrough:syntheticThrough(),runs:rows};
result.gates={protagonistAuthority:result.summary.trapAutoMaterialActions===0,duelStall:result.summary.maxStDuelSeconds<=6,rcmStOverlap:result.summary.maxStRcmOverlapSeconds<=5,carryMoves:result.summary.carries===0||result.summary.carryMinForward>=0.7,farSideChoice:result.summary.farSideMissing===0,speedContinuity:result.summary.speedJumpCount===0,throughLead:result.syntheticThrough.available&&result.syntheticThrough.applied&&result.syntheticThrough.intendedReceiverId==='H-LW'&&result.syntheticThrough.leadDx>0};
result.status=Object.values(result.gates).every(Boolean)?'PASS':'FAIL';fs.writeFileSync(process.argv[2]||'.flr/historical-closure-status.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,summary:result.summary,gates:result.gates,syntheticThrough:result.syntheticThrough},null,2));
