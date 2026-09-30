'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..');
function selftest(){
  const c=JSON.parse(fs.readFileSync(path.join(__dirname,'v40_browser_renderer_capture_config.json'),'utf8'));
  assert.equal(c.schemaVersion,'FLR_BROWSER_RENDER_CAPTURE_1.0');
  assert.equal(c.page,'index.html'); assert.equal(c.dockId,'finalMatchTestDock'); assert.equal(c.canvasId,'heroPitch');
  assert.equal(c.scenarios.length,2);
  assert.deepEqual(c.scenarios,[
    {scenario:'GK_SHOT_CLOSE',seed:'FINAL-MATCH-TEST-135'},
    {scenario:'GK_SHOT_BOX',seed:'FINAL-MATCH-TEST-135'}
  ]);
  for(const p of ['.github/workflows/v40-browser-renderer-capture.yml','tools/v40_browser_renderer_capture.js'])assert(fs.existsSync(path.join(ROOT,p)),`missing ${p}`);
  for(const s of c.diagnosticStatuses)assert(['CAPTURE_OK_WITH_FINDINGS','CAPTURE_OK_CLEAN','QA_INFRA_BLOCKED'].includes(s));
  assert(c.requiredTelemetry.includes('lifecycleStages')); assert(c.requiredTelemetry.includes('primitiveMetrics[].semantic'));
  return{module:'V40_BROWSER_RENDERER_CAPTURE_CONFIG',selftest:'PASS',scenarioCount:c.scenarios.length,browser:c.browser};
}
if(require.main===module)console.log(JSON.stringify(selftest(),null,2));
module.exports={selftest};
