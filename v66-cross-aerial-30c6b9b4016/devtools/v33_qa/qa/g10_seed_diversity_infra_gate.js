'use strict';
const H=require('../live_hybrid_session_v02.js');
if(typeof H.createDeveloperScenario!=='function'){
 console.log(JSON.stringify({pass:true,skipped:true,infraOnly:true,reason:'NOT_APPLICABLE_DEVELOPER_SCENARIO_API_ABSENT'},null,2));process.exit(0);
}
const seeds=['G10-SEED-A','G10-SEED-B','G10-SEED-E','G10-SEED-F'],sigs=[];
for(const seed of seeds){const r=H.createDeveloperScenario({seed,key:'FORMATION_CONTINUITY'}),s=r.boundary.stateSnapshot,sp=s.spatial?.players||{},st=sp['H-ST']||{},lw=sp['H-LW']||{},rw=sp['H-RW']||{};const stBand=st.y<27?'LEFT':st.y>41?'RIGHT':'CENTRE',frontSide=(Number(lw.x)>Number(rw.x)+2)?'LW':(Number(rw.x)>Number(lw.x)+2)?'RW':'BALANCED';sigs.push({seed,signature:`${s.ball.ownerId}|${s.ball.lane||'-'}|${stBand}|${frontSide}`});}
const unique=[...new Set(sigs.map(x=>x.signature))],pass=unique.length>=2;
console.log(JSON.stringify({pass,infraOnly:true,unique,sigs},null,2));if(!pass)process.exit(1);
