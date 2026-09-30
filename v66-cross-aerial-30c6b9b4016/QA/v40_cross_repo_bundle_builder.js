'use strict';
const fs=require('fs'),path=require('path');
const proof=require('./v40_same_head_proof_contract');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.flr/v40_cross_repo_transport'),parts=path.join(out,'parts');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
// This is the exact content-diff contract against FLR_TEST/main at
// 24f9201c5f89438140f575d0d6f008f441bee528. Byte-identical baseline files,
// including mode-only differences, are deliberately excluded.
const intendedChangedFiles=[
  'final_match_test_dock.js',
  'runtime/continuous_match_core.js',
  'runtime/corner_templates.js',
  'runtime/v39_corner_responsibility_patch.js',
  'runtime/v39_free_kick_channel_owner_patch.js',
  'runtime/v39_free_kick_defensive_layers_patch.js',
  'runtime/v39_open_play_responsibility_patch.js'
].sort();
const payloadPaths=intendedChangedFiles;
for(const p of payloadPaths)if(!fs.existsSync(path.join(root,p)))throw new Error(`MISSING_BROWSER_PAYLOAD:${p}`);
const manifest=proof.manifestFromRoot(root,payloadPaths);
const changedFiles=intendedChangedFiles;
fs.mkdirSync(parts,{recursive:true});
for(const name of fs.readdirSync(parts))fs.unlinkSync(path.join(parts,name));
for(const p of changedFiles){const data=fs.readFileSync(path.join(root,p));const safe=p.replace(/[^A-Za-z0-9._-]/g,'__');const text=data.toString('base64');const size=12000;for(let i=0;i<text.length;i+=size)fs.writeFileSync(path.join(parts,`${safe}.part${String(Math.floor(i/size)).padStart(3,'0')}`),text.slice(i,i+size)+'\n','utf8');}
const transport={schemaVersion:'V40_CROSS_REPO_TRANSPORT_1.0',sourceRepo:proof.SOURCE_REPO,sourceSHA:proof.SOURCE_SHA,targetRepo:proof.TARGET_REPO,targetBaseSHA:proof.TARGET_BASE_SHA,targetBaseVerification:'WORKER_GITHUB_TREE_VERIFIED',payloadManifestSha256:manifest.payloadManifestSha256,payloadManifest:manifest,priorPublicBaseline:{representedBy:'FLR_TEST main Git tree/blob comparison performed in Worker',targetBaseSHA:proof.TARGET_BASE_SHA},changedFiles,partsDirectory:'.flr/v40_cross_repo_transport/parts',oracleExcluded:['QA/v40_human_calibration_oracles.json'],workflowTemplate:'.github/workflows/flr-auto-deploy.yml',triggerFile:'.flr/deploy.json'};
fs.writeFileSync(path.join(out,'V40_CROSS_REPO_TRANSPORT_MANIFEST.json'),JSON.stringify(transport,null,2)+'\n');
const deploy={schemaVersion:'V40_CROSS_REPO_DEPLOY_1.0',mode:'cross-repo',sourceRepo:proof.SOURCE_REPO,sourceSHA:proof.SOURCE_SHA,targetRepo:proof.TARGET_REPO,targetBaseSHA:proof.TARGET_BASE_SHA,baseCommit:proof.TARGET_BASE_SHA,payloadManifestSha256:manifest.payloadManifestSha256,payloadManifest:manifest,changedFiles,removedFiles:[],validationStatus:'PASS_FOR_USER_VISUAL_RETEST',step79Started:false,fromBuild:'LOCAL SOURCE HEAD',toBuild:'TT-0.52 V40 HUMAN CALIBRATION TEST_ONLY',commitMessage:'Deploy V40 cross-repo human calibration candidate (TEST_ONLY)'};
fs.writeFileSync(path.join(out,'deploy.json.template'),JSON.stringify(deploy,null,2)+'\n');
fs.writeFileSync(path.join(out,'WORKFLOW_TEMPLATE_COPY.yml'),fs.readFileSync(path.join(root,'.github/workflows/flr-auto-deploy.yml')));
console.log(JSON.stringify({payloadFiles:payloadPaths.length,changedFiles:changedFiles.length,payloadManifestSha256:manifest.payloadManifestSha256,parts:fs.readdirSync(parts).length},null,2));
