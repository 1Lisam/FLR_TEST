from pathlib import Path
p=Path('runtime/tactical_movement.js')
s=p.read_text(encoding='utf-8')
old="if(d.role==='CM'&&a.role==='ST'&&ball.x<28&&Math.abs(al.y-34)<13)return false;"
new="if(d.role==='CM'&&a.role==='ST'&&ball.x<44&&Math.abs(al.y-34)<15)return false;"
if s.count(old)!=1:
    raise SystemExit(f'central ST CM guard: expected 1 match, got {s.count(old)}')
p.write_text(s.replace(old,new,1),encoding='utf-8')
print('V054_CM_STICKY_MARK_GUARD_APPLIED')
