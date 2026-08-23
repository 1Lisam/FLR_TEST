from pathlib import Path
import runpy

# Apply the four current V0.5 user-report corrections first.
runpy.run_path('.flr/v05_followup_apply.py', run_name='__main__')

# 5) CARRY cadence: after a user-committed carry, do not reopen another checkpoint
# before either meaningful physical progress (>=3m), 2.2 visible/live seconds, possession
# change, or a genuinely new critical shot state. This is causal state continuity, not a quota.
p=Path('runtime/protagonist_match_controller.js')
s=p.read_text(encoding='utf-8')
if 'carryContinuationGuard' not in s:
    old="lastChoiceAt:-99,lastChoice:null,pauses:[]"
    assert old in s
    s=s.replace(old,"lastChoiceAt:-99,lastChoice:null,carryContinuationGuard:null,pauses:[]",1)

    old="updateEpisodeState(s);const def=modeDef(s);if(s.pending||s.resultTracker||def.presentation==='SKIP'||s.m.completed||s.m.restart)return null;const q=inspect(s);"
    assert old in s
    new=old+"\n  // V0.5.1 consolidated retest: keep one selected CARRY as one continuous movement\n  // intention instead of reopening another choice after 1.0-1.4s of tiny displacement.\n  // A materially new critical finishing state may still interrupt immediately.\n  if(s.carryContinuationGuard){const h=hero(s),g=s.carryContinuationGuard,heroOwn=!!h&&s.m.ball.mode==='CONTROLLED'&&s.m.ball.ownerId===s.heroPlayerId,sameControl=heroOwn&&Math.abs(Number(h.controlledSince||0)-Number(g.controlledSince||0))<.001;if(!sameControl){s.carryContinuationGuard=null;}else{const age=s.m.time-g.startedAt,disp=Math.hypot(h.x-g.x,h.y-g.y),blockers=Array.isArray(q?.frame?.shot?.blockers)?q.frame.shot.blockers.length:Number(q?.frame?.shot?.blockers??99),critical=!!(q?.frame?.shot?.oneVOne||(q?.frame?.shot?.inBox&&q?.frame?.shot?.openWindow&&blockers<=1));if(critical||age>=2.2||disp>=3.0){s.carryContinuationGuard=null;}else{s.m.stats.userCarryContinuationCheckpointDeferrals=(s.m.stats.userCarryContinuationCheckpointDeferrals||0)+1;return null;}}}"
    s=s.replace(old,new,1)

    old="s.lastChoiceAt=s.m.time;s.lastChoice={at:Number(s.m.time.toFixed(2)),choice:opt.id,label:opt.label,targetId:opt.targetId||null,targetName:opt.targetName||null,family:opt.family||family(opt.id),kind:s.pending.kind,inputSource,futureOutcomePrecomputed:false};"
    assert old in s
    new=old+"\n    if(opt.id==='CARRY'){const ch=hero(s);if(ch)s.carryContinuationGuard={startedAt:s.m.time,x:ch.x,y:ch.y,controlledSince:ch.controlledSince};}else s.carryContinuationGuard=null;"
    s=s.replace(old,new,1)
    p.write_text(s,encoding='utf-8')

# 6) Strong-attack no-harmful-backpass guard for NPC decisions.
# If a generic backward PASS/LONG_PASS is about to erase a real open finishing window,
# take the causal finish. If a committed ST run is live, prefer that actual runner.
# This changes action selection only; shot/pass outcomes remain live physics.
p=Path('runtime/continuous_match_core.js')
s=p.read_text(encoding='utf-8')
if 'STRONG_ATTACK_NO_HARMFUL_BACKPASS' not in s:
    old="function applyResolvedOwnerAction(m,owner,action){\n  if(!owner||!action)return false;owner.receiveRunContinuationUntil=0;"
    assert old in s
    new="""function applyResolvedOwnerAction(m,owner,action){
  if(!owner||!action)return false;owner.receiveRunContinuationUntil=0;
  if(action.type==='PASS'&&action.target){
    const ol=worldToLocal(owner.team,owner.x,owner.y),tl=worldToLocal(owner.team,action.target.x,action.target.y),backward=tl.x<ol.x-4.0;
    if(backward){
      const sa=shotAssessment(m,owner),blockers=Array.isArray(sa.blockers)?sa.blockers.length:Number(sa.blockers||0),central=Math.abs(ol.y-34),strongFinish=!!sa.inBox&&!!sa.openWindow&&blockers===0&&sa.dGoal<=18.5&&central<=12.5&&['ST','WF','CM'].includes(owner.role);
      if(strongFinish){action={type:'SHOT',reason:'STRONG_ATTACK_NO_HARMFUL_BACKPASS'};m.stats.strongAttackBackpassGuards=(m.stats.strongAttackBackpassGuards||0)+1;}
      else{
        const opts=passOptions(m,owner,true),runner=opts.filter(o=>o?.p?.role==='ST'&&!o.offsideRisk&&o.block===0&&o.open>=1.2&&o.forward>=2.5&&(o.running||['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(o.p?.tacticalTask))&&o.leadForward>=2.5).sort((a,b)=>b.leadForward-a.leadForward)[0]||null;
        if(runner){action={type:'PASS',target:runner.p,kind:'THROUGH',option:runner,reason:'COMMITTED_RUNNER_NO_HARMFUL_BACKPASS'};m.stats.strongAttackBackpassGuards=(m.stats.strongAttackBackpassGuards||0)+1;}
      }
    }
  }"""
    s=s.replace(old,new,1)
    p.write_text(s,encoding='utf-8')

print('APPLIED_V051_CONSOLIDATED_RETEST')
