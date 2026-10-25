from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def r1(path,old,new):
 p=ROOT/path;s=p.read_text(encoding='utf-8')
 if new in s:return
 n=s.count(old)
 if n!=1:raise SystemExit(f'HF3_V4_ANCHOR {path} count={n}: {old[:100]}')
 p.write_text(s.replace(old,new,1),encoding='utf-8')

# The v3 workspace already contains HF3 base + tune-v2. Replace the stabilizer with a
# responsibility-level lock plus a slowly moving defensive lane target. Emergency press/wide
# tracking still bypasses the lock immediately.
t=Path('runtime/tactical_movement.js')
old="""function defensiveResponsibilityHold(family){return family==='PRESS'?.48:family==='WIDE_TRACK'?1.18:family==='MARK'?1.05:family==='COVER'?.90:.82;}
function stabilizeDefensiveResponsibilities(m,team,owner){
  if(!owner||owner.team===team||m.ball.mode!=='CONTROLLED')return;
  m._defenceMotionStability=m._defenceMotionStability||{};
  const state=m._defenceMotionStability[team]||(m._defenceMotionStability[team]={players:{},ownerId:owner.id});
  if(state.ownerId!==owner.id){state.ownerId=owner.id;for(const q of Object.values(state.players||{})){q.minUntil=Math.min(Number(q.minUntil||0),m.time+.18);q.lastLateralFlipAt=-99;}}
  const lock=m._defenceRoleLocks?.[team]||{},ball=worldToLocal(team,m.ball.x,m.ball.y);
  for(const p of outfield(m,team).filter(q=>['CB','FB','CM'].includes(q.role))){
    const family=defenceRoleFamily(p,lock),prev=state.players[p.id],mark=playerById(m,p.markTargetId),markLocal=mark?worldToLocal(team,mark.x,mark.y):null;
    const emergencyPress=p.id===lock.pressId||family==='PRESS'&&dist(p,owner)<=3.2;
    const emergencyWide=family==='WIDE_TRACK'&&markLocal&&markLocal.x<=52;
    const emergencyBox=ball.x<=19&&['CB','FB'].includes(p.role)&&dist(p,owner)<=5.0;
    const emergency=emergencyPress||emergencyWide||emergencyBox;
    const proposed={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:p.tx,ty:p.ty};
    if(prev){
      const semanticChanged=prev.family!==family||prev.task!==proposed.task||prev.markTargetId!==proposed.markTargetId;
      const holdActive=m.time<Number(prev.minUntil||0);
      if(semanticChanged&&holdActive&&!emergency){
        // Keep the football responsibility, but allow the path itself to follow the live shape.
        p.tacticalTask=prev.task;p.action=prev.action;p.markTargetId=prev.markTargetId||null;
      }
      // Path smoothing is deliberately modest: it removes left/right target ping-pong without
      // making defenders slow to react to an actual pass or runner.
      const jump=Math.hypot(Number(proposed.tx)-Number(prev.tx),Number(proposed.ty)-Number(prev.ty));
      const alpha=emergency?.84:jump>7?.48:.28;
      p.tx=lerp(Number(prev.tx),Number(p.tx),alpha);p.ty=lerp(Number(prev.ty),Number(p.ty),alpha);
      // A target may slide with a runner, but it must not cross the defender's body left/right
      // every few tenths of a second. Possession/owner changes reset this guard above.
      const oldSide=Math.sign(Number(prev.ty)-Number(p.y)),newSide=Math.sign(Number(p.ty)-Number(p.y));
      if(oldSide&&newSide&&oldSide!==newSide&&!emergency){
        if(m.time-Number(prev.lastLateralFlipAt||-99)<1.25){const mag=clamp(Math.abs(Number(prev.ty)-Number(p.y)),.65,2.2);p.ty=clamp(Number(p.y)+oldSide*mag,2,66);}
        else prev.lastLateralFlipAt=m.time;
      }
      const finalFamily=defenceRoleFamily(p,lock),finalChanged=prev.family!==finalFamily||prev.task!==p.tacticalTask||prev.markTargetId!==(p.markTargetId||null);
      if(finalChanged){prev.minUntil=m.time+defensiveResponsibilityHold(finalFamily);prev.since=m.time;}
      prev.family=finalFamily;prev.task=p.tacticalTask;prev.action=p.action;prev.markTargetId=p.markTargetId||null;prev.tx=p.tx;prev.ty=p.ty;
    }else state.players[p.id]={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:p.tx,ty:p.ty,since:m.time,minUntil:m.time+defensiveResponsibilityHold(family)};
  }
}"""
new="""function defensiveResponsibilityHold(family){return family==='PRESS'?.48:family==='WIDE_TRACK'?1.35:family==='MARK'?1.32:family==='COVER'?1.18:1.05;}
function stabilizeDefensiveResponsibilities(m,team,owner){
  if(!owner||owner.team===team||m.ball.mode!=='CONTROLLED')return;
  m._defenceMotionStability=m._defenceMotionStability||{};
  const state=m._defenceMotionStability[team]||(m._defenceMotionStability[team]={players:{},ownerId:owner.id});
  const ownerChanged=state.ownerId!==owner.id;
  if(ownerChanged){state.ownerId=owner.id;for(const q of Object.values(state.players||{})){q.minUntil=m.time+.16;q.laneUntil=m.time;q.lastLateralFlipAt=-99;}}
  const lock=m._defenceRoleLocks?.[team]||{},ball=worldToLocal(team,m.ball.x,m.ball.y);
  for(const p of outfield(m,team).filter(q=>['CB','FB','CM'].includes(q.role))){
    const family=defenceRoleFamily(p,lock),prev=state.players[p.id],mark=playerById(m,p.markTargetId),markLocal=mark?worldToLocal(team,mark.x,mark.y):null;
    const emergencyPress=p.id===lock.pressId||family==='PRESS'&&dist(p,owner)<=3.2;
    const emergencyWide=family==='WIDE_TRACK'&&markLocal&&markLocal.x<=52;
    const emergencyBox=ball.x<=19&&['CB','FB'].includes(p.role)&&dist(p,owner)<=5.0;
    const emergency=ownerChanged||emergencyPress||emergencyWide||emergencyBox;
    const proposed={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:Number(p.tx),ty:Number(p.ty)};
    if(prev){
      const oldMark=playerById(m,prev.markTargetId),oldMarkGap=oldMark?dist(p,oldMark):99;
      const oldMarkRelevant=!!oldMark&&oldMark.team!==team&&oldMarkGap<=13.5;
      const familyChanged=prev.family!==family,markChanged=prev.markTargetId!==proposed.markTargetId;
      const holdActive=m.time<Number(prev.minUntil||0);
      // Preserve the football responsibility itself. A new wide emergency, the current presser,
      // owner/pass change, or an irrelevant old mark can take over immediately.
      if(holdActive&&!emergency&&(familyChanged||(markChanged&&oldMarkRelevant))){
        p.tacticalTask=prev.task;p.action=prev.action;p.markTargetId=prev.markTargetId||null;
      }
      const finalFamily=defenceRoleFamily(p,lock),finalMark=p.markTargetId||null,semanticChanged=prev.family!==finalFamily||prev.markTargetId!==finalMark;
      if(semanticChanged){prev.minUntil=m.time+defensiveResponsibilityHold(finalFamily);prev.since=m.time;prev.laneUntil=m.time;}
      // X may follow the live line continuously. Y belongs to a short-lived defensive lane and
      // is updated only a few times per second; this removes the left-right-left target ping-pong.
      const xAlpha=emergency?.82:.46;p.tx=lerp(Number(prev.tx),Number(p.tx),xAlpha);
      if(emergency){prev.laneTy=Number(proposed.ty);prev.laneUntil=m.time+.18;}
      else if(!Number.isFinite(Number(prev.laneTy))){prev.laneTy=Number(proposed.ty);prev.laneUntil=m.time+.40;}
      else if(m.time>=Number(prev.laneUntil||0)){
        const step=clamp(Number(proposed.ty)-Number(prev.laneTy),-1.65,1.65);
        prev.laneTy=clamp(Number(prev.laneTy)+step,2,66);prev.laneUntil=m.time+.42;
      }
      p.ty=lerp(Number(prev.ty),Number(prev.laneTy),emergency?.88:.58);
      prev.family=finalFamily;prev.task=p.tacticalTask;prev.action=p.action;prev.markTargetId=finalMark;prev.tx=p.tx;prev.ty=p.ty;
    }else state.players[p.id]={family,task:p.tacticalTask,action:p.action,markTargetId:p.markTargetId||null,tx:Number(p.tx),ty:Number(p.ty),laneTy:Number(p.ty),laneUntil:m.time+.40,since:m.time,minUntil:m.time+defensiveResponsibilityHold(family),lastLateralFlipAt:-99};
  }
}"""
r1(t,old,new)

