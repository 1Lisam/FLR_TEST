from pathlib import Path
import runpy,re
runpy.run_path('.flr/v051_consolidated_retest_apply.py', run_name='__main__')
p=Path('runtime/continuous_match_core.js')
s=p.read_text(encoding='utf-8')

# Common resolved-action guard is NPC-only. Explicit protagonist choices must never be rewritten.
old="  if(action.type==='PASS'&&action.target){\n    const ol=worldToLocal(owner.team,owner.x,owner.y)"
new="  const npcDecision=!(m.protagonistExplicitActionRequired===true&&m.protagonistControllerId===owner.id);\n  if(npcDecision&&action.type==='PASS'&&action.target){\n    const ol=worldToLocal(owner.team,owner.x,owner.y)"
assert s.count(old)==1, s.count(old)
s=s.replace(old,new,1)

# Some NPC continuation/one-touch paths call executePass directly and bypass
# applyResolvedOwnerAction. Guard the final pass executor too, with the same explicit-user
# exemption and physical body-orientation requirement. No result is preselected: executeShot
# still runs the normal live shot/GK physics.
pat=r"(function executePass\(m,owner,target,[^\n]*\)\{\n)"
m=re.search(pat,s)
assert m,'executePass signature not found'
insert="""  const npcPassDecision=!(m.protagonistExplicitActionRequired===true&&m.protagonistControllerId===owner.id);
  if(npcPassDecision&&target){const ol=worldToLocal(owner.team,owner.x,owner.y),tl=worldToLocal(owner.team,target.x,target.y),backward=tl.x<ol.x-4.0;if(backward){const sa=shotAssessment(m,owner),blockers=Array.isArray(sa.blockers)?sa.blockers.length:Number(sa.blockers||0),central=Math.abs(ol.y-34),bodyReady=!!sa.oneVOne||(!sa.turningRequired&&Number(sa.facingAlignment??1)>=.38),strongFinish=!!sa.inBox&&!!sa.openWindow&&blockers===0&&sa.dGoal<=18.5&&central<=12.5&&bodyReady&&['ST','WF','CM'].includes(owner.role);if(strongFinish){m.stats.strongAttackBackpassGuards=(m.stats.strongAttackBackpassGuards||0)+1;return executeShot(m,owner,'STRONG_ATTACK_NO_HARMFUL_BACKPASS');}}}
"""
s=s[:m.end()]+insert+s[m.end():]
p.write_text(s,encoding='utf-8')
print('APPLIED_V051_CONSOLIDATED_RETEST_V2_USER_AUTHORITY_SAFE')
