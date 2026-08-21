'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]||'.');
const E=require(path.join(root,'runtime/continuous_match_core.js'));
const bridge=E.choiceStateBridge();
const SHOT_IDS=['SHOT','DIRECT_SHOT','VOLLEY_SHOT','HEADER_SHOT','CHIP_SHOT'];
const N=100, rows=[];let totalTeamGoals=0,totalHeroGoals=0,totalConceded=0,totalChoices=0,totalShotChoices=0,totalShotOpportunities=0,totalNpcPasses=0,totalNpcInstantPasses=0;
for(let i=0;i<N;i++){
  const m=E.createMatch(`TT051-SHOOT-AUDIT-${i+1}`,{});m.protagonistControllerId='H-ST';m.protagonistExplicitActionRequired=true;
  let guard=0,eventCursor=0,choices=0,shotChoices=0,shotOpp=0,npcPass=0,npcInstant=0,nextDecisionAt=0;
  while(!m.completed&&guard++<70000){
    if(m.time>=nextDecisionAt-.001){const f=bridge.inspect(m,'H-ST');if(f&&['ON_BALL','INCOMING_BALL'].includes(f.kind)&&(f.candidates||[]).length){const shots=f.candidates.filter(c=>SHOT_IDS.includes(c.id));if(shots.length)shotOpp++;const chosen=shots[0]||f.candidates[0],targetId=chosen.targetId||chosen.meta?.targetId||null,r=bridge.applyCandidate(m,'H-ST',chosen.id,targetId,'QA_SHOOT_PRIORITY',chosen);if(!r.ok)throw new Error(`choice failed match=${i+1} t=${m.time.toFixed(2)} ${chosen.id} ${r.reason}`);choices++;if(SHOT_IDS.includes(chosen.id))shotChoices++;nextDecisionAt=Number.isFinite(r.intentUntil)?Number(r.intentUntil):m.time+.22;}}
    E.step(m,.10);
    const evs=m.events||[];for(;eventCursor<evs.length;eventCursor++){const e=evs[eventCursor];if(e.type!=='PASS'||!e.actorId||e.actorId==='H-ST')continue;const p=m.playersById[e.actorId];npcPass++;if(p&&Number.isFinite(p.lastReceivedAt)&&e.t-p.lastReceivedAt<=.18)npcInstant++;}
  }
  if(!m.completed)throw new Error(`match ${i+1} did not complete guard=${guard} time=${m.time}`);
  const heroGoals=(m.events||[]).filter(e=>e.type==='GOAL'&&e.actorId==='H-ST').length;
  totalTeamGoals+=m.score.HOME;totalConceded+=m.score.AWAY;totalHeroGoals+=heroGoals;totalChoices+=choices;totalShotChoices+=shotChoices;totalShotOpportunities+=shotOpp;totalNpcPasses+=npcPass;totalNpcInstantPasses+=npcInstant;
  rows.push({seed:i+1,home:m.score.HOME,away:m.score.AWAY,heroGoals,choices,shotChoices,shotOpportunities:shotOpp,npcPasses:npcPass,npcInstantPasses:npcInstant});
}
const avg=x=>Number((x/N).toFixed(3));const out={schemaVersion:'FLR_TT051_SHOOT_NPC_TOUCH_AUDIT_1.1',matches:N,policy:{hero:'H-ST',shotPriority:SHOT_IDS,fallback:'highest-ranked live candidate when no shot exists',enginePath:'continuous_match_core choiceStateBridge; UI/replay excluded; physics/outcomes unchanged'},shootOnly:{teamGoals:totalTeamGoals,heroGoals:totalHeroGoals,conceded:totalConceded,avgTeamGoals:avg(totalTeamGoals),avgHeroGoals:avg(totalHeroGoals),avgConceded:avg(totalConceded),choices:totalChoices,shotChoices:totalShotChoices,shotOpportunities:totalShotOpportunities,shotChoiceRate:Number((totalShotChoices/Math.max(1,totalChoices)).toFixed(4))},npcTouch:{npcPasses:totalNpcPasses,npcPassWithin180msOfReceive:totalNpcInstantPasses,instantRate:Number((totalNpcInstantPasses/Math.max(1,totalNpcPasses)).toFixed(6)),note:'<=180ms is a strict true-one-touch proxy; current FIRST_TOUCH_FLOW settle is longer.'},rows};console.log(JSON.stringify(out,null,2));
