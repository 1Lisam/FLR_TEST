'use strict';
const assert=require('assert'),path=require('path');
const L=require('./v40_integration_runtime_loader.js');
const REQUIRED=['runtime/continuous_match_core.js','runtime/restart_movement.js','runtime/corner_templates.js'];
function run({omit=[]}={}){
  const entry=L.entrypointModules(),loaded=L.loaderModules({omit}),missing=entry.filter(x=>!loaded.includes(x));
  const gameplayMissing=missing.filter(x=>REQUIRED.includes(x)||/runtime\/(?:.*match|restart|corner|free_kick|ball|choice|tactical|aerial|take_on|protagonist|attribute)/.test(x));
  const out={module:'V40_RUNTIME_PARITY_CONTRACT',schemaVersion:'V40_RUNTIME_PARITY_1.0',verdict:gameplayMissing.length?'QA_INFRA_BLOCKED':'PASS',entrypoint:{file:'index.html',runtimeModules:entry},integrationLoader:{file:'QA/v40_integration_runtime_loader.js',loadedModules:loaded,omissions:omit,loadFunction:'available; exercised by selftest'},missing,gameplayMissing,requiredRuntimeModules:REQUIRED,policy:{entrypointAnchorsInventory:true,omittedGameplayModuleIsInfraBlocked:true,noIndependentHandwrittenCanonicalList:true}};
  return out;
}
function selftest(){
  const good=run();L.load();const bad=run({omit:['runtime/corner_templates.js']});
  assert.equal(good.verdict,'PASS');assert.equal(bad.verdict,'QA_INFRA_BLOCKED');assert(bad.gameplayMissing.includes('runtime/corner_templates.js'));
  return{module:good.module,selftest:'PASS',control:good,omissionMutation:bad};
}
if(require.main===module){const out=process.argv.includes('--selftest')?selftest():run({omit:process.argv.slice(2).filter(x=>x.startsWith('runtime/'))});console.log(JSON.stringify(out,null,2));if(out.verdict&&out.verdict!=='PASS')process.exitCode=12;}
module.exports={run,selftest};
