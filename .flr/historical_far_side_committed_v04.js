'use strict';
const path=require('path');
const ROOT=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const E=require(path.join(ROOT,'runtime/continuous_match_core.js'));
const P=require(path.join(ROOT,'runtime/protagonist_match_controller.js'));
function run(seed){
  const s=P.create(seed,{heroPlayerId:'H-ST',mode:'PLAYER_ALL',replaySeconds:10});
  const out={seed,windows:0,missing:0,examples:[]};let guard=0;
  while(!s.m.completed&&s.m.time<2700&&guard++<350000){
    if(s.pending){
      const h=s.m.playersById['H-ST'];
      if(h&&s.currentScene?.checkpointInspect?.kind==='ON_BALL'){
        const po=E.choiceActionBridge().passOptions(s.m,h,'PLAYER');
        const committed=po.filter(o=>['H-LW','H-RW'].includes(o.p.id)&&!o.offsideRisk&&o.block===0&&o.open>=.45&&o.forward>1.5&&o.running===true&&Math.hypot(o.p.vx||0,o.p.vy||0)>=1.1&&Number(o.leadForward||0)>=2.5);
        if(committed.length){
          out.windows++;
          const ids=new Set(['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS']);
          const shown=(s.pending.options||[]).some(x=>ids.has(x.id)&&committed.some(c=>c.p.id===x.targetId));
          if(!shown){out.missing++;if(out.examples.length<8)out.examples.push({t:+s.m.time.toFixed(2),committed:committed.map(o=>({id:o.p.id,forward:+o.forward.toFixed(2),open:+o.open.toFixed(2),speed:+Math.hypot(o.p.vx||0,o.p.vy||0).toFixed(2),leadForward:+Number(o.leadForward||0).toFixed(2)})),options:(s.pending.options||[]).map(x=>[x.id,x.targetId||null])});}
        }
      }
      const p=P.autoPick(s)||s.pending.options?.[0];if(!p){s.pending=null;continue;}const r=P.applyChoice(s,p.id,p.targetId||null,{source:'HIST_FARSIDE_COMMITTED_V04'});if(!r.ok)s.pending=null;continue;
    }
    P.step(s,.1);
  }
  return out;
}
const rows=[];for(let i=1;i<=12;i++)rows.push(run(`HIST-FARSIDE-COMMITTED-${i}`));
const summary={matches:rows.length,windows:rows.reduce((n,x)=>n+x.windows,0),missing:rows.reduce((n,x)=>n+x.missing,0)};
const result={schemaVersion:'FLR_HISTORICAL_FARSIDE_COMMITTED_V04_1.0',summary,status:summary.windows>0&&summary.missing===0?'PASS':'FAIL',rows};
console.log(JSON.stringify(result));process.exit(result.status==='PASS'?0:1);
