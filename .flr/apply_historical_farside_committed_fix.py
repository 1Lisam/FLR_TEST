from pathlib import Path
import sys

p=Path(sys.argv[1])
s=p.read_text(encoding='utf-8')
marker='V0.4 historical far-side committed-run floor'
if marker in s:
    print('ALREADY_PATCHED far-side committed runner floor')
    raise SystemExit(0)
anchor="""  const release=ranked.find(c=>c.id==='THROUGH_PASS'&&['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(c.meta?.runnerTask));
  if(release&&!out.some(o=>o.id==='THROUGH_PASS'&&o.targetId===release.targetId)){
    if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='CARRY');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const row={id:release.id,targetId:release.targetId||null,targetName:release.targetName||null,family:'패스',label:labelFor(release),meta:release.meta?deep(release.meta):null};row.hint=tooltipFor(release,frame);row.tooltip=row.hint;out.push(row);}
  }
"""
if s.count(anchor)!=1:
    raise SystemExit(f'far-side anchor count={s.count(anchor)}')
insert=anchor+"""  // V0.4 historical far-side committed-run floor: Candidate ranking and physical pass
  // availability are separate contracts. If a winger is currently making a real, unblocked
  // lead run, the six-option display cap must not erase that live passing lane merely because
  // another candidate family ranked higher. Execution still re-checks the current pass geometry.
  const committedWide=(frame?._frame?.opts||[]).filter(o=>o?.p&&o.p.role==='WF'&&o.block===0&&o.open>=.45&&o.forward>1.5&&o.running===true&&Math.hypot(o.p.vx||0,o.p.vy||0)>=1.1&&Number(o.leadForward||0)>=2.5).sort((a,b)=>Number(b.leadForward||0)-Number(a.leadForward||0))[0]||null;
  if(committedWide&&!out.some(o=>o.family==='패스'&&o.targetId===committedWide.p.id)){
    if(out.length>=6){const ix=out.findIndex(o=>['HOLD','RECYCLE','CARRY','SAFE_PASS'].includes(o.id));if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const c={id:'THROUGH_PASS',targetId:committedWide.p.id,targetName:`같은 팀 ${committedWide.p.slot}`,meta:{targetId:committedWide.p.id,targetSlot:committedWide.p.slot,runnerTask:committedWide.p.tacticalTask||null,leadForward:Number(committedWide.leadForward||0),physicalCommittedRun:true}};const row={id:c.id,targetId:c.targetId,targetName:c.targetName,family:'패스',label:labelFor(c),meta:deep(c.meta)};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}
  }
"""
s=s.replace(anchor,insert,1)
old="const VERSION='TT051-PROTAGONIST-MATCH-CONTROLLER-1.7-CARRY-CADENCE-GUARD';"
new="const VERSION='TT051-PROTAGONIST-MATCH-CONTROLLER-1.8-HISTORICAL-CLOSURE';"
if old in s:s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('PATCH_OK far-side committed runner floor')
