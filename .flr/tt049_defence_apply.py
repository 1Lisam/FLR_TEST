#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
path=ROOT/'runtime/tactical_movement.js'
text=path.read_text(encoding='utf-8')

def repl(old,new,label):
    global text
    n=text.count(old)
    if n!=1:
        raise SystemExit(f'TT049_DEFENCE_REPLACE_COUNT {label} expected=1 actual={n}')
    text=text.replace(old,new,1)
    print(f'patched tactical_movement.js: {label}')

# Start the loose CB shoulder responsibility a little earlier. This remains a zonal reference:
# only one CB may take it, while the partner stays line/cover.
repl(
"if(cb&&cb.dd<=15.5){pairs[cb.d.id]=st.a.id;usedD.add(cb.d.id);usedA.add(st.a.id);}",
"if(cb&&cb.dd<=17.5){pairs[cb.d.id]=st.a.id;usedD.add(cb.d.id);usedA.add(st.a.id);m.stats.tt049EarlyCentralShoulder=(m.stats.tt049EarlyCentralShoulder||0)+1;}",
'early central shoulder'
)

# Keep the designated second defender active before the carrier is already at the last line.
# This changes target responsibility only; it never teleports the defender or forces a tackle.
repl(
"}else if(cover&&p.id===cover.id&&dist(p,m.ball)<20){",
"}else if(cover&&p.id===cover.id&&dist(p,m.ball)<24.5){",
'earlier cover activation'
)

old="""  if(ball.x<38&&['ST','WF','CM'].includes(owner.role)){
    const cbs=outfield(m,team).filter(p=>p.role==='CB'&&p.id!==lock.pressId);
    const guard=cbs.sort((a,b)=>worldToLocal(team,a.x,a.y).x-worldToLocal(team,b.x,b.y).x)[0]||null;
    if(guard){const gt=worldToLocal(team,guard.tx,guard.ty),needX=clamp(o.x-(ball.x<25?3.1:2.4),7.0,35.0);if(gt.x>needX+.35){const gy=clamp(lerp(34,o.y,0.58),19,49),w=localToWorld(team,needX,gy);guard.tx=w.x;guard.ty=w.y;guard.action=guard.tacticalTask='LAST_COVER_SCREEN';guard.markTargetId=null;}}
  }
"""
new="""  if(ball.x<42&&['ST','WF','CM'].includes(owner.role)){
    const cbs=outfield(m,team).filter(p=>p.role==='CB'&&p.id!==lock.pressId);
    // Pick the CB that can protect the dangerous corridor, not simply the deepest body.
    // A deep CB parked on the far side does not count as central last cover.
    const guard=cbs.map(p=>{const l=worldToLocal(team,p.x,p.y);return{p,l,score:l.x+Math.abs(l.y-o.y)*0.22};}).sort((a,b)=>a.score-b.score)[0]?.p||null;
    if(guard){
      const gt=worldToLocal(team,guard.tx,guard.ty),nearBox=ball.x<25,needX=clamp(o.x-(nearBox?3.9:3.0),6.8,35.0),gy=clamp(lerp(34,o.y,nearBox?0.34:0.42),20,48);
      const xTooHigh=gt.x>needX+.30,laneTooWide=Math.abs(gt.y-gy)>4.2;
      if(xTooHigh||laneTooWide){
        const tx=xTooHigh?needX:Math.min(gt.x,needX+.25),ty=laneTooWide?lerp(gt.y,gy,0.72):gt.y,w=localToWorld(team,tx,ty);
        guard.tx=w.x;guard.ty=w.y;guard.action=guard.tacticalTask='LAST_COVER_SCREEN';guard.markTargetId=null;
        m.stats.tt049ZoneLastCoverCorrections=(m.stats.tt049ZoneLastCoverCorrections||0)+1;
      }
    }
    // The pivot protects the pass/cutback lane instead of joining the carrier swarm.
    const pivot=outfield(m,team).find(p=>p.slot==='CM'&&p.id!==lock.pressId);
    if(pivot&&Math.abs(o.y-34)<=15.5){
      const pt=worldToLocal(team,pivot.tx,pivot.ty),px=clamp(ball.x+6.2,20,44),py=clamp(lerp(34,o.y,0.20),24,44);
      if(pt.x<ball.x+2.0||Math.abs(pt.y-py)>8.5){const w=localToWorld(team,px,py);pivot.tx=w.x;pivot.ty=w.y;pivot.action=pivot.tacticalTask='PIVOT_SCREEN_DEF';pivot.markTargetId=null;m.stats.tt049PivotLaneCorrections=(m.stats.tt049PivotLaneCorrections||0)+1;}
    }
  }
"""
repl(old,new,'zone last-cover and pivot screen')

path.write_text(text,encoding='utf-8')
print('TT049_DEFENCE_APPLY_OK')
