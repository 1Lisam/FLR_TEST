'use strict';
const path=require('path');
const ROOT=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const E=require(path.join(ROOT,'runtime/continuous_match_core.js'));
const P=require(path.join(ROOT,'runtime/protagonist_match_controller.js'));
const C=E.choiceStateBridge();
const local=(team,x)=>team==='HOME'?x:105-x;
const lp=(team,p)=>({x:local(team,p.x),y:team==='HOME'?p.y:68-p.y});
function ownerOf(m){return m.ball.mode==='CONTROLLED'?(m.playersById?.[m.ball.ownerId]||m.players.find(p=>p.id===m.ball.ownerId)):null;}
function inspectAttack(m,owner){
  const f=C.inspect(m,owner.id),opts=f?._frame?.opts||[],shot=f?.shot||{},pos=lp(owner.team,owner);
  const committed=opts.filter(o=>o.p?.role==='ST'&&!o.offsideRisk&&o.block===0&&o.open>=1.2&&o.forward>=2.5&&(o.running||['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p?.tacticalTask))&&o.leadForward>=2.5).sort((a,b)=>b.leadForward-a.leadForward)[0]||null;
  const blockers=Array.isArray(shot.blockers)?shot.blockers.length:Number(shot.blockers??99);
  const cleanShot=!!shot.inBox&&!!shot.openWindow&&blockers===0&&(shot.dGoal??99)<=18.5&&Math.abs(pos.y-34)<=12.5&&['ST','WF','CM'].includes(owner.role);
  const runnerLane=pos.x>=80&&!!committed;
  return{strong:cleanShot||runnerLane,cleanShot,runnerLane,committed};
}
function runNpc(seed){
  const m=E.createMatch(seed),out={seed,strongWindows:0,strongActions:0,harmfulBackpasses:0,deadAttackStalls:0,npcOneTouchPasses:0,examples:[]};
  let eventCursor=0,watch=null,guard=0;
  while(!m.completed&&guard++<140000){
    const owner=ownerOf(m);
    if(owner&&owner.role!=='GK'){
      const a=inspectAttack(m,owner);
      if(a.strong&&(!watch||watch.ownerId!==owner.id||watch.controlledSince!==owner.controlledSince)){
        out.strongWindows++;
        watch={ownerId:owner.id,team:owner.team,controlledSince:owner.controlledSince,startT:m.time,startX:owner.x,startY:owner.y,lastDecision:owner.lastDecision,cleanShot:a.cleanShot,runnerLane:a.runnerLane,runnerId:a.committed?.p?.id||null,runnerLead:a.committed?.leadForward??null};
      }else if(watch&&owner.id===watch.ownerId&&owner.controlledSince===watch.controlledSince&&a.strong){
        watch.cleanShot=watch.cleanShot||a.cleanShot;watch.runnerLane=watch.runnerLane||a.runnerLane;if(!watch.runnerId&&a.committed){watch.runnerId=a.committed.p.id;watch.runnerLead=a.committed.leadForward;}
      }
    }
    E.step(m,.1);
    const newEvents=m.events.slice(eventCursor);eventCursor=m.events.length;
    if(!watch)continue;
    const material=newEvents.find(e=>e.actorId===watch.ownerId&&['PASS','SHOT','TAKE_ON'].includes(e.type));
    if(material){
      out.strongActions++;
      if(material.type==='PASS'&&['PASS','LONG_PASS'].includes(material.passKind||'PASS')&&material.targetId){
        const target=m.players.find(p=>p.id===material.targetId),tx=target?local(watch.team,target.x):null,fromX=local(watch.team,watch.startX);
        if(tx!=null&&tx<fromX-4){out.harmfulBackpasses++;if(out.examples.length<12)out.examples.push({kind:'HARMFUL_BACKPASS',t:+(material.t??m.time).toFixed(2),owner:watch.ownerId,fromX:+fromX.toFixed(2),target:material.targetId,targetX:+tx.toFixed(2),cleanShot:watch.cleanShot,runnerLane:watch.runnerLane,runnerId:watch.runnerId,runnerLead:watch.runnerLead==null?null:+watch.runnerLead.toFixed(2)});}
      }
      watch=null;continue;
    }
    const now=ownerOf(m);
    if(!now||now.id!==watch.ownerId||now.controlledSince!==watch.controlledSince){watch=null;continue;}
    const age=m.time-watch.startT,move=Math.hypot(now.x-watch.startX,now.y-watch.startY),speed=Math.hypot(now.vx||0,now.vy||0),decisionChanged=now.lastDecision!==watch.lastDecision;
    if(age>=2.2&&move<0.85&&speed<0.75&&!decisionChanged){out.deadAttackStalls++;if(out.examples.length<12)out.examples.push({kind:'DEAD_ATTACK_STALL',t:+m.time.toFixed(2),owner:watch.ownerId,age:+age.toFixed(2),move:+move.toFixed(2),cleanShot:watch.cleanShot,runnerLane:watch.runnerLane,action:now.action,lastDecision:now.lastDecision,nextThink:+(now.nextThink||0).toFixed(2)});watch=null;}
    else if(age>4.0)watch=null;
  }
  out.npcOneTouchPasses=m.stats.npcOneTouchPasses||0;return out;
}
function runCarry(seed){
  const s=P.create(seed,{heroPlayerId:'H-ST',mode:'PLAYER_ALL',replaySeconds:10}),out={seed,carries:0,followups:0,badRapidCarryReprompts:0,minDelay:null,examples:[]};let watch=null,guard=0;
  while(!s.m.completed&&s.m.time<2700&&guard++<350000){
    if(s.pending){
      if(watch){const p=s.m.playersById?.['H-ST']||s.m.players.find(x=>x.id==='H-ST'),delay=s.m.time-watch.t,disp=p?Math.hypot(p.x-watch.x,p.y-watch.y):0;if(s.m.ball.ownerId==='H-ST'){out.followups++;out.minDelay=out.minDelay==null?delay:Math.min(out.minDelay,delay);if(delay<2.2&&disp<3.0){out.badRapidCarryReprompts++;if(out.examples.length<10)out.examples.push({t:+s.m.time.toFixed(2),delay:+delay.toFixed(2),displacement:+disp.toFixed(2)});}}watch=null;}
      const opts=s.pending.options||[],carry=opts.find(x=>x.id==='CARRY'),pick=carry||P.autoPick(s)||opts[0];if(!pick){s.pending=null;continue;}
      const p=s.m.playersById?.['H-ST']||s.m.players.find(x=>x.id==='H-ST');const r=P.applyChoice(s,pick.id,pick.targetId||null,{source:'HIST_V04_OPEN_GATES'});if(!r.ok){s.pending=null;continue;}if(pick.id==='CARRY'){out.carries++;watch={t:s.m.time,x:p?.x||0,y:p?.y||0};}continue;
    }
    P.step(s,.1);if(watch&&s.m.ball.ownerId!=='H-ST')watch=null;
  }
  if(out.minDelay!=null)out.minDelay=+out.minDelay.toFixed(2);return out;
}
const npc=[];for(let i=1;i<=24;i++)npc.push(runNpc(`HIST-V04-OPEN-NPC-${i}`));
const carry=[];for(let i=1;i<=8;i++)carry.push(runCarry(`HIST-V04-OPEN-CARRY-${i}`));
const summary={matches:npc.length,strongWindows:npc.reduce((n,x)=>n+x.strongWindows,0),strongActions:npc.reduce((n,x)=>n+x.strongActions,0),harmfulBackpasses:npc.reduce((n,x)=>n+x.harmfulBackpasses,0),deadAttackStalls:npc.reduce((n,x)=>n+x.deadAttackStalls,0),npcOneTouchPasses:npc.reduce((n,x)=>n+x.npcOneTouchPasses,0),carryChoices:carry.reduce((n,x)=>n+x.carries,0),carryFollowups:carry.reduce((n,x)=>n+x.followups,0),badRapidCarryReprompts:carry.reduce((n,x)=>n+x.badRapidCarryReprompts,0),minCarryFollowupDelay:Math.min(...carry.map(x=>x.minDelay??999))};if(summary.minCarryFollowupDelay===999)summary.minCarryFollowupDelay=null;
const gates={npcOneTouch:summary.npcOneTouchPasses>0,npcGoodAttackNoDeadStall:summary.deadAttackStalls===0,strongAttackNoHarmfulBackpass:summary.harmfulBackpasses===0,carryCadence:summary.badRapidCarryReprompts===0};
const result={schemaVersion:'FLR_HISTORICAL_OPEN_GATES_V04_1.0',engineRoot:ROOT,summary,gates,status:Object.values(gates).every(Boolean)?'PASS':'FAIL',npc,carry};
console.log(JSON.stringify(result));process.exit(result.status==='PASS'?0:1);
