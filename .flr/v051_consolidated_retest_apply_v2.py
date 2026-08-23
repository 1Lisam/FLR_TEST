from pathlib import Path
import runpy
runpy.run_path('.flr/v051_consolidated_retest_apply.py', run_name='__main__')
p=Path('runtime/continuous_match_core.js')
s=p.read_text(encoding='utf-8')
old="  if(action.type==='PASS'&&action.target){\n    const ol=worldToLocal(owner.team,owner.x,owner.y)"
new="  const npcDecision=!(m.protagonistExplicitActionRequired===true&&m.protagonistControllerId===owner.id);\n  if(npcDecision&&action.type==='PASS'&&action.target){\n    const ol=worldToLocal(owner.team,owner.x,owner.y)"
assert s.count(old)==1, s.count(old)
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('APPLIED_V051_CONSOLIDATED_RETEST_V2_USER_AUTHORITY_SAFE')
