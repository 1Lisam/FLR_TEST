'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const SOURCE_REPO='1Lisam/FLR_DEV',SOURCE_SHA='b4777768f41ee252ba38ecfa84a01fc8409fb182';
const TARGET_REPO='1Lisam/FLR_TEST',TARGET_BASE_SHA='24f9201c5f89438140f575d0d6f008f441bee528';
function sha256(data){return crypto.createHash('sha256').update(data).digest('hex')}
// Match the target workflow's Python sorted(key=lambda x: x['path']) exactly:
// JavaScript localeCompare is locale-sensitive and can produce another SHA.
function canonicalFiles(files){return(files||[]).map(x=>({path:x.path,sha256:x.sha256,bytes:x.bytes})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)}
function payloadManifestSha256(files){return sha256(Buffer.from(JSON.stringify(canonicalFiles(files)),'utf8'))}
function manifestFromRoot(root,paths){const files=canonicalFiles(paths.map(p=>{const d=fs.readFileSync(path.join(root,p));return{path:p,bytes:d.length,sha256:sha256(d)}}));return{files,payloadManifestSha256:payloadManifestSha256(files)}}
function add(a,x){if(!a.includes(x))a.push(x)}
function validate(metadata,options={}){
  const m=metadata||{},mode=options.mode||m.mode||'cross-repo',bad=[];
  if(mode==='single-repo'){
    const head=options.currentHead||m.baseCommit||null,s=m.gameplaySourceSHA||m.sourceSHA||null,p=m.payloadSourceSHA||null;
    if(!s)add(bad,'SOURCE_SHA_MISSING');if(!p)add(bad,'PAYLOAD_SOURCE_SHA_MISSING');if(head&&s!==head)add(bad,'SOURCE_SHA_MISMATCH');if(head&&p!==head)add(bad,'PAYLOAD_SOURCE_SHA_MISMATCH');if(s&&p&&s!==p)add(bad,'PROOF_SOURCE_SHA_MISMATCH');
    return{verdict:bad.length?'BLOCKED':'PASS',mode,mismatches:bad,currentHead:head,sourceSHA:s,payloadSourceSHA:p,policy:'Single-repo same-head proof is opt-in only.'};
  }
  if(mode!=='cross-repo')add(bad,'MODE_MUST_BE_EXPLICIT_CROSS_REPO_OR_SINGLE_REPO');
  const er=options.sourceRepo||SOURCE_REPO,es=options.sourceSHA||SOURCE_SHA,et=options.targetRepo||TARGET_REPO,eb=options.targetBaseSHA||TARGET_BASE_SHA;
  if(m.sourceRepo!==er)add(bad,'SOURCE_REPO_MISMATCH');if(m.sourceSHA!==es)add(bad,m.sourceSHA?'SOURCE_SHA_STALE':'SOURCE_SHA_MISSING');if(m.targetRepo!==et)add(bad,'TARGET_REPO_MISMATCH');if((m.targetBaseSHA||m.baseCommit)!==eb)add(bad,m.targetBaseSHA||m.baseCommit?'TARGET_BASE_SHA_MISMATCH':'TARGET_BASE_SHA_MISSING');
  const got=m.payloadManifest,expected=options.expectedManifest||null;
  if(!m.payloadManifestSha256)add(bad,'PAYLOAD_MANIFEST_SHA_MISSING');if(!got||!Array.isArray(got.files))add(bad,'PAYLOAD_MANIFEST_MISSING');
  if(got&&m.payloadManifestSha256!==payloadManifestSha256(got.files))add(bad,'PAYLOAD_MANIFEST_SHA_INVALID');
  if(expected){if(JSON.stringify(canonicalFiles(got?.files))!==JSON.stringify(canonicalFiles(expected.files)))add(bad,'PAYLOAD_PATH_OR_HASH_MISMATCH');if(m.payloadManifestSha256!==expected.payloadManifestSha256)add(bad,'PAYLOAD_MANIFEST_SHA_MISMATCH')}
  return{verdict:bad.length?'BLOCKED':'PASS',mode,mismatches:bad,sourceRepo:m.sourceRepo,sourceSHA:m.sourceSHA,targetRepo:m.targetRepo,targetBaseSHA:m.targetBaseSHA,payloadManifestSha256:m.payloadManifestSha256,policy:'Cross-repo proof binds payload bytes to sourceSHA and target checkout independently; sourceSHA must never equal targetBaseSHA.'};
}
function selftest(){
  const files=[{path:'index.html',bytes:3,sha256:sha256('abc')},{path:'QA/v40_human_calibration_manifest.json',bytes:3,sha256:sha256('xyz')}],manifest={files,payloadManifestSha256:payloadManifestSha256(files)};
  const base={mode:'cross-repo',sourceRepo:SOURCE_REPO,sourceSHA:SOURCE_SHA,targetRepo:TARGET_REPO,targetBaseSHA:TARGET_BASE_SHA,payloadManifestSha256:manifest.payloadManifestSha256,payloadManifest:manifest};
  const mutated=[{...files[0],sha256:sha256('abd')},files[1]];
  const cases=[['valid cross-repo PASS',base,'PASS'],['stale source RED',{...base,sourceSHA:'stale'},'BLOCKED'],['wrong target base RED',{...base,targetBaseSHA:'wrong'},'BLOCKED'],['one-byte content/hash mutation RED',{...base,payloadManifest:{files:mutated,payloadManifestSha256:payloadManifestSha256(mutated)}},'BLOCKED'],['omitted required browser asset RED',{...base,payloadManifest:{files:[files[0]],payloadManifestSha256:payloadManifestSha256([files[0]])}},'BLOCKED']];
  const results=cases.map(([name,m,want])=>{const actual=validate(m,{expectedManifest:manifest}).verdict;return{name,expected:want,actual,pass:actual===want}});if(results.some(x=>!x.pass))throw new Error('CROSS_REPO_SELFTEST_FAILED');return{module:'V40_CROSS_REPO_PROOF_CONTRACT',selftest:'PASS',cases:results};
}
if(require.main===module){if(process.argv.includes('--selftest')){console.log(JSON.stringify(selftest(),null,2));process.exit(0)}const i=JSON.parse(process.argv[2]||'{}'),o=validate(i,{mode:i.mode||'cross-repo'});console.log(JSON.stringify(o,null,2));if(o.verdict!=='PASS')process.exitCode=12}
module.exports={SOURCE_REPO,SOURCE_SHA,TARGET_REPO,TARGET_BASE_SHA,sha256,payloadManifestSha256,manifestFromRoot,validate,selftest};
