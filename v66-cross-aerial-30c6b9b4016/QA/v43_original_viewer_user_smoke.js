#!/usr/bin/env node
'use strict';
/* TEST_ONLY deterministic source-time and blind-result UX smoke. */
const assert=require('assert'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
function sourceIndexAt(frames,t){let i=0;while(i<frames.length-1&&frames[i+1].time<=t)i++;return i;}
function timingProof(){
  // This is the #544 failure shape: a real 8-second source interval.  The prior index clock
  // crossed it in 0.1s; a source-time clock stays between its actual endpoints at 100ms.
  const frames=[{time:100},{time:108},{time:108.1}],at100ms=100.1;
  assert.equal(sourceIndexAt(frames,at100ms),0,'8-second source movement must remain in its first interval after 100ms');
  assert.equal(sourceIndexAt(frames,108),1,'real source endpoint must be reached only at its actual timestamp');
  assert(at100ms<frames[1].time,'old fixed-index 0.1-second advance would have crossed this source interval');
}
function run(){
  const ui=read('evidence/v43/user_viewer/index.html'),source=read('step71_hybrid_v06_ui.js');
  assert(ui.includes('src="../../index.html?flr_v43_user_viewer=1"'),'user page must embed original root viewer');
  assert(ui.includes('FLR_V43_ORIGINAL_VIEWER_ADAPTER')&&!ui.includes('getContext('),'Viewer must use original renderer without a parallel canvas');
  assert(source.includes('function installV43OriginalViewerTestAdapter()')&&source.includes('draw,interp'),'original adapter must remain available');
  assert(ui.includes('function validateCaseSource')&&ui.includes('SOURCE_TIMESTAMPS_NOT_STRICTLY_INCREASING')&&ui.includes('SOURCE_PLAYER_SPEED_IMPLAUSIBLE'),'source continuity hard gate missing');
  assert(ui.includes('playheadTime=Math.min(end,playheadTime+elapsed*rate)'),'playback must advance elapsed source seconds, not source indices');
  assert(!ui.includes('playhead+elapsed*rate*10'),'old 0.1-second-per-index timing logic survived');
  assert(ui.includes('sourceIndexAt(t)')&&ui.includes('(t-sourceTime(a))/dt'),'timestamp lookup and interval interpolation missing');
  assert(ui.includes('Math.min(.25,(now-last)/1000)'),'bounded wall-clock mapping missing');
  assert(ui.includes("$('aggregate').hidden=saved.length===0")&&ui.includes('전체 결과 복사'),'cumulative copy control must appear after the first save');
  assert(ui.includes('장면 식별: 실제 엔진 프레임')&&ui.includes('사용자 판단:')&&ui.includes('메모:'),'copy output must retain neutral reconciliation fields');
  const refresh=ui.match(/function refresh\(\)\{([\s\S]*?)\}\nfunction openCase/);assert(refresh&&!/seed|internal|detector|classification/.test(refresh[1]),'cumulative blind copy must not expose internal metadata');
  assert(ui.includes('저장됨 · 사용자 판단:')&&ui.includes('내부 정보(이 판정 후 공개)'),'saved judgment must remain visibly retained with post-judgment-only reveal');
  timingProof();
  return{module:'V43_ORIGINAL_VIEWER_USER_SMOKE',verdict:'PASS',timing:'SOURCE_TIMESTAMP_ELAPSED_SECONDS',oldTimingMutation:'HARD_FAIL',continuityGate:'PASS',cumulativeBlindCopy:'PASS'};
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));module.exports={run,timingProof};
