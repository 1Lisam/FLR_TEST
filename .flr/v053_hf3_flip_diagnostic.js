'use strict';
const path=require('path');
const H=require('../live_hybrid_session_v02.js');
const A=require('../live_v06_scene_authority_browser.js');
const E=require('../runtime/continuous_match_core.js');
const P=require('../runtime/protagonist_match_controller.js');
const runtimeDir=path.resolve(__dirname,'../runtime');
const byId=(f,id)=>(f.players||[]).find(p=>p.id===id)||null;
const n2=v=>Number.isFinite(Number(v))?+Number(v).toFixed(2):null;
function run(key,seed,ids,seconds=9){
  const d=H.createDeveloperScenario({key,seed});
  const env=A.seedMatch(d.boundary,{runtimeDir,seed:d.seed,explicitHeroChoiceRequired:false});
  env.state.mode='FULL_SKIP';
  const rows=[E.snapshot(env.state.m)];
  for(let i=0;i<Math.round(seconds/.1)&&!env.state.m.completed;i++){P.step(env.state,.1);rows.push(E.snapshot(env.state.m));}
  const result={key,seed,players:{}};
  for(const id of ids){
    const flips=[];let lastSign=0,lastMove=null;
    for(let i=1;i<rows.length;i++){
      const fa=rows[i-1],fb=rows[i],a=byId(fa,id),b=byId(fb,id);if(!a||!b)continue;
      const dy=b.y-a.y;if(Math.abs(dy)<.06)continue;
      const sign=dy>0?1:-1;
      if(lastSign&&sign!==lastSign){
        flips.push({t:n2(fb.time),dy:+dy.toFixed(3),fromSign:lastSign,toSign:sign,task:b.tacticalTask||b.action||null,mark:b.markTargetId||null,x:n2(b.x),y:n2(b.y),tx:n2(b.tx),ty:n2(b.ty),ballOwner:fb.ball?.ownerId||null,ballX:n2(fb.ball?.x),ballY:n2(fb.ball?.y),prevMove:lastMove});
      }
      lastSign=sign;lastMove={t:n2(fb.time),dy:+dy.toFixed(3),task:b.tacticalTask||b.action||null,tx:n2(b.tx),ty:n2(b.ty)};
    }
    result.players[id]={flipCount:flips.length,flips};
  }
  return result;
}
const out=[
 run('BALL_DEPTH_SYNC','DEV-RECENT-1787550734911-1',['H-ST','A-LB','A-RB']),
 run('BALL_DEPTH_SYNC','DEV-RECENT-1787550810767-13',['H-RW','A-LB','A-RB']),
 run('CM_SUPPORT_SPREAD','DEV-RECENT-1787550909999-20',['A-LB','A-LCB','A-RB','A-LCM','A-RCM'])
];
console.log(JSON.stringify(out,null,2));
