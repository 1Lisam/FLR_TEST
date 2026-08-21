'use strict';
const path=require('path');
const root=path.resolve(process.argv[2]||'.');
const P=require(path.join(root,'runtime/protagonist_match_controller.js'));
const SHOT_IDS=['SHOT','DIRECT_SHOT','VOLLEY_SHOT','HEADER_SHOT','CHIP_SHOT'];
const N=100, rows=[];let totalTeamGoals=0,totalHeroGoals=0,totalConceded=0,totalChoices=0,totalShotChoices=0,totalShotOpportunities=0,totalNpcPasses=0,totalNpcInstantPasses=0;
for(let i=0;i<N;i++){
  const s=P.create(`TT051-SHOOT-AUDIT-${i+1}`,{heroPlayerId:'H-ST',mode:'PLAYER_ALL'}),m=s.m;let guard=0,eventCursor=0,choices=0,shotChoices=0,shotOpp=0,npcPass=0,npcInstant=0;
  while(!m.completed&&guard++<120000){
    if(s.pending){const opts=s.pending.options||[],shots=opts.filter(o=>SHOT_IDS.includes(o.id));if(shots.length)shotOpp++;const chosen=shots[0]||opts[0];if(chosen){const r=P.applyChoice(s,chosen.id,chosen.targetId||null,{source:'QA_SHOOT_PRIORITY'});if(r.ok){choices++;if(SHOT_IDS.includes(chosen.id))shotChoices++;}else throw new Error(`choice failed ${i+1} ${chosen.id} ${r.reason}`);}else{s.pending=null;}
    }else P.step(s,.10);
    const evs=m.events||[];for(;eventCursor<evs.length;eventCursor++){const e=evs[eventCursor];if(e.type!=='PASS'||!e.actorId||e.actorId==='H-ST')continue;const p=m.playersById[e.actorId];npcPass++;if(p&&Number.isFinite(p.lastReceivedAt)&&e.t-p.lastReceivedAt<=.18)npcInstant++;}
  }
  if(!m.completed)throw new Error(`match ${i+1} did not complete guard=${guard} time=${m.time}`);
  const heroGoals=(m.events||[]).filter(e=>e.type==='GOAL'&&e.actorId==='H-ST').length;
  totalTeamGoals+=m.score.HOME;totalConceded+=m.score.AWAY;totalHeroGoals+=heroGoals;totalChoices+=choices;totalShotChoices+=shotChoices;totalShotOpportunities+=shotOpp;totalNpcPasses+=npcPass;totalNpcInstantPasses+=npcInstant;
  rows.push({seed:i+1,home:m.score.HOME,away:m.score.AWAY,heroGoals,choices,shotChoices,shotOpportunities:shotOpp,npcPasses:npcPass,npcInstantPasses:npcInstant});
}
const avg=x=>Number((x/N).toFixed(3));const out={schemaVersion:'FLR_TT051_SHOOT_NPC_TOUCH_AUDIT_1.0',matches:N,policy:{shotPriority:SHOT_IDS,fallback:'first available option when no shot exists'},shootOnly:{teamGoals:totalTeamGoals,heroGoals:totalHeroGoals,conceded:totalConceded,avgTeamGoals:avg(totalTeamGoals),avgHeroGoals:avg(totalHeroGoals),avgConceded:avg(totalConceded),choices:totalChoices,shotChoices:totalShotChoices,shotOpportunities:totalShotOpportunities,shotChoiceRate:Number((totalShotChoices/Math.max(1,totalChoices)).toFixed(4))},npcTouch:{npcPasses:totalNpcPasses,npcPassWithin180msOfReceive:totalNpcInstantPasses,instantRate:Number((totalNpcInstantPasses/Math.max(1,totalNpcPasses)).toFixed(6)),note:'<=180ms is used as a strict true-one-touch proxy; ordinary FIRST_TOUCH_FLOW settle delays are longer.'},rows};console.log(JSON.stringify(out,null,2));