# Patch the exact HF2 developer visual function. Preserve integrated debug/report buttons while
# using the observational core-only visual window so hidden protagonist choice pauses cannot freeze it.
u=Path('step71_hybrid_v06_ui.js')
r1(u,
" beforeHybrid=H.snapshot(d.session);activeBoundary=deep(d.boundary);const env=A.seedMatch(d.boundary,{seed:d.seed,explicitHeroChoiceRequired:true}),frames=[deep(env.entrySnapshot)];env.state.mode='FULL_SKIP';let guard=0;while(!env.state.m.completed&&guard++<90){P.step(env.state,.10);frames.push(deep(E.snapshot(env.state.m)));}",
" beforeHybrid=H.snapshot(d.session);activeBoundary=deep(d.boundary);const env=A.runDeveloperVisualWindow(d.boundary,{seed:d.seed,durationSeconds:9}),frames=(env.frames||[]).map(deep);")
r1(u,
"env.frames=frames;const devResolved={selectedChoice:null,choiceSteps:[],actualEvents:[],result:null,results:[],episodeFrames:frames};",
"env.frames=frames;const devResolved={selectedChoice:null,choiceSteps:[],actualEvents:deep(env.actualEvents||[]),result:null,results:[],episodeFrames:frames};")
r1(u,
"highResolution:{entrySnapshot:deep(env.entrySnapshot),decision:null,selectedChoice:null,choiceSteps:[],postActionFrames:[],actualEvents:[],actualResult:null,actualResults:[],episodeFrames:deep(frames)}",
"highResolution:{entrySnapshot:deep(env.entrySnapshot),decision:null,selectedChoice:null,choiceSteps:[],postActionFrames:[],actualEvents:deep(env.actualEvents||[]),actualResult:null,actualResults:[],episodeFrames:deep(frames)}")
print('HF3_TUNE_V4_OK')
