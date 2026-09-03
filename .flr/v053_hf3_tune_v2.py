from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def r1(path,old,new):
 p=ROOT/path;s=p.read_text(encoding='utf-8')
 if new in s:return
 n=s.count(old)
 if n!=1:raise SystemExit(f'HF3_TUNE_ANCHOR {path} count={n}: {old[:80]}')
 p.write_text(s.replace(old,new,1),encoding='utf-8')

# Tune the already-applied HF3 stability layer.
t=Path('runtime/tactical_movement.js')
r1(t,"function defensiveResponsibilityHold(family){return family==='PRESS'?.42:family==='WIDE_TRACK'?.92:family==='MARK'?.82:family==='COVER'?.72:.62;}","function defensiveResponsibilityHold(family){return family==='PRESS'?.48:family==='WIDE_TRACK'?1.18:family==='MARK'?1.05:family==='COVER'?.90:.82;}")
r1(t,"if(state.ownerId!==owner.id){state.ownerId=owner.id;for(const q of Object.values(state.players||{})){q.minUntil=Math.min(Number(q.minUntil||0),m.time+.18);}}","if(state.ownerId!==owner.id){state.ownerId=owner.id;for(const q of Object.values(state.players||{})){q.minUntil=Math.min(Number(q.minUntil||0),m.time+.18);q.lastLateralFlipAt=-99;}}")
r1(t,"const emergencyWide=family==='WIDE_TRACK'&&markLocal&&markLocal.x<=34;","const emergencyWide=family==='WIDE_TRACK'&&markLocal&&markLocal.x<=52;")
old="""      const jump=Math.hypot(Number(proposed.tx)-Number(prev.tx),Number(proposed.ty)-Number(prev.ty));
      const alpha=emergency?.82:jump>7?.58:.42;
      p.tx=lerp(Number(prev.tx),Number(p.tx),alpha);p.ty=lerp(Number(prev.ty),Number(p.ty),alpha);
      const finalFamily=defenceRoleFamily(p,lock),finalChanged=prev.family!==finalFamily||prev.task!==p.tacticalTask||prev.markTargetId!==(p.markTargetId||null);"""
new="""      const jump=Math.hypot(Number(proposed.tx)-Number(prev.tx),Number(proposed.ty)-Number(prev.ty));
      const alpha=emergency?.84:jump>7?.48:.28;
      p.tx=lerp(Number(prev.tx),Number(p.tx),alpha);p.ty=lerp(Number(prev.ty),Number(p.ty),alpha);
      // A target may slide with a runner, but it must not cross the defender's body left/right
      // every few tenths of a second. Possession/owner changes reset this guard above.
      const oldSide=Math.sign(Number(prev.ty)-Number(p.y)),newSide=Math.sign(Number(p.ty)-Number(p.y));
      if(oldSide&&newSide&&oldSide!==newSide&&!emergency){
        if(m.time-Number(prev.lastLateralFlipAt||-99)<1.25){const mag=clamp(Math.abs(Number(prev.ty)-Number(p.y)),.65,2.2);p.ty=clamp(Number(p.y)+oldSide*mag,2,66);}
        else prev.lastLateralFlipAt=m.time;
      }
      const finalFamily=defenceRoleFamily(p,lock),finalChanged=prev.family!==finalFamily||prev.task!==p.tacticalTask||prev.markTargetId!==(p.markTargetId||null);"""
r1(t,old,new)

# Developer visual windows are observational. They must not freeze because the protagonist
# controller has raised an invisible pending choice. Run the same match core as AI for this window.
a=Path('live_v06_scene_authority_browser.js')
insert="""function runDeveloperVisualWindow(boundary,opts={}){const env=seedMatch(boundary,{...opts,explicitHeroChoiceRequired:false}),{E,state}=env,frames=[deep(env.entrySnapshot)],start=state.m.time,duration=clamp(Number(opts.durationSeconds)||9,4,12);state.mode='FULL_SKIP';let guard=0;while(!state.m.completed&&state.m.time<start+duration-.001&&guard++<2400){E.step(state.m,.10);frames.push(deep(E.snapshot(state.m)));}const snapshot=E.snapshot(state.m),events=(state.m.events||[]).filter(e=>e.t>=start-.001).map(deep);return{...env,frames,snapshot,actualEvents:events,hadChoice:false,result:null,developerVisualOnly:true,searchSeconds:Number((snapshot.time-start).toFixed(3)),preSpan:Number((snapshot.time-start).toFixed(3)),futureOutcomePrecomputed:false};}
function runFinalWindow(boundary,opts={}){"""
r1(a,"function runFinalWindow(boundary,opts={}){",insert)
r1(a,"return{seedMatch,runToChoice,runSetPieceWindow,runNonHeroShotWindow,runFinalWindow,applyChoiceAndAdvance,autoResolveEpisode,finalizeEpisode,finishWithoutChoice,choiceAudit};","return{seedMatch,runToChoice,runSetPieceWindow,runNonHeroShotWindow,runDeveloperVisualWindow,runFinalWindow,applyChoiceAndAdvance,autoResolveEpisode,finalizeEpisode,finishWithoutChoice,choiceAudit};")

ui=Path('step71_hybrid_v06_ui.js')
old_ui=""" beforeHybrid=H.snapshot(d.session);activeBoundary=deep(d.boundary);const env=A.seedMatch(d.boundary,{seed:`${d.seed}-VISUAL`,explicitHeroChoiceRequired:true}),frames=[deep(env.entrySnapshot)];env.state.mode='FULL_SKIP';let guard=0;while(!env.state.m.completed&&guard++<90){P.step(env.state,.10);frames.push(deep(E.snapshot(env.state.m)));}
 developerScenarioLast={key:d.key,label:d.label,instruction:d.instruction,seed:d.seed,frames:deep(frames)};"""
new_ui=""" beforeHybrid=H.snapshot(d.session);activeBoundary=deep(d.boundary);const visual=A.runDeveloperVisualWindow(d.boundary,{seed:d.seed,durationSeconds:9}),frames=visual.frames.map(deep);
 developerScenarioLast={key:d.key,label:d.label,instruction:d.instruction,seed:d.seed,frames:deep(frames),debug:{schemaVersion:'FLR_DEV_VISUAL_HF3_1.0',boundary:deep(d.boundary),actualEvents:deep(visual.actualEvents||[]),entrySnapshot:deep(visual.entrySnapshot),snapshot:deep(visual.snapshot),futureOutcomePrecomputed:false}};"""
r1(ui,old_ui,new_ui)
print('HF3_TUNE_V2_OK')
