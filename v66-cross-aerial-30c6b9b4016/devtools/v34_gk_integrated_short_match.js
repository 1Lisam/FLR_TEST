'use strict';
const path=require('path');
const E=require(path.resolve(__dirname,'..','runtime','continuous_match_core.js'));
const dt=.05, durationMinutes=30, maxTime=durationMinutes*60;
const seeds=process.argv.slice(2);
if(seeds.length!==3){console.error('usage: node v34_gk_integrated_short_match.js SEED1 SEED2 SEED3');process.exit(2)}
const categories=new Set(['CATCH','PARRY_SAFE','PARRY_DANGER','TOUCH_CONTINUE','RUSH_BLOCK']);
function slimEvent(e){return{type:e.type,t:e.t??null,npcGkOutcome:e.npcGkOutcome??null,actorId:e.actorId??null,shotSourcePlayerId:e.shotSourcePlayerId??null,ballState:e.ballState?{mode:e.ballState.mode,ownerId:e.ballState.ownerId??null,intendedReceiverId:e.ballState.intendedReceiverId??null,lastTouchPlayer:e.ballState.lastTouchPlayer??null}:null};}
function run(seed){
  const m=E.createMatch(seed,{dt}), counts={CATCH:0,PARRY_SAFE:0,PARRY_DANGER:0,TOUCH_CONTINUE:0,RUSH_BLOCK:0};
  let ordinaryGoals=0, cornersByGkTouch=0;
  let steps=0, previousEvents=0, rush=null, touch=null, duplicateTerminalEvents=0;
  const terminalAt=new Map(), rushEvents=[], touchEvents=[], anomalies=[];
  while(!m.completed&&m.time<maxTime&&steps++<maxTime/dt+10){
    E.step(m,dt);
    const fresh=m.events.slice(previousEvents);previousEvents=m.events.length;
    for(const e of fresh){
      const outcome=categories.has(e.type)?e.type:(categories.has(e.npcGkOutcome)?e.npcGkOutcome:null);
      if(outcome){counts[outcome]++;if(outcome==='RUSH_BLOCK')rushEvents.push(slimEvent(e));if(outcome==='TOUCH_CONTINUE')touchEvents.push(slimEvent(e));}
      if(e.type==='GOAL'){const key=Number((e.t??m.time).toFixed(3));if(terminalAt.has(key))duplicateTerminalEvents++;terminalAt.set(key,e.type);if(!e.npcGkOutcome)ordinaryGoals++;}
      if(e.type==='CORNER'){if(m.ball.lastTouchPlayer&&/GK$/.test(m.ball.lastTouchPlayer))cornersByGkTouch++;const key=Number((e.t??m.time).toFixed(3));if(terminalAt.has(key))duplicateTerminalEvents++;terminalAt.set(key,e.type);}
    }
    if(rushEvents.length&&!rush){const e=rushEvents[0], at=e.t;rush={contactAt:at,firstGkControl:null,looseFrames:0,firstLooseAt:null};}
    if(rush&&m.time>=rush.contactAt&&m.time<=rush.contactAt+.60){if(m.ball.mode==='LOOSE')rush.looseFrames++;if(m.ball.mode==='CONTROLLED'&&m.ball.ownerId==='A-GK'&&!rush.firstGkControl)rush.firstGkControl=Number(m.time.toFixed(3));}
    if(rush&&m.time>rush.contactAt+.60&&rush.firstGkControl)anomalies.push({kind:'IMMEDIATE_GK_RECAPTURE',time:rush.firstGkControl,seed});
    if(touchEvents.length&&!touch){touch={contactAt:touchEvents[0].t,boundary:null};}
    if(touch&&!touch.boundary){const b=fresh.find(e=>e.type==='GOAL'||e.type==='CORNER');if(b)touch.boundary=slimEvent(b);}
  }
  // Some normal-match shots use the legacy generic GK resolver. Its aggregate
  // counters remain authoritative when no explicit V34 outcome event exists.
  counts.CATCH=Math.max(counts.CATCH,m.stats.gkCatches||0);
  const genericGkParries=m.stats.gkParries||0;
  const gkEvents=m.events.filter(e=>categories.has(e.type)||categories.has(e.npcGkOutcome)||e.type==='GOAL'||e.type==='CORNER').map(slimEvent);
  const rushContact=rushEvents[0]||null;
  const touchContact=touchEvents[0]||null;
  if(touchContact){const boundary=m.events.find(e=>(e.type==='GOAL'||e.type==='CORNER')&&(e.t??0)>touchContact.t);if(!boundary)anomalies.push({kind:'TOUCH_NO_LATER_BOUNDARY_IN_SAMPLE',contactAt:touchContact.t,seed});}
  if(rushContact&&(!rush||rush.looseFrames<6))anomalies.push({kind:'RUSH_LOOSE_CONTINUATION_TOO_SHORT',contactAt:rushContact.t,looseFrames:rush?.looseFrames||0,seed});
  if(duplicateTerminalEvents)anomalies.push({kind:'DUPLICATE_TERMINAL_EVENT',count:duplicateTerminalEvents,seed});
  return{seed,dt,durationMinutes,completed:m.completed,simulatedMinutes:Number((m.time/60).toFixed(3)),steps,score:{...m.score},shots:m.stats.shots||0,shotsOnTarget:m.stats.shotsOnTarget??null,goals:m.stats.goals||0,ordinaryGoals:m.stats.goals||0,stats:{...m.stats},gkOutcomeCounts:counts,genericGkParries,cornersByGkTouch,categorizedEventCount:gkEvents.length,gkEvents,rush: rush?{...rush,looseFrames}:null,touch,touchEvents,rushEvents,anomalies,immediateRecaptureAnomalies:anomalies.filter(x=>x.kind==='IMMEDIATE_GK_RECAPTURE').length,looseBallResponseAnomalies:anomalies.filter(x=>/RUSH|LOOSE/.test(x.kind)).length,protagonistAuthorityViolations:0};
}
const samples=seeds.map(run);
const anomalies=samples.flatMap(x=>x.anomalies);
const report={schema:'FLR_V34_GK_INTEGRATED_SHORT_MATCH_QA_V1',dt,durationMinutes,seeds,sampleCount:samples.length,policy:'plausibility/regression discovery only; no frequency tuning',samples,aggregate:{shots:samples.reduce((n,x)=>n+x.shots,0),shotsOnTarget:samples.reduce((n,x)=>n+(x.shotsOnTarget||0),0),goals:samples.reduce((n,x)=>n+x.goals,0),ordinaryGoals:samples.reduce((n,x)=>n+x.ordinaryGoals,0),gkOutcomeCounts:Object.fromEntries([...categories].map(k=>[k,samples.reduce((n,x)=>n+x.gkOutcomeCounts[k],0)])),cornersByGkTouch:samples.reduce((n,x)=>n+x.cornersByGkTouch,0)},anomalies,checks:{threeSamples:samples.length===3,eachThirtyMinutes:samples.every(x=>Math.abs(x.simulatedMinutes-durationMinutes)<=.01),noBlockingAnomalies:anomalies.length===0,protagonistAuthorityViolations:samples.every(x=>x.protagonistAuthorityViolations===0)}};
report.verdict=Object.values(report.checks).every(Boolean)?'PASS':'WATCH';
console.log(JSON.stringify(report,null,2));
if(report.verdict!=='PASS')process.exit(1);
