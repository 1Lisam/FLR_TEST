'use strict';
const path=require('path');
const ROOT=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const E=require(path.join(ROOT,'runtime/continuous_match_core.js'));
const C=E.choiceStateBridge();
const local=(team,x)=>team==='HOME'?x:105-x;
const lp=(team,p)=>({x:local(team,p.x),y:team==='HOME'?p.y:68-p.y});
const ownerOf=m=>m.ball.mode==='CONTROLLED'?m.players.find(p=>p.id===m.ball.ownerId):null;
function inspectAttack(m,owner){
  const f=C.inspect(m,owner.id),opts=f?._frame?.opts||[],shot=f?.shot||{},pos=lp(owner.team,owner);
  const committed=opts.filter(o=>o.p?.role==='ST'&&!o.offsideRisk&&o.block===0&&o.open>=1.2&&o.forward>=2.5&&(o.running||['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p?.tacticalTask))&&o.leadForward>=2.5).sort((a,b)=>b.leadForward-a.leadForward)[0]||null;
  const blockers=Array.isArray(shot.blockers)?shot.blockers.length:Number(shot.blockers??99);
  const bodyReady=!!shot.oneVOne||(!shot.turningRequired&&Number(shot.facingAlignment??1)>=.38);
  const cleanShot=!!shot.inBox&&!!shot.openWindow&&blockers===0&&(shot.dGoal??99)<=18.5&&Math.abs(pos.y-34)<=12.5&&bodyReady&&['ST','WF','CM'].includes(owner.role);
  const runnerLane=pos.x>=80&&!!committed;
  return{strong:cleanShot||runnerLane,cleanShot,runnerLane,committed,pos,bodyReady};
}
function run(seed){
  const m=E.createMatch(seed),out={seed,strongWindows:0,strongActionFrames:0,harmfulBackpasses:0,deadAttackStalls:0,npcOneTouchPasses:0,examples:[]};let eventCursor=0,watch=null,guard=0;
  while(!m.completed&&guard++<140000){
    const owner=ownerOf(m),attack=owner&&owner.role!=='GK'?inspectAttack(m,owner):null;
    if(owner&&attack?.strong){if(!watch||watch.ownerId!==owner.id||watch.controlledSince!==owner.controlledSince){out.strongWindows++;watch={ownerId:owner.id,team:owner.team,controlledSince:owner.controlledSince,startT:m.time,startX:owner.x,startY:owner.y,lastDecision:owner.lastDecision,cleanShot:attack.cleanShot,runnerLane:attack.runnerLane};}else{watch.cleanShot=watch.cleanShot||attack.cleanShot;watch.runnerLane=watch.runnerLane||attack.runnerLane;}}
    const frame={ownerId:owner?.id||null,team:owner?.team||null,x:owner?.x??null,controlledSince:owner?.controlledSince??null,attack};
    E.step(m,.1);
    const newEvents=m.events.slice(eventCursor);eventCursor=m.events.length;
    const material=frame.ownerId?newEvents.find(e=>e.actorId===frame.ownerId&&['PASS','SHOT','TAKE_ON'].includes(e.type)):null;
    if(material&&frame.attack?.strong){out.strongActionFrames++;if(material.type==='PASS'&&['PASS','LONG_PASS'].includes(material.passKind||'PASS')&&material.targetId){const target=m.players.find(p=>p.id===material.targetId),tx=target?local(frame.team,target.x):null,fromX=local(frame.team,frame.x);if(tx!=null&&tx<fromX-4){out.harmfulBackpasses++;if(out.examples.length<10)out.examples.push({t:+m.time.toFixed(2),owner:frame.ownerId,fromX:+fromX.toFixed(2),target:material.targetId,targetX:+tx.toFixed(2),cleanShot:frame.attack.cleanShot,runnerLane:frame.attack.runnerLane,bodyReady:frame.attack.bodyReady});}}}
    if(!watch)continue;const now=ownerOf(m);if(!now||now.id!==watch.ownerId||now.controlledSince!==watch.controlledSince){watch=null;continue;}const age=m.time-watch.startT,move=Math.hypot(now.x-watch.startX,now.y-watch.startY),speed=Math.hypot(now.vx||0,now.vy||0),decisionChanged=now.lastDecision!==watch.lastDecision;if(age>=2.2&&move<.85&&speed<.75&&!decisionChanged){out.deadAttackStalls++;watch=null;}else if(age>4||material)watch=null;
  }
  out.npcOneTouchPasses=m.stats.npcOneTouchPasses||0;return out;
}
const rows=[];for(let i=1;i<=24;i++)rows.push(run(`HIST-V04-OPEN-NPC-${i}`));
const summary={matches:rows.length,strongWindows:rows.reduce((n,x)=>n+x.strongWindows,0),strongActionFrames:rows.reduce((n,x)=>n+x.strongActionFrames,0),harmfulBackpasses:rows.reduce((n,x)=>n+x.harmfulBackpasses,0),deadAttackStalls:rows.reduce((n,x)=>n+x.deadAttackStalls,0),npcOneTouchPasses:rows.reduce((n,x)=>n+x.npcOneTouchPasses,0)};
const gates={npcOneTouch:summary.npcOneTouchPasses>0,npcGoodAttackNoDeadStall:summary.deadAttackStalls===0,physicallyActionableAttackNoHarmfulBackpass:summary.harmfulBackpasses===0};
const result={schemaVersion:'FLR_V051_REALITY_OPEN_GATES_1.0',summary,gates,status:Object.values(gates).every(Boolean)?'PASS':'FAIL',rows};console.log(JSON.stringify(result));process.exit(result.status==='PASS'?0:1);
