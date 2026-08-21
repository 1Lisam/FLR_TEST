#!/usr/bin/env python3
import subprocess,sys,re
from pathlib import Path
if len(sys.argv)<2: raise SystemExit('WORKDIR_REQUIRED')
work=Path(sys.argv[1]).resolve();base=Path(__file__).with_name('tt051_player_risk_choice_apply_v2.py').resolve()
subprocess.check_call([sys.executable,str(base),str(work)])
p=work/'runtime/protagonist_match_controller.js';s=p.read_text(encoding='utf-8')
start=s.index('  // PLAYER risk floor:')
end=s.index('  // A real, unblocked pass option must not disappear',start)
new="""  // PLAYER risk floor: the raw live pass geometry, not NPC ranking, decides whether a risky
  // pass can be shown. One blocker / tight pressure / a marginal offside shoulder remains a
  // player choice; the live engine still decides interception or OFFSIDE after execution.
  const riskyRaw=(frame?._frame?.opts||[]).filter(o=>o?.p&&['ST','WF','CM','FB'].includes(o.p.role)&&o.block<=1&&o.d<=42&&o.forward>0&&o.open>=0.35&&(o.offsideRisk||o.block>0||o.open<1.8)).sort((a,b)=>(Number(b.offsideRisk)-Number(a.offsideRisk))+(b.forward-a.forward)*.03+(Number(b.running)-Number(a.running))*.5).slice(0,2);
  for(const o of riskyRaw){
    if(out.some(x=>x.family==='패스'&&x.targetId===o.p.id))continue;
    if(out.length>=6){const ix=out.findIndex(x=>x.id==='HOLD'||x.id==='RECYCLE'||x.id==='CARRY');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const c={id:'AVAILABLE_PASS',targetId:o.p.id,targetName:`같은 팀 ${o.p.slot}`,meta:{targetId:o.p.id,targetSlot:o.p.slot,forward:o.forward,d:o.d,receiverPressure:o.open,contested:o.open<1.8||o.block>0,laneBlockers:o.block,offsideRisk:!!o.offsideRisk,offsideMargin:Number(o.offsideMargin||0)}};const row={id:c.id,targetId:c.targetId,targetName:c.targetName,family:'패스',label:labelFor(c),meta:deep(c.meta)};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}
  }
"""
s=s[:start]+new+s[end:];p.write_text(s,encoding='utf-8')
print('TT-0.51 player-risk choice v3 applied')
