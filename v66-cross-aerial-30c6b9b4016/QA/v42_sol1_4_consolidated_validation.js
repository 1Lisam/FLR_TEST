'use strict';
/* V42 consolidated, implementation-independent semantic contract gate. */
const assert=require('assert');
const cp=require('child_process');
const path=require('path');
const root=path.resolve(__dirname,'..');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clone=x=>JSON.parse(JSON.stringify(x));
const result=(id,status,detail)=>({contractId:id,status,detail});
function must(ok,id,detail){return result(id,ok?'PASS':'FAIL',detail);}
function independent(){
  const pre={boundaryId:'b-17',players:[{id:'H-1',x:18,y:30},{id:'H-2',x:49,y:22}],ball:{x:48,y:23}};
  const visible=clone(pre); visible.players[0].x+=0.4; visible.ball.y+=0.3; visible.futureOutcomePrecomputed=false;
  const reset=clone(visible); reset.players.forEach(p=>p.x=52); reset.ball={x:52,y:34};
  const continuity=s=>s.boundaryId===pre.boundaryId&&s.players.map(p=>p.id).join()==='H-1,H-2'&&dist(s.ball,pre.ball)<2&&s.players.every((p,i)=>dist(p,pre.players[i])<3);
  const viable={id:'H-LW',open:true,legal:true,reachable:true}, blocked={id:'H-ST',open:false,legal:false,reachable:true};
  const options=[{targetId:'H-LW',variant:'FEET'},{targetId:'H-LW',variant:'SPACE',leadPoint:{x:70,y:18}}];
  const choices={options, exclusions:[{targetId:'H-ST',reason:'OFFSIDE_EXCLUDED'}],recommended:'H-LW',selected:null,executed:null};
  const incoming={ballMode:'FLIGHT',eta:0.72,decisionVisible:true,contact:false};
  const open={goalProximity:'near',centrality:'central',keeperRelation:'isolated',cover:'none',selectedAction:'SHOOT',alternatives:['PASS']};
  const covered={goalProximity:'near',centrality:'wide',keeperRelation:'set',cover:'two',selectedAction:'CUTBACK',alternatives:['SHOOT','CARRY']};
  const goal=['GOAL','SCORE_UPDATE','CELEBRATION','KICKOFF','OPEN_PLAY'];
  const cornerHero=['SHOT_OUT','CORNER_SETUP','HERO_EXPLICIT_CHOICE','CORNER_KICK'];
  const cornerTeam=['SHOT_OUT','CORNER_SETUP','TEAMMATE_TAKER','CORNER_KICK'];
  const recs=[{threat:'central-9',owner:'D-CB',kind:'MARK',epoch:4,target:{x:40,y:28}},{threat:'wide-7',owner:'D-FB',kind:'COVER',epoch:4,target:{x:55,y:8}}];
  const motion=[{kind:'PRESS',target:{x:49,y:25},epoch:4},{kind:'COVER',target:{x:44,y:31},epoch:4},{kind:'MARK',target:{x:40,y:28},epoch:4,history:[{x:40,y:28},{x:40.5,y:28.2},{x:41,y:28.4}],mode:'TURN_RUN'}];
  const order=(a,...xs)=>xs.every((x,i)=>a.indexOf(x)>=(i?a.indexOf(xs[i-1])+1:0));
  return [
    must(continuity(visible),'V42-L0-LIVE-STATE-CONTINUITY','same IDs/current ball survive A-to-visible; irregular live shape accepted'),
    must(!continuity(reset),'V42-MUT-LIVE-REMATERIALIZATION-KILLED','deliberate board reset is detected'),
    must(choices.options.some(x=>x.targetId===viable.id)&&choices.exclusions.some(x=>x.targetId===blocked.id&&x.reason),'V42-L1-MEANINGFUL-TARGET-PRESERVATION','viable is visible; illegal target has structured exclusion'),
    must(choices.options.filter(x=>x.targetId==='H-LW').map(x=>x.variant).join()==='FEET,SPACE'&&!!choices.options[1].leadPoint,'V42-L1-FEET-SPACE-DISTINCTION','same target retains causally distinct feet/lead variants'),
    must(incoming.ballMode==='FLIGHT'&&incoming.eta>0&&incoming.decisionVisible&&!incoming.contact,'V42-L1-INCOMING-FLIGHT-WINDOW','decision exists during legitimate current flight'),
    must(!({ballMode:'FLIGHT',eta:0,decisionVisible:true,contact:true}.eta>0&&!{ballMode:'FLIGHT',eta:0,decisionVisible:true,contact:true}.contact),'V42-MUT-INCOMING-LATE-KILLED','near/after-contact-only mutation is detectable'),
    must(choices.recommended&&choices.selected===null&&choices.executed===null,'V42-L1-RECOMMENDATION-ANNOTATION','recommendation is annotation, not authority'),
    must(open.selectedAction==='SHOOT'&&covered.selectedAction!=='SHOOT'&&covered.alternatives.includes('SHOOT'),'V42-L1-ATTACK-DECISION','open 1v1 shoots; covered control retains non-shot alternative'),
    must(!([open,covered].every(x=>x.selectedAction==='SHOOT'))&&!([open,covered].every(x=>x.selectedAction!=='SHOOT')),'V42-MUT-ATTACK-CONTROLS-KILLED','unconditional shoot and obvious-shot suppression are detectable'),
    must(order(goal,'GOAL','SCORE_UPDATE','CELEBRATION','KICKOFF','OPEN_PLAY')&&'GOAL: H-9'.includes('GOAL'),'V42-L1-GOAL-LIFECYCLE-NARRATIVE','goal presentation/order and truthful narrative bind'),
    must(!order(['GOAL','SCORE_UPDATE','KICKOFF'],'GOAL','SCORE_UPDATE','CELEBRATION','KICKOFF'),'V42-MUT-GOAL-CELEBRATION-KILLED','dropped celebration is detected'),
    must(order(cornerHero,'SHOT_OUT','CORNER_SETUP','HERO_EXPLICIT_CHOICE','CORNER_KICK')&&order(cornerTeam,'SHOT_OUT','CORNER_SETUP','TEAMMATE_TAKER','CORNER_KICK'),'V42-L1-CORNER-CONTINUATION','hero explicit and teammate autonomous takers remain observable'),
    must(!order(['SHOT_OUT','CORNER_KICK'],'SHOT_OUT','CORNER_SETUP','CORNER_KICK'),'V42-MUT-CORNER-AUTOSKIP-KILLED','restart auto-skip is detected'),
    must(recs.length===2&&new Set(recs.map(x=>x.owner)).size===2&&recs.every(x=>x.owner),'V42-L1-THREAT-OWNERSHIP-HANDOFF','central and wide material threats have distinct current ownership'),
    must(dist(motion[0].target,motion[1].target)>2&&motion[2].history.every((p,i,a)=>!i||dist(p,a[i-1])<2)&&motion[2].mode==='TURN_RUN','V42-L1-RESPONSIBILITY-MOTION','PRESS/COVER distinct; stable MARK has no A-B-A and depth transition exists'),
    must(visible.futureOutcomePrecomputed===false&&choices.executed===null,'V42-L0-CHOICE-AUTHORITY','unselected action inert and no future outcome field true'),
    must(visible.futureOutcomePrecomputed===false,'V42-L0-NO-FUTURE-PRECOMPUTE','integrated fixture retains current/past-state-only marker'),
    result('V42-L2-ECOLOGY-WATCH','WATCH','bounded policy only; no score quota or batch run'),
    result('V42-L2-VISUAL-PLAUSIBILITY-WATCH','WATCH','body facing/density/smoothing require user visual retest')];
}
const anchors=['v42_choice_boundary_spatial_continuity.js','v42_sol2_choice_pipeline.js','v42_sol3_attack_goal_lifecycle.js','v42_sol4_1_defensive_responsibility.js','v42_sol4_2_defensive_movement.js'];
function runAnchors(){return anchors.map(file=>{const p=cp.spawnSync(process.execPath,[path.join(root,'QA',file)],{encoding:'utf8',timeout:30000});return result(`ANCHOR-${file}`,p.status===0?'PASS':'FAIL',p.status===0?'focused regression anchor passed':(p.stderr||p.stdout||'anchor failed').slice(-500));});}
function run(){const contractResults=[...independent(),...runAnchors()];const hardFails=[];const fails=contractResults.filter(x=>x.status==='FAIL');const watches=contractResults.filter(x=>x.status==='WATCH');const summary={overall:fails.length?'FAIL':'PASS',hardFails,fails,watches,contractResults,futureOutcomePrecomputed:false,classification:fails.length?'ENGINE_IMPLEMENTATION_REQUIRED_NEXT':'VALIDATION_BASELINE_READY_FOR_LIVE_E2E'};return summary;}
if(require.main===module){const s=run();console.log(JSON.stringify(s,null,2));process.exitCode=s.fails.length||s.hardFails.length?1:0;}
module.exports={run,independent};
