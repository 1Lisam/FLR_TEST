from pathlib import Path

p=Path(__file__).with_name('v053_hf3_apply.py')
s=p.read_text(encoding='utf-8')
old1='"if(pressure<1.20&&held>0.28)owner.nextThink=Math.min(owner.nextThink,m.time+0.22+m.r()*0.18);",'
new1='"  else if(pressure<1.20&&held>0.28)owner.nextThink=Math.min(owner.nextThink,m.time);",'
old2='"if(pressure<1.65&&held>0.22)owner.nextThink=Math.min(owner.nextThink,m.time+0.18+m.r()*0.16);")'
new2='"  else if(pressure<1.65&&held>0.22)owner.nextThink=Math.min(owner.nextThink,m.time);")'
if old1 not in s or old2 not in s:
    raise SystemExit('HF3_V2_TRANSFORMER_SOURCE_ANCHOR_MISMATCH')
s=s.replace(old1,new1,1).replace(old2,new2,1)
exec(compile(s,str(p), 'exec'))
