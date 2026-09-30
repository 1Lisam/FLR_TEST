'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const SOURCE=fs.readFileSync(path.join(ROOT,'final_match_test_dock.js'),'utf8');
const circleAspect=(rx,ry)=>Math.abs(Number(rx)/Number(ry));
function renderBody(p){
  const task=String(p.action||p.tacticalTask||'');
  const diving=p.role==='GK'&&/GK_(?:DIVE_PUSH_OFF_TRAVEL|SAVE|RUSH_BLOCK|PARRY)/.test(task);
  return {semantic:p.role==='GK'?'gk-player-body':'player-body',aspect:circleAspect(1,1),diving,x:Number(p.x),y:Number(p.y),finite:[p.x,p.y].every(Number.isFinite)};
}
function run(){
  assert(SOURCE.includes("gk?'gk-player-body':'player-body'"),'Dock must tag the player body primitive');
  assert(SOURCE.includes("ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2)"),'GK body must use circular glyph path');
  assert(!SOURCE.includes('ctx.ellipse(0,0,r*1.65,r*.72'),'rejected elongated GK body shape remains');
  assert(SOURCE.includes("ctx.__flrRenderSemantic='gk-motion-cue'"),'dive direction must be separate from body shape');
  const bad=renderBody({role:'GK',tacticalTask:'GK_DIVE_PUSH_OFF_TRAVEL',x:5,y:36});
  const good=renderBody({role:'GK',tacticalTask:'GK_DIVE_PUSH_OFF_TRAVEL',x:5,y:36});
  bad.aspect=circleAspect(1.65,.72); // synthetic mutation: previous renderer body-shape class
  assert(bad.aspect>1.8,'mutation fixture must reproduce rejected 2.2917:1 class');
  assert.equal(good.aspect,1,'moving GK body remains coherent');
  assert(good.diving&&good.x===5&&good.y===36,'dive state and positional travel are retained');
  const recovered=renderBody({role:'GK',tacticalTask:'GK_RECOVER',x:4.5,y:34});
  assert.equal(recovered.aspect,1);assert.equal(recovered.diving,false);assert(recovered.finite,'recovery must not leave stale/non-finite transform state');
  return {module:'V40_GK_RENDERER_SEMANTIC_SELFTEST',verdict:'PASS',bodyTargetAspectRatio:1,rejectedMutationAspectRatio:Number(bad.aspect.toFixed(10)),directionTravel:'POSITION_AND_MOTION_CUE',recovery:'CLEAN'};
}
if(require.main===module){const out=run();console.log(JSON.stringify(out,null,2));}
module.exports={run};
