'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'),contract=require('./v42_reporter_source_identity_contract.json'),identity=require('../reporter_source_identity.js');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
function indexChain(){return[...read('index.html').matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map(m=>m[1])}
function docFor(chain){return{baseURI:'http://flr.local/index.html',querySelectorAll:sel=>sel==='script[src]'?chain.map(src=>({getAttribute:k=>k==='src'?src:null})):[]}}
function scene(){return{matchSecond:81.2,boundaryIdOrSceneId:'V42-QA-BOUNDARY',heroPlayerId:'H-CM',heroRole:'CM',pendingChoice:{choiceIds:['PASS'],targetIds:['H-ST']},committedChoice:{choiceId:'PASS',targetId:'H-ST'},currentStateMarkers:{phase:'PROGRESSION',possession:'HOME',ball:{mode:'OWNED',ownerId:'H-CM'}},futureOutcomePrecomputed:false}}
async function run(){
  const chain=indexChain(),expected=identity.EXPECTED;
  assert.deepEqual(chain,expected.scriptChain,'authoritative index chain drift');
  assert(chain.includes('reporter_source_identity.js'),'identity helper absent from technical entry');
  for(const required of ['runtime/tactical_movement.js','runtime/continuous_match_core.js','runtime/manager_tendency_adapter.js','runtime/protagonist_match_controller.js','live_hybrid_session_v02.js','live_v06_scene_authority_browser.js','step71_hybrid_v06_ui.js','final_match_bug_report_ui.js'])assert(chain.includes(required),'V42 loaded-chain regression:'+required);
  const statuses=expected.sources.map(x=>({path:x.path,sha256:sha(read(x.path)),bytes:Buffer.byteLength(read(x.path))}));
  assert(statuses.every((x,i)=>x.sha256===expected.sources[i].sha256),'declared source manifest drift');
  const fetcher=async p=>({ok:true,status:200,text:async()=>read(p)}),current=await identity.capture(scene(),{doc:docFor(chain),fetcher});
  assert.equal(current.validation.classification,'CURRENT_MATCH');
  assert.equal(current.sceneSession.futureOutcomePrecomputed,false);
  const stale=structuredClone(current);stale.buildId='TT-0.52';assert.equal(identity.validate(stale).classification,'STALE_OR_MISMATCHED');
  const mismatch=structuredClone(current);mismatch.sourceStatuses[0]={...mismatch.sourceStatuses[0],sha256:'0'.repeat(64),status:'MISMATCH'};assert.equal(identity.validate(mismatch).classification,'STALE_OR_MISMATCHED');
  assert.equal(identity.validate({build:'TT-0.52'}).classification,'LEGACY_NOT_LOADED');
  const unavailable=await identity.capture(scene(),{doc:docFor(chain),fetcher:async()=>{throw new Error('offline')}});assert.equal(unavailable.validation.classification,'AMBIGUOUS');
  const normal=read('step71_hybrid_v06_ui.js'),fallback=read('final_match_bug_report_ui.js');
  assert(normal.includes('sourceIdentity=await reportSourceIdentity(d,snap)'),'normal reporter assembly omits identity');
  assert(fallback.includes('sourceIdentity=await reportSourceIdentity(forced,summary)'),'forced/UI reporter assembly omits identity');
  assert(normal.includes('build:sourceIdentity.buildId'),'normal build label not bound');
  assert(fallback.includes('build:sourceIdentity.buildId'),'fallback build label not bound');
  return{module:'V42_REPORTER_SOURCE_IDENTITY',verdict:'PASS',contract:contract.schemaVersion,technicalEntry:{path:'index.html',scriptCount:chain.length,identityHelperLoaded:true,v42RequiredLoaded:true,shadowClassification:'V42_REQUIRED_AUTHORITATIVE_CHAIN_INTACT'},currentControl:{classification:current.validation.classification,buildId:current.buildId,manifestSha256:current.manifestSha256,coveredSourceCount:current.sourceStatuses.length,sceneEvidence:Object.keys(current.sceneSession),futureOutcomePrecomputed:current.sceneSession.futureOutcomePrecomputed},negativeControls:{staleBuild:identity.validate(stale),sourceMutation:identity.validate(mismatch),legacy:identity.validate({build:'TT-0.52'}),captureUnavailable:unavailable.validation},assembly:{normalSceneReporterBound:true,forcedAndUiReporterBound:true},policy:{userFailOpen:'OPEN',step79:'NOT_STARTED',gameplayChanged:false,deploymentChanged:false}};
}
if(require.main===module)run().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.stack||e);process.exitCode=1});
module.exports={run};
