'use strict';
const path=require('path');
const ROOT=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const P=require(path.join(ROOT,'runtime/protagonist_match_controller.js'));
function run(seed){
  const s=P.create(seed,{heroPlayerId:'H-ST',mode:'PLAYER_ALL',replaySeconds:10});
  const out={seed,carries:0,followups:0,rapidFollowups:0,repeatedCarryCadenceFailures:0,minDelay:null,examples:[]};let watch=null,guard=0;
  while(!s.m.completed&&s.m.time<2700&&guard++<350000){
    if(s.pending){
      const opts=s.pending.options||[];
      if(watch){
        const p=s.m.playersById?.['H-ST']||s.m.players.find(x=>x.id==='H-ST'),delay=s.m.time-watch.t,disp=p?Math.hypot(p.x-watch.x,p.y-watch.y):0;
        if(s.m.ball.ownerId==='H-ST'){
          out.followups++;out.minDelay=out.minDelay==null?delay:Math.min(out.minDelay,delay);
          const q=P.inspect(s),f=q?.frame||{},blockers=Array.isArray(f.shot?.blockers)?f.shot.blockers.length:Number(f.shot?.blockers??99),critical=!!(f.shot?.oneVOne||(f.shot?.inBox&&f.shot?.openWindow&&blockers<=1));
          const repeatedCarry=opts.some(o=>o.id==='CARRY');
          if(delay<2.2&&disp<3.0){out.rapidFollowups++;if(repeatedCarry&&!critical){out.repeatedCarryCadenceFailures++;if(out.examples.length<12)out.examples.push({t:+s.m.time.toFixed(2),delay:+delay.toFixed(2),displacement:+disp.toFixed(2),pressure:Number.isFinite(f.pressure)?+f.pressure.toFixed(2):null,space:Number.isFinite(f.space)?+f.space.toFixed(2):null,critical,repeatedCarry,options:opts.map(o=>o.id)});}}
        }
        watch=null;
      }
      const carry=opts.find(x=>x.id==='CARRY'),pick=carry||P.autoPick(s)||opts[0];if(!pick){s.pending=null;continue;}
      const p=s.m.playersById?.['H-ST']||s.m.players.find(x=>x.id==='H-ST');const r=P.applyChoice(s,pick.id,pick.targetId||null,{source:'HIST_V04_CARRY_CADENCE'});if(!r.ok){s.pending=null;continue;}
      if(pick.id==='CARRY'){out.carries++;watch={t:s.m.time,x:p?.x||0,y:p?.y||0};}
      continue;
    }
    P.step(s,.1);if(watch&&s.m.ball.ownerId!=='H-ST')watch=null;
  }
  if(out.minDelay!=null)out.minDelay=+out.minDelay.toFixed(2);return out;
}
const rows=[];for(let i=1;i<=8;i++)rows.push(run(`HIST-V04-CARRY-${i}`));
const summary={seeds:rows.length,carries:rows.reduce((n,x)=>n+x.carries,0),followups:rows.reduce((n,x)=>n+x.followups,0),rapidFollowups:rows.reduce((n,x)=>n+x.rapidFollowups,0),repeatedCarryCadenceFailures:rows.reduce((n,x)=>n+x.repeatedCarryCadenceFailures,0),minDelay:Math.min(...rows.map(x=>x.minDelay??999))};if(summary.minDelay===999)summary.minDelay=null;
const result={schemaVersion:'FLR_HISTORICAL_CARRY_CADENCE_V04_1.0',engineRoot:ROOT,summary,status:summary.repeatedCarryCadenceFailures===0?'PASS':'FAIL',rows};console.log(JSON.stringify(result));process.exit(result.status==='PASS'?0:1);
