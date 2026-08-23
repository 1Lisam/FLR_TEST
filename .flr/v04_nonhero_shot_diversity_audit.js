'use strict';
const path=require('path');
const H=require(path.resolve(process.argv[2]||'.','live_hybrid_session_v02.js'));
const N=Number(process.argv[3]||80);
const rows=[];
for(let i=0;i<N;i++){
  const s=H.createSession({seed:`V04-NONHERO-DIVERSITY-${i}`,heroTeam:'HOME',heroRole:'ST',heroPlayerId:'H-ST'});
  let guard=0;
  while(s.status!=='FINISHED'&&guard++<3000){
    const r=H.advanceUntilBoundary(s);
    const b=r.boundary;
    if(!b)break;
    if(b.type==='NON_HERO_SHOT_2D_WINDOW'){
      rows.push({seed:i,sceneId:b.sceneId,t:Number(b.atSecond.toFixed(1)),team:b.shot?.team,shooterId:b.shot?.shooterId,quality:Number((b.shot?.quality||0).toFixed(3)),zone:b.shot?.fromZone,lane:b.stateSnapshot?.ball?.lane,progress:Number((b.stateSnapshot?.ball?.progress||0).toFixed(3)),phase:b.stateSnapshot?.phase});
      // We are auditing low-res candidate diversity only. Resume with a neutral unchanged snapshot so the session can continue.
      H.resumeFromHighRes(s,{snapshot:{time:b.atSecond,score:b.stateSnapshot.score,phase:'OPEN_PLAY',possession:b.stateSnapshot.possession,ball:{mode:'CONTROLLED',x:52.5,y:34,z:0,ownerId:b.stateSnapshot.ball.ownerId,lastTouchTeam:b.stateSnapshot.possession},players:[]},actualEvents:[],hadChoice:false});
    }else if(b.type==='MATCH_END'||b.type==='FINAL_2D_WINDOW'){
      if(b.type==='FINAL_2D_WINDOW') H.resumeFromHighRes(s,{snapshot:{time:5400,completed:true,score:b.stateSnapshot.score,phase:'FULL_TIME',possession:b.stateSnapshot.possession,ball:{mode:'DEAD',x:52.5,y:34,z:0,ownerId:null},players:[]},actualEvents:[],hadChoice:false});
      else break;
    }else{
      // Preserve low-res context without inventing a result; sufficient for diversity sampling.
      const st=b.stateSnapshot||{};
      H.resumeFromHighRes(s,{snapshot:{time:b.atSecond,score:st.score||s.state.score,phase:'OPEN_PLAY',possession:st.possession||s.state.possession,ball:{mode:'CONTROLLED',x:52.5,y:34,z:0,ownerId:st.ball?.ownerId||null,lastTouchTeam:st.possession||s.state.possession},players:[]},actualEvents:[],hadChoice:false});
    }
  }
}
const countBy=(key)=>Object.fromEntries([...rows.reduce((m,r)=>m.set(String(r[key]),(m.get(String(r[key]))||0)+1),new Map())].sort((a,b)=>b[1]-a[1]));
const shooter=countBy('shooterId'),lane=countBy('lane'),zone=countBy('zone'),team=countBy('team');
const topShooter=Math.max(0,...Object.values(shooter));
const prog=rows.map(r=>r.progress).filter(Number.isFinite);
const summary={schemaVersion:'FLR_V04_NONHERO_SHOT_DIVERSITY_1.0',matches:N,windows:rows.length,uniqueShooters:Object.keys(shooter).length,shooterCounts:shooter,laneCounts:lane,zoneCounts:zone,teamCounts:team,topShooterShare:rows.length?Number((topShooter/rows.length).toFixed(3)):null,progress:{min:prog.length?Math.min(...prog):null,max:prog.length?Math.max(...prog):null,mean:prog.length?Number((prog.reduce((a,b)=>a+b,0)/prog.length).toFixed(3)):null},sample:rows.slice(0,30)};
console.log(JSON.stringify(summary,null,2));
