from pathlib import Path
p=Path('runtime/tactical_movement.js');s=p.read_text(encoding='utf-8')
old="""      if(boxWave&&(surge||!recover)){
        const x=safeForwardLocal(m,p,clamp(progress+3,84,90.5));
        const y=34+sg*(ss?6.5:10.0);
        return{lx:x,ly:y,task:'LATE_BOX_ARRIVAL',sprint:true};
      }
"""
new="""      if(boxWave&&(surge||!recover)){
        const otherReservedBoxCm=[...(ctx.boxAssignments||new Map()).entries()].some(([id,q])=>{
          if(id===p.id||!q||Number(q.lx)<87)return false;
          const mate=teamPlayers(m,p.team).find(z=>z.id===id);return mate?.role==='CM';
        });
        if(otherReservedBoxCm){
          const live=liveSupportOffset(m,p,0.48,0.36),x=clamp(progress-10+live.x,76,83),y=clamp(34+sg*(ss?7.5:10.0)+live.y,10,58);
          return{lx:x,ly:y,task:'SECOND_BALL_SUPPORT',sprint:Math.abs(local.x-x)>3.2||Math.abs(local.y-y)>4.0};
        }
        const x=safeForwardLocal(m,p,clamp(progress+3,84,90.5));
        const y=34+sg*(ss?6.5:10.0);
        return{lx:x,ly:y,task:'LATE_BOX_ARRIVAL',sprint:true};
      }
"""
if s.count(old)!=1: raise SystemExit(f'second-ball layer: expected 1 match got {s.count(old)}')
p.write_text(s.replace(old,new,1),encoding='utf-8')
print('V054_SECOND_BALL_LAYER_APPLIED')
