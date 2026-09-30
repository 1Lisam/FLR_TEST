(function(){'use strict';
const P=window.FLRPG_PROTAGONIST_MATCH_CONTROLLER,$=id=>document.getElementById(id);
const TARGETS=[300,900,2700,5400],STEP=.10,CHUNK_BUDGET_MS=5,MAX_STEPS_PER_CHUNK=160;
let cancelled=false,running=false;
const fmtMs=v=>v<1000?v.toFixed(1)+' ms':(v/1000).toFixed(2)+' s';
const fmtMem=v=>v==null?'미지원':(v/1048576).toFixed(1)+' MB';
function mem(){return performance.memory?.usedJSHeapSize??null}
function yieldToBrowser(){return new Promise(r=>setTimeout(r,0))}
function addRow(r){const tr=document.createElement('tr');tr.innerHTML='<td>'+Math.round(r.target/60)+'분</td><td>'+fmtMs(r.wallMs)+'</td><td>'+fmtMs(r.computeMs)+'</td><td>'+fmtMs(r.maxChunkMs)+'</td><td>'+r.yields+'</td><td>'+r.steps.toLocaleString()+'</td><td>'+r.speed.toFixed(0)+'×</td><td>'+fmtMem(r.memDelta)+'</td>';$('rows').appendChild(tr)}
async function bench(target,index){
  const s=P.create('V56-HEADLESS-BENCH-'+target,{heroPlayerId:'H-ST',mode:'FULL_SKIP',replaySeconds:10});
  const startMem=mem(),wallStart=performance.now();let computeMs=0,maxChunkMs=0,yields=0,steps=0;
  while(!cancelled&&!s.m.completed&&s.m.time<target-.0001){
    const chunkStart=performance.now();let local=0;
    while(!s.m.completed&&s.m.time<target-.0001&&local<MAX_STEPS_PER_CHUNK){
      P.step(s,Math.min(STEP,target-s.m.time));local++;steps++;
      if(performance.now()-chunkStart>=CHUNK_BUDGET_MS)break;
    }
    const chunkMs=performance.now()-chunkStart;computeMs+=chunkMs;maxChunkMs=Math.max(maxChunkMs,chunkMs);yields++;
    const pct=((index+(Math.min(s.m.time,target)/target))/TARGETS.length)*100;$('progress').style.width=pct.toFixed(1)+'%';
    $('state').textContent=Math.round(target/60)+'분 측정 · 내부 '+(s.m.time/60).toFixed(1)+'분 · 브라우저 응답 유지 중';
    await yieldToBrowser();
  }
  const wallMs=performance.now()-wallStart,endMem=mem(),simulated=Math.min(target,s.m.time),speed=simulated/(wallMs/1000);
  return{target,wallMs,computeMs,maxChunkMs,yields,steps,speed,memDelta:startMem!=null&&endMem!=null?endMem-startMem:null,completed:s.m.completed,time:s.m.time,historyFrames:s.history.length};
}
async function run(){
  if(running)return;running=true;cancelled=false;$('run').disabled=true;$('stop').disabled=false;$('rows').innerHTML='';$('summary').textContent='측정 중';$('progress').style.width='0%';
  const results=[];
  try{
    for(let i=0;i<TARGETS.length&&!cancelled;i++){const r=await bench(TARGETS[i],i);results.push(r);addRow(r);}
    if(cancelled){$('state').textContent='사용자가 중지함';$('summary').textContent='측정 중지';return}
    $('progress').style.width='100%';$('state').textContent='완료';
    const r90=results.at(-1),worst=Math.max(...results.map(r=>r.maxChunkMs));
    const responsiveness=worst<=16?'좋음':worst<=33?'보통':'주의';
    $('summary').innerHTML='90분 wall <strong>'+fmtMs(r90.wallMs)+'</strong> · 순수 계산 <strong>'+fmtMs(r90.computeMs)+'</strong> · 최장 계산 묶음 <strong>'+fmtMs(worst)+'</strong> · 화면 응답성 기준 <strong>'+responsiveness+'</strong> · 최근 history <strong>'+r90.historyFrames+' frames</strong><br><span class="muted">이 수치는 화면 렌더링을 완전히 끈 상태의 현재 Legacy 코어 비용입니다.</span>';
    window.__FLR_HEADLESS_BENCHMARK_RESULTS__=results;
  }finally{running=false;$('run').disabled=false;$('stop').disabled=true}
}
$('run').addEventListener('click',run);$('stop').addEventListener('click',()=>{cancelled=true});
})();