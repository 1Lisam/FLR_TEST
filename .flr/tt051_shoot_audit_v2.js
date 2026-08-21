'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]||process.argv[1]||'.'),E=require(path.join(root,'runtime/continuous_match_core.js')),bridge=E.choiceStateBridge();
const SHOTS=new Set(['SHOT','DIRECT_SHOT','VOLLEY_SHOT','HEADER_SHOT','CHIP_SHOT']),N=100,rows=[];
let teamGoals=0,heroGoals=0,conceded=0,choices=0,shotChoices=0,shotWindows=0,npcPasses=0,npcOneTouches=0;
for(let i=0;i<N;i++){
 const m=E.createMatch(`TT051-SHOOT-V2-${i+1}`,{});m.protagonistControllerId='H-ST';m.protagonistExplicitActionRequired=true;
 let guard=0,eventCursor=0,nextDecisionAt=0,hg=0,ch=0,sc=0,sw=0,np=0,no=0;
 while(!m.completed&&guard++<65000){
   if(m.time>=nextDecisionAt-.001){const f=bridge.inspect(m,'H-ST');if(f&&['ON_BALL','INCOMING_BALL'].includes(f.kind)&&(f.candidates||[]).length){const shot=(f.candidates||[]).find(c=>SHOTS.has(c.id));if(shot)sw++;const c=shot||(f.candidates||[])[0],tid=c.targetId||c.meta?.targetId||null,r=bridge.applyCandidate(m,'H-ST',c.id,tid,'QA_SHOOT_PRIORITY',c);if(!r.ok)throw new Error(`choice failed match=${i+1} t=${m.time.toFixed(2)} ${c.id} ${r.reason}`);ch++;if(SHOTS.has(c.id))sc++;nextDecisionAt=Number.isFinite(r.intentUntil)?Number(r.intentUntil):m.time+.20;}}
   E.step(m,.10);
   const evs=m.events||[];if(eventCursor>evs.length)eventCursor=0;for(;eventCursor<evs.length;eventCursor++){const e=evs[eventCursor];if(e.type==='GOAL'&&e.actorId==='H-ST')hg++;if(e.type==='PASS'&&e.actorId&&e.actorId!=='H-ST')np++;}
   no=m.stats.npcOneTouchPasses||0;
 }
 if(!m.completed)throw new Error(`match ${i+1} incomplete time=${m.time} guard=${guard}`);
 teamGoals+=m.score.HOME;conceded+=m.score.AWAY;heroGoals+=hg;choices+=ch;shotChoices+=sc;shotWindows+=sw;npcPasses+=np;npcOneTouches+=no;
 rows.push({match:i+1,home:m.score.HOME,away:m.score.AWAY,heroGoals:hg,choices:ch,shotChoices:sc,shotWindows:sw,npcOneTouches:no});
}
const avg=x=>Number((x/N).toFixed(3)),out={schemaVersion:'FLR_TT051_SHOOT_AUDIT_2.0',matches:N,policy:'Whenever H-ST has a live explicit choice and any shot-family choice exists, choose a shot; otherwise choose the first live candidate. No future outcome precompute.',summary:{teamGoals,heroGoals,conceded,avgTeamGoals:avg(teamGoals),avgHeroGoals:avg(heroGoals),avgConceded:avg(conceded),choices,shotChoices,shotWindows,shotChoiceRate:Number((shotChoices/Math.max(1,choices)).toFixed(4)),npcPasses,npcOneTouches,avgNpcOneTouches:avg(npcOneTouches)},rows};
console.log(JSON.stringify(out,null,2));
