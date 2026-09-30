'use strict';
const path=require('path'),root=path.resolve(__dirname,'..');
const R=require(path.join(root,'runtime/restart_movement.js'));global.FLRPG_RESTART_MOVEMENT=R;
const AC=require(path.join(root,'runtime/action_candidate_engine.js'));global.FLRPG_ACTION_CANDIDATE_ENGINE=AC;
const E=require(path.join(root,'runtime/continuous_match_core.js'));global.FLRPG_CONTINUOUS_CORE=E;
const P=require(path.join(root,'runtime/protagonist_match_controller.js'));
const H=require(path.join(root,'final_match_rare_scenario_harness.js'));
const checks=[];const check=(name,ok,detail='')=>{checks.push({name,ok:!!ok,detail});if(!ok)process.exitCode=1;};
const lx=p=>p.team==='AWAY'?105-p.x:p.x,ltx=p=>p.team==='AWAY'?105-p.tx:p.tx;

// Exact diagnosed live path: sample every 50 ms through the choice boundary.
const br=H.run('ST_BREAKAWAY','FINAL-MATCH-TEST-13',{runtimeDir:path.join(root,'runtime')}),frames=br.frames||[];
const live=frames.filter(f=>f.time>=2320.05&&f.time<=2320.55),cms=['A-LCM','A-CM','A-RCM'],cbs=['A-LCB','A-RCB'];
check('EXACT_NO_PRECOMPUTE',br.futureOutcomePrecomputed===false);
check('EXACT_PENDING_CHOICE',!!br.pending);
const badAll=live.filter(f=>{const cm=f.players.filter(p=>cms.includes(p.id)),cbX=Math.max(...f.players.filter(p=>cbs.includes(p.id)).map(lx));return cm.every(p=>ltx(p)<=cbX+.2)&&cm.every(p=>!['CUTBACK_TRACK','CM_RUNNER_TRACK','VACATED_DEFENDER_COVER'].includes(p.tacticalTask));});
check('CM_SECOND_LINE_INVARIANT',badAll.length===0,JSON.stringify(live.map(f=>({t:f.time,cms:f.players.filter(p=>cms.includes(p.id)).map(p=>({id:p.id,x:+ltx(p).toFixed(2),task:p.tacticalTask,mark:p.markTargetId})),cbs:f.players.filter(p=>cbs.includes(p.id)).map(p=>({id:p.id,x:+ltx(p).toFixed(2),task:p.tacticalTask}))}))));
check('H_LW_CONTEXT_FILTERED',!(br.pending.options||[]).some(o=>o.id==='SAFE_PASS'&&o.targetId==='H-LW'),JSON.stringify((br.pending.options||[]).map(o=>({id:o.id,targetId:o.targetId}))));

// Positive controls use only current state: a connected stationary feet receiver and a live run.
const m=E.createMatch('LUNA-POSITIVE-CONTROLS'),b=E.choiceActionBridge(),owner=b.playerById(m,'H-ST'),feet=b.playerById(m,'H-CM'),runner=b.playerById(m,'H-LW');
b.setControlled(m,owner);owner.x=60;owner.y=34;m.ball.x=60;m.ball.y=34;owner.controlledSince=m.time;
for(const p of m.players.filter(p=>p.team==='AWAY')){p.x=90;p.y=5+(Number(p.slot?.length)||0);p.tx=p.x;p.ty=p.y;}
feet.x=50;feet.y=34;feet.tx=50;feet.ty=34;feet.tacticalTask='BUILD_CONNECTOR';feet.action='BUILD_CONNECTOR';
runner.x=62;runner.y=30;runner.tx=68;runner.ty=29;runner.vx=3.5;runner.vy=-.5;runner.tacticalTask='WIDE_COMBINE';runner.action='WIDE_COMBINE';runner.runUntil=m.time+2;
const cf=E.choiceStateBridge().inspect(m,'H-ST'),opts=cf.candidates||[],pview=P.inspect({m,heroPlayerId:'H-ST'}),pops=pview?.options||[];
check('STATIONARY_CONNECTED_SAFE_VISIBLE',opts.some(o=>o.id==='SAFE_PASS'&&o.targetId==='H-CM')&&pops.some(o=>o.id==='SAFE_PASS'&&o.targetId==='H-CM'));
check('COMMITTED_RUN_SAFE_VISIBLE',opts.some(o=>o.id==='SAFE_PASS'&&o.targetId==='H-LW')&&pops.some(o=>o.id==='SAFE_PASS'&&o.targetId==='H-LW'));

// Exact target authority: apply the remaining exact-frame SAFE_PASS and verify flight target.
const exactTarget=br.pending.options.find(o=>o.id==='SAFE_PASS'&&o.targetId);
if(exactTarget){const exact=E.createMatch('LUNA-AUTHORITY'),eo=b.playerById(exact,'H-ST'),et=b.playerById(exact,exactTarget.targetId);for(const p of exact.players.filter(p=>p.team==='AWAY')){p.x=20;p.y=5+(Number(p.slot?.length)||0);p.tx=p.x;p.ty=p.y;}b.setControlled(exact,eo);eo.x=80;eo.y=34;exact.ball.x=80;exact.ball.y=34;et.x=70;et.y=34;et.tx=70;et.ty=34;et.tacticalTask='BUILD_CONNECTOR';const applied=E.choiceStateBridge().applyCandidate(exact,'H-ST','SAFE_PASS',exactTarget.targetId,'LUNA_QA');check('EXACT_TARGET_APPLY',applied.ok===true&&applied.targetId===exactTarget.targetId);check('EXACT_TARGET_FLIGHT_RECEIPT',exact.ball.intendedReceiverId===exactTarget.targetId,JSON.stringify(exact.ball));}

// Equivalent loose-ball regression: arbitration owns one primary and preserves CM roles.
const loose=E.createMatch('LUNA-LOOSE');loose.phase='OPEN_PLAY';loose.restart=null;loose.nextShape=0;b.setLoose(loose,76,34,0,0,'HOME','H-ST');E.step(loose,.05);const la=loose.looseBallArbitration,home=la?.teams?.HOME;
check('LOOSE_ONE_PRIMARY',!!home&&home.budget.primary===1&&home.budget.used<=1&&home.secondaryId==null);
check('LOOSE_CM_ROLE_PROTECTED',!!home&&loose.players.filter(p=>p.team==='HOME'&&p.role==='CM').every(p=>p.tacticalTask==='LOOSE_SECOND_BALL_LANE'||p.id===home.primaryId));
check('NO_UNSELECTED_HERO_ACTION',!(loose.events||[]).some(e=>e.actorId==='H-ST'&&['PASS','SHOT','TAKE_ON'].includes(e.type)));

const failed=checks.filter(x=>!x.ok);console.log(JSON.stringify({verdict:failed.length?'FAIL':'PASS_V37_BREAKAWAY_LUNA',checks},null,2));if(failed.length)process.exit(1);
