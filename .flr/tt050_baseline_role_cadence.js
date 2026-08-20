'use strict';
const path=require('path');
const ROOT=path.resolve(process.argv[2]||'.');
const P=require(path.join(ROOT,'runtime/protagonist_match_controller.js'));
const ROLES=[['ST','H-ST'],['CM','H-CM'],['CB','H-LCB'],['GK','H-GK']];
const seeds=3;
const out={schemaVersion:'FLR_TT050_BASELINE_ROLE_CADENCE_0.1',matchesPerRole:seeds,roles:{}};
function maxBurst(times,window=5){let best=0;for(let i=0,j=0;i<times.length;i++){while(times[i]-times[j]>window)j++;best=Math.max(best,i-j+1);}return best;}
for(const [role,id] of ROLES){
  const rows=[];
  for(let i=0;i<seeds;i++){
    const s=P.create(`TT050-BASE-${role}-${i}`,{heroPlayerId:id,mode:'PLAYER_ALL'});
    P.runAuto(s,5400);
    const times=(s.m.userChoiceLog||[]).map(x=>Number(x.at));
    const diffs=times.slice(1).map((t,k)=>t-times[k]);
    const scenes=P.sceneHistory(s),episodes=new Map();
    for(const sc of scenes){const ep=sc.episodeId||sc.sceneId;episodes.set(ep,(episodes.get(ep)||0)+1);}
    rows.push({choices:times.length,pauses:s.pauses.length,episodes:episodes.size,maxChoicesInEpisode:Math.max(0,...episodes.values()),maxBurst5s:maxBurst(times,5),sub2sGaps:diffs.filter(x=>x<2).length,sub3sGaps:diffs.filter(x=>x<3).length,medianGap:diffs.length?diffs.slice().sort((a,b)=>a-b)[Math.floor(diffs.length/2)]:null,score:s.m.score});
  }
  const avg=k=>rows.reduce((a,r)=>a+Number(r[k]||0),0)/rows.length;
  out.roles[role]={rows,avgChoices:Number(avg('choices').toFixed(2)),avgEpisodes:Number(avg('episodes').toFixed(2)),avgSub2sGaps:Number(avg('sub2sGaps').toFixed(2)),avgSub3sGaps:Number(avg('sub3sGaps').toFixed(2)),maxBurst5s:Math.max(...rows.map(r=>r.maxBurst5s)),maxChoicesInEpisode:Math.max(...rows.map(r=>r.maxChoicesInEpisode))};
}
console.log(JSON.stringify(out,null,2));
