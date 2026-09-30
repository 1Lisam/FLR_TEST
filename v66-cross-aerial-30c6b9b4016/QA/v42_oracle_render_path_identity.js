'use strict';
/* QA-only: proves executable handoff identity and statically pins the browser sink.
   It deliberately does not claim canvas pixels or DOM layout. */
const assert=require('assert'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const H=require('../live_hybrid_session_v02');
const A=require('../live_v06_scene_authority_browser');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const coordHash=s=>hash((s?.players||[]).map(p=>[p.id,p.x,p.y,p.tx,p.ty,p.vx,p.vy]));
function boundary(seed,heroRole){const session=H.createSession({seed,heroTeam:'HOME',heroRole,heroPlayerId:heroRole==='CB'?'H-LCB':`H-${heroRole}`,durationSeconds:1800});for(let i=0;i<10;i++){const r=H.advanceUntilBoundary(session,{maxActions:20000});if(r.boundary?.type==='PROTAGONIST_2D_WINDOW')return{session,boundary:r.boundary};if(!r.boundary||r.status==='FINISHED')break;const q=r.state.spatial;H.resumeFromHighRes(session,{snapshot:{time:r.boundary.atSecond+.1,score:r.state.score,possession:r.state.possession,ball:{mode:'CONTROLLED',x:q.ball.x,y:q.ball.y,ownerId:r.state.ball.ownerId},players:q.players},actualEvents:[],hadChoice:false,futureOutcomePrecomputed:false});}throw new Error(`NO_PROTAGONIST_BOUNDARY:${seed}:${heroRole}`);}
function run(){const ui=read('step71_hybrid_v06_ui.js'),scene=read('live_v06_scene_authority_browser.js');
 const sourceContracts={
  setupUsesAuthoritativeInitialPreview:/const preview=H\.initialSpatialSnapshot\(world\)[\s\S]*?draw\(preview\)/.test(ui)&&!/KICKOFF-PREVIEW/.test(ui),
  browserUsesSameRunToChoice:/opened=A\.runToChoice\(r\.boundary,\{seed:`\$\{seed\(\)\}-\$\{r\.boundary\.sceneId\}`/.test(ui),
  firstChoiceCanvasInputIsSnapshot:/function showPending\(\)[\s\S]*?const s=E\.snapshot\(session\.m\),qaCapture=window\.FLR_QA_SHOW_PENDING_CAPTURE;if\(typeof qaCapture==='function'\)qaCapture\([\s\S]*?\);draw\(s\);renderMeta\(s\);ensurePitchChoice\(\)\?\.show\(session\.pending,s\)/.test(ui),
  replayBeforeChoiceExists:/startReplay\(rep,'CHOICE','선택 직전 실제 경기'\)/.test(ui),
  liveCarrierCopiesCoordinates:/liveCarrier\?carried\[p\.id\]:contextualEntry/.test(scene)&&/p\.x=e\.x;p\.y=e\.y;[\s\S]*?p\.tx=Number\.isFinite\(e\.tx\)\?e\.tx:e\.x;p\.ty=Number\.isFinite\(e\.ty\)\?e\.ty:e\.y/.test(scene),
  syntheticEntryGuard:/if\(!liveCarrier&&!synthetic\)throw new Error\('LIVE_CHOICE_SPATIAL_CARRIER_REQUIRED'\)/.test(scene)
 };
 Object.entries(sourceContracts).forEach(([k,v])=>assert(v,`SOURCE_CONTRACT_MISSING:${k}`));
 const cases=[];
 for(const [seed,heroRole] of [['V42-REP-ST','ST'],['V42-REP-CM','CM'],['V42-REP-CB','CB']]){
  const hit=boundary(seed,heroRole),opened=A.runToChoice(hit.boundary,{seed:`${seed}|HR`,runtimeDir:path.join(root,'runtime'),minPreSeconds:5,maxSearchSeconds:35});
  const trace=opened.state.choiceBoundarySpatial,carrier=trace.A,entry=trace.B,entrySnapshot=opened.entrySnapshot,drawState=opened.E.snapshot(opened.state.m);
  const rows={seed,heroRole,boundaryId:hit.boundary.sceneId,carrierCoordinateHash:coordHash(carrier),entryCoordinateHash:coordHash(entry),entrySnapshotCoordinateHash:coordHash(entrySnapshot),choiceDrawStateCoordinateHash:coordHash(drawState),entryTime:entry.time,choiceDrawTime:drawState.time,hadChoice:opened.hadChoice,choiceCount:opened.pending?.options?.length||0};
  assert.equal(rows.carrierCoordinateHash,rows.entryCoordinateHash,'CARRIER_TO_V06_ENTRY_COORDINATE_DRIFT');
  assert.equal(rows.entryCoordinateHash,rows.entrySnapshotCoordinateHash,'ENTRY_SNAPSHOT_COORDINATE_DRIFT');
  assert(rows.choiceDrawTime>=rows.entryTime,'CHOICE_DRAW_PRECEDES_ENTRY');
  assert(opened.hadChoice,'NO_CHOICE_FOR_REPRESENTATIVENESS_CASE');
  cases.push(rows);
 }
 const evolvesBeforeChoice=cases.some(x=>x.choiceDrawTime>x.entryTime);
 assert(evolvesBeforeChoice,'EXPECTED_PRE_CHOICE_EVOLUTION_NOT_SEEN');
 return{schemaVersion:'V42_ORACLE_RENDER_PATH_IDENTITY_1.0',verdict:'PASS_WITH_PROVEN_POST_CAPTURE_TEMPORAL_GAP',sourceContracts,cases,claims:{carrierToV06Entry:'EXACT_COORDINATE_COPY_PROVEN',oracleNamedFirstVisibleChoiceFrame:'NOT_THE_BROWSER_CHOICE_DRAW_STATE',canvasPixels:'BLOCKED_NO_BROWSER'}};
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));
module.exports={run};
