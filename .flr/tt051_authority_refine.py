from pathlib import Path

p=Path('live_v06_scene_authority_browser.js')
s=p.read_text(encoding='utf-8')
old="function tryHeroOwnerCheckpoint(P,state){const q=P.inspect(state);if(!q||!['ON_BALL','RECEIVING'].includes(q.frame?.kind)||!q.options?.length)return false;state.mode='PLAYER_ALL';P.maybeCheckpoint(state);if(state.pending)return true;state.mode='FULL_SKIP';return false;}"
new="function tryHeroOwnerCheckpoint(P,state){const q=P.inspect(state);if(!q||!['ON_BALL','RECEIVING'].includes(q.frame?.kind)||!q.options?.length)return false;if(q.options.length<2){state.noMeaningfulChoice={at:Number(state.m.time.toFixed(3)),kind:q.frame?.kind||null,options:q.options.map(o=>({id:o.id,targetId:o.targetId||null}))};return false;}state.mode='PLAYER_ALL';P.maybeCheckpoint(state);if(state.pending)return true;state.mode='FULL_SKIP';return false;}"
if s.count(old)!=1: raise SystemExit(f'tryHeroOwnerCheckpoint expected 1, got {s.count(old)}')
s=s.replace(old,new,1)
# All high-res search loops stop immediately once a one-option state has been identified.
s=s.replace("while(!state.m.completed&&!state.pending&&state.m.time<start+minPre-.001)","while(!state.m.completed&&!state.pending&&!state.noMeaningfulChoice&&state.m.time<start+minPre-.001)")
s=s.replace("while(!state.m.completed&&!state.pending&&state.m.time<start+maxSearch-.001)","while(!state.m.completed&&!state.pending&&!state.noMeaningfulChoice&&state.m.time<start+maxSearch-.001)")
s=s.replace("while(!state.m.completed&&!state.pending&&state.m.time<start+duration-.001&&guard++<2000)","while(!state.m.completed&&!state.pending&&!state.noMeaningfulChoice&&state.m.time<start+duration-.001&&guard++<2000)")
s=s.replace("while(!state.m.completed&&!state.pending&&state.m.time<start+duration-.001&&guard++<2600)","while(!state.m.completed&&!state.pending&&!state.noMeaningfulChoice&&state.m.time<start+duration-.001&&guard++<2600)")
# Surface the reason to UI/debug without inventing an automatic action.
s=s.replace("return{...env,frames,pending,scene,searchSeconds:Number((state.m.time-start).toFixed(3)),preSpan:Number(preSpan.toFixed(3)),hadChoice:!!pending,futureOutcomePrecomputed:false};}","return{...env,frames,pending,scene,noMeaningfulChoice:state.noMeaningfulChoice?deep(state.noMeaningfulChoice):null,searchSeconds:Number((state.m.time-start).toFixed(3)),preSpan:Number(preSpan.toFixed(3)),hadChoice:!!pending,futureOutcomePrecomputed:false};}",1)
s=s.replace("return{...env,frames,snapshot,actualEvents:events,pending,scene,hadChoice:!!pending,result:null,searchSeconds:Number((snapshot.time-start).toFixed(3)),preSpan:Number((snapshot.time-start).toFixed(3)),futureOutcomePrecomputed:false};}","return{...env,frames,snapshot,actualEvents:events,pending,scene,noMeaningfulChoice:state.noMeaningfulChoice?deep(state.noMeaningfulChoice):null,hadChoice:!!pending,result:null,searchSeconds:Number((snapshot.time-start).toFixed(3)),preSpan:Number((snapshot.time-start).toFixed(3)),futureOutcomePrecomputed:false};}",1)
# Second occurrence is runImportantWindow after TT-0.51 transform.
s=s.replace("return{...env,frames,snapshot,actualEvents:events,pending,scene,hadChoice:!!pending,result:null,searchSeconds:Number((snapshot.time-start).toFixed(3)),preSpan:Number((snapshot.time-start).toFixed(3)),futureOutcomePrecomputed:false};}","return{...env,frames,snapshot,actualEvents:events,pending,scene,noMeaningfulChoice:state.noMeaningfulChoice?deep(state.noMeaningfulChoice):null,hadChoice:!!pending,result:null,searchSeconds:Number((snapshot.time-start).toFixed(3)),preSpan:Number((snapshot.time-start).toFixed(3)),futureOutcomePrecomputed:false};}",1)
p.write_text(s,encoding='utf-8')
print('TT-0.51 no-meaningful-choice authority refined')
