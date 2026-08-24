from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def r1(path,old,new):
    p=ROOT/path
    s=p.read_text(encoding='utf-8')
    if new in s:
        return
    n=s.count(old)
    if n!=1:
        raise SystemExit(f'HF3_V6_ANCHOR {path} count={n}: {old[:120]}')
    p.write_text(s.replace(old,new,1),encoding='utf-8')

t=Path('runtime/tactical_movement.js')

# HF3-v6: while a full-back is already executing the same WIDE_RUN_TRACK responsibility
# during one uninterrupted flight, do not commit to a reversed lateral lane from a single
# transient target sample.  The reversed direction must survive three fast tactical updates
# (~0.54 s at the existing 0.18 s cadence).  A real task/mark/owner-context change bypasses
# this hold immediately, so defensive reactions are not globally slowed.
r1(t,
"""      else if(m.time>=Number(prev.laneUntil||0)){
        const cap=fastMotion?1.15:1.65,step=clamp(Number(proposed.ty)-Number(prev.laneTy),-cap,cap);
        prev.laneTy=clamp(Number(prev.laneTy)+step,2,66);prev.laneUntil=m.time+(fastMotion?.18:.42);
      }
      p.ty=lerp(Number(prev.ty),Number(prev.laneTy),hardMotionEmergency?.88:fastMotion?.72:.58);
      prev.family=finalFamily;prev.task=p.tacticalTask;prev.action=p.action;prev.markTargetId=finalMark;prev.tx=p.tx;prev.ty=p.ty;
    }else state.players[p.id]={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:Number(p.tx),ty:Number(p.ty),laneTy:Number(p.ty),laneUntil:m.time+.32,since:m.time,minUntil:m.time+defensiveResponsibilityHold(family),lastLateralFlipAt:-99};
""",
"""      else if(m.time>=Number(prev.laneUntil||0)){
        const delta=Number(proposed.ty)-Number(prev.laneTy),desiredSign=Math.abs(delta)>=.18?Math.sign(delta):0;
        const stableFlightWide=m.ball.mode==='FLIGHT'&&finalFamily==='WIDE_TRACK'&&p.tacticalTask==='WIDE_RUN_TRACK'&&prev.task==='WIDE_RUN_TRACK'&&prev.markTargetId===finalMark&&!ownerChanged;
        let acceptLaneStep=true;
        if(stableFlightWide&&desiredSign){
          const committed=Number(prev.laneDirection||0);
          if(committed&&desiredSign!==committed){
            if(Number(prev.pendingLaneDirection||0)!==desiredSign){prev.pendingLaneDirection=desiredSign;prev.pendingLaneSince=m.time;acceptLaneStep=false;}
            else if(m.time-Number(prev.pendingLaneSince||m.time)<.54)acceptLaneStep=false;
            else{prev.laneDirection=desiredSign;prev.lastLateralFlipAt=m.time;prev.pendingLaneDirection=0;}
          }else{prev.laneDirection=desiredSign;prev.pendingLaneDirection=0;}
        }else{
          if(desiredSign)prev.laneDirection=desiredSign;
          prev.pendingLaneDirection=0;
        }
        if(acceptLaneStep){const cap=fastMotion?1.15:1.65,step=clamp(delta,-cap,cap);prev.laneTy=clamp(Number(prev.laneTy)+step,2,66);}
        prev.laneUntil=m.time+(fastMotion?.18:.42);
      }
      p.ty=lerp(Number(prev.ty),Number(prev.laneTy),hardMotionEmergency?.88:fastMotion?.72:.58);
      prev.family=finalFamily;prev.task=p.tacticalTask;prev.action=p.action;prev.markTargetId=finalMark;prev.tx=p.tx;prev.ty=p.ty;
    }else state.players[p.id]={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:Number(p.tx),ty:Number(p.ty),laneTy:Number(p.ty),laneUntil:m.time+.32,since:m.time,minUntil:m.time+defensiveResponsibilityHold(family),lastLateralFlipAt:-99,laneDirection:0,pendingLaneDirection:0,pendingLaneSince:-99};
""")

# A new live receiver/owner is a real context change; discard any pending direction vote.
r1(t,
"""  if(ownerChanged){state.ownerId=owner.id;for(const q of Object.values(state.players||{})){q.minUntil=m.time+.16;q.laneUntil=m.time;q.lastLateralFlipAt=-99;}}
""",
"""  if(ownerChanged){state.ownerId=owner.id;for(const q of Object.values(state.players||{})){q.minUntil=m.time+.16;q.laneUntil=m.time;q.lastLateralFlipAt=-99;q.laneDirection=0;q.pendingLaneDirection=0;q.pendingLaneSince=-99;}}
""")

print('HF3_TUNE_V6_OK')
