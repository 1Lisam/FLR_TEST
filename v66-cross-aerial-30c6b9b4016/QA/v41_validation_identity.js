'use strict';
// The frozen user build is candidateSourceSHA.  This file is validator provenance only.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const EVIDENCE=require('../evidence/v42/V42_VALIDATION_PUBLIC_IDENTITY.json');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const EXPECTED={candidateSourceSHA:EVIDENCE.candidateSourceSHA,triggerCommit:EVIDENCE.triggerCommit,deployedMainSHA:EVIDENCE.deployedMainSHA,deployedParentSHA:EVIDENCE.deployedParentSHA,payloadManifestSha256:EVIDENCE.fullPublicPayloadManifest.fullFrozenPublicManifestSha256,fullPublicPayloadManifestSha256:EVIDENCE.fullPublicPayloadManifest.fullFrozenPublicManifestSha256,transportDeltaManifestSha256:EVIDENCE.latestTransportDelta.transportDeltaManifestSha256,reporterBuildId:EVIDENCE.reporterSourceIdentity.reporterBuildId,reporterFunctionalManifestSha:EVIDENCE.reporterSourceIdentity.reporterFunctionalManifestSha256,shadowLegacy:EVIDENCE.shadowLegacy.path};
function scriptChain(text=fs.readFileSync(path.join(ROOT,'index.html'),'utf8')){return [...text.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map(m=>m[1])}
function canonical(files){return files.map(({path,bytes,sha256})=>({path,bytes,sha256})).sort((a,b)=>a.path.localeCompare(b.path))}
function runtimeSourceSHA(files=PAYLOAD){return sha(JSON.stringify(canonical(files)))}
function candidateBytes(p){const r=spawnSync('git',['show',`${EXPECTED.candidateSourceSHA}:${p}`],{cwd:ROOT});if(r.status!==0||!r.stdout)throw new Error(`CANDIDATE_SOURCE_READ_FAILED:${p}`);return r.stdout}
function derivePayload(){const index=candidateBytes('index.html'),chain=scriptChain(index.toString()),paths=['index.html',...chain];return paths.map(p=>{const b=candidateBytes(p);return{path:p,bytes:b.length,sha256:sha(b)}})}
const PAYLOAD=derivePayload();
function validatorHead(){try{return fs.readFileSync(path.join(ROOT,'.git','HEAD'),'utf8').trim()}catch{return 'UNKNOWN'}}
function reporterIdentity(){try{const r=require('../reporter_source_identity.js');return{buildId:r.BUILD_ID,manifestSha:r.EXPECTED.manifestSha256,chain:r.EXPECTED.scriptChain}}catch{return null}}
function validate({candidateSourceSHA=EXPECTED.candidateSourceSHA,runtimeSHA=runtimeSourceSHA(),validatorHead:toolingHead=validatorHead(),payload=PAYLOAD,reporter=reporterIdentity(),indexText=null}={}){
 const errors=[],chain=scriptChain(indexText===null?undefined:indexText);
 if(candidateSourceSHA!==EXPECTED.candidateSourceSHA)errors.push('CANDIDATE_SOURCE_SHA_STALE_OR_UNEXPECTED');
 if(!toolingHead)errors.push('VALIDATOR_HEAD_MISSING');
 if(chain.length!==37)errors.push('INDEX_SCRIPT_COUNT_NOT_37');
 if(payload.length!==38)errors.push('FULL_FROZEN_PUBLIC_FILE_COUNT_NOT_38');
 if(runtimeSHA!==runtimeSourceSHA(payload))errors.push('RUNTIME_SOURCE_SHA_PAYLOAD_MISMATCH');
 if(payload[0]?.path!=='index.html'||JSON.stringify(payload.slice(1).map(x=>x.path))!==JSON.stringify(chain))errors.push('INDEX_TO_PAYLOAD_ORDER_OR_COVERAGE_MISMATCH');
 if(chain.includes(EXPECTED.shadowLegacy))errors.push('SHADOW_LEGACY_UNEXPECTEDLY_LOADED');
 if(JSON.stringify(canonical(payload))!==JSON.stringify(canonical(PAYLOAD)))errors.push('FULL_FROZEN_PUBLIC_PAYLOAD_SET_MISMATCH');
 for(const declared of payload){let b=null;try{b=fs.readFileSync(path.join(ROOT,declared.path))}catch{}if(!b||b.length!==declared.bytes||sha(b)!==declared.sha256)errors.push(`LIVE_PAYLOAD_MISMATCH:${declared.path}`)}
 if(!reporter||reporter.buildId!==EXPECTED.reporterBuildId||reporter.manifestSha!==EXPECTED.reporterFunctionalManifestSha)errors.push('REPORTER_BUILD_OR_FUNCTIONAL_SOURCE_MISMATCH');
 if(!reporter||JSON.stringify(reporter.chain)!==JSON.stringify(chain))errors.push('REPORTER_CHAIN_MISMATCH');
 return {verdict:errors.length?'BLOCKED':'PASS',errors,identity:{candidateSourceSHA,runtimeSourceSHA:runtimeSHA,validatorHead:toolingHead,fullFrozenPublicManifestSha256:EXPECTED.fullPublicPayloadManifestSha256,localDerivedTupleManifestSha256:runtimeSourceSHA(PAYLOAD),fullPublicAssetCount:PAYLOAD.length,loadedScriptCount:chain.length,transportDeltaManifestSha256:EXPECTED.transportDeltaManifestSha256,reporterBuildId:EXPECTED.reporterBuildId,reporterFunctionalManifestSha:EXPECTED.reporterFunctionalManifestSha},policy:{validatorHeadIsProvenanceOnly:true,fullUserPathRequired:true,transportDeltaCannotSubstituteForFullPublicIdentity:true,shadowLegacyMustRemainUnloaded:true}};
}
function selftest(){
 if(validate().verdict!=='PASS')throw new Error(JSON.stringify(validate()));
 if(validate({validatorHead:'validator-only-descendant'}).verdict!=='PASS')throw new Error('validator provenance must not replace candidate');
 for(const p of ['runtime/continuous_match_core.js','runtime/protagonist_match_controller.js','in_pitch_choice_ui.js','final_match_bug_report_ui.js','reporter_source_identity.js'])if(validate({payload:PAYLOAD.map(x=>x.path===p?{...x,sha256:sha('mutated '+p)}:x)}).verdict!=='BLOCKED')throw new Error('mutation must block '+p);
 if(validate({payload:PAYLOAD.slice(1)}).verdict!=='BLOCKED')throw new Error('removed index must block');
 const oldNarrow=PAYLOAD.filter(x=>['runtime/restart_movement.js','runtime/corner_templates.js'].includes(x.path));
 if(validate({payload:oldNarrow}).verdict!=='BLOCKED')throw new Error('old narrow manifest must block');
 const delta=PAYLOAD.filter(x=>EVIDENCE.latestTransportDelta.changedPublicFiles.includes(x.path));
 if(validate({payload:delta}).verdict!=='BLOCKED')throw new Error('transport delta must block');
 if(validate({candidateSourceSHA:'dad3139bba257c9f87548f7b10c7b59e3a30be68'}).verdict!=='BLOCKED')throw new Error('stale candidate must block');
 if(validate({reporter:{buildId:'wrong',manifestSha:'wrong',chain:scriptChain()}}).verdict!=='BLOCKED')throw new Error('reporter mismatch must block');
 if(validate({indexText:`<script src="${EXPECTED.shadowLegacy}"></script>`}).verdict!=='BLOCKED')throw new Error('shadow legacy loading must block');
 return{module:'V42_VALIDATION_IDENTITY',selftest:'PASS',fullPublicAssetCount:38,loadedScriptCount:37,validatorHeadMutation:'PASS_ALLOWED',gameplayRuntimeMutation:'BLOCKED',protagonistControllerMutation:'BLOCKED',inPitchChoiceUiMutation:'BLOCKED',reporterPathMutations:'BLOCKED',oldNarrowManifest:'BLOCKED',transportDeltaAsFullManifest:'BLOCKED',staleCandidateSource:'BLOCKED',reporterBuildOrSourceMismatch:'BLOCKED',shadowLegacyLoaded:'BLOCKED_BY_VALIDATE'};
}
if(require.main===module){const out=process.argv.includes('--selftest')?selftest():validate();console.log(JSON.stringify(out,null,2));if(out.verdict==='BLOCKED')process.exitCode=12}
module.exports={EXPECTED,PAYLOAD,sha,canonical,runtimeSourceSHA,scriptChain,derivePayload,validatorHead,reporterIdentity,validate,selftest};
