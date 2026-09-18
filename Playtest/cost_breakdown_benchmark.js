(function(){'use strict';
const E=window.FLRPG_CONTINUOUS_CORE,P=window.FLRPG_PROTAGONIST_MATCH_CONTROLLER,$=id=>document.getElementById(id);
const STEP=.10,TARGET=5400,CHUNK_BUDGET_MS=5,MAX_STEPS_PER_CHUNK=160,SEED='V56-COST-BREAKDOWN-1',KEEP_SECONDS=11;
let cancelled=false,running=false;
const fmtMs=v=>v<1000?v.toFixed(1)+' ms':(v/1000).toFixed(2)+' s';
const fmtMem=v=>v==null?'미지원':(v/1048576).toFixed(1)+' MB';
const mem=()=>performance.memory?.usedJSHeapSize??null;
const yieldBrowser=()=>new Promise(r=>setTimeout(r,0));
function minimalFrame(m){
  return{time:m.time,score:{...m.score},phase:m.phase,possession:m.possession,
    ball:{mode:m.ball.mode,x:m.ball.x,y:m.ball.y,z:m.ball.z||0,vx:m.ball.vx||0,vy:m.ball.vy||0,vz:m.ball.vz||0,ownerId:m.ball.ownerId||null},
    players:m.players.map(p=>({id:p.id,x:p.x,y:p.y,vx:p.vx||0,vy:p.vy||0,tx:p.tx,ty:p.ty,markTargetId:p.markTargetId||null,action:p.action||null}))
  };
}
function detailedFrame(m){
  const s=E.snapshot(m);
  return{time:s.time,score:{...s.score},phase:s.phase,possession:s.possession,
    restart:m.restart?JSON.parse(JSON.stringify(m.restart)):null,
    ball:{...s.ball},
    players:s.players.map(p=>({id:p.id,name:p.name,team:p.team,role:p.role,slot:p.slot,x:p.x,y:p.y,vx:p.vx,vy:p.vy,tx:p.tx,ty:p.ty,action:p.action,tacticalTask:p.tacticalTask,markTargetId:p.markTargetId||null,hasBall:p.hasBall,bodyAngle:p.bodyAngle,faceTargetAngle:p.faceTargetAngle})),
    lastEvent:s.events?.at(-1)||null
  };
}
function keepRecent(history,mTime){const cutoff=mTime-KEEP_SECONDS;while(history.length>1&&history[0].time<cutoff)history.shift();}
function makeCase(kind){
  if(kind==='CONTROLLER_FULL'){return{kind,state:P.create(SEED,{heroPlayerId:'H-ST',mode:'FULL_SKIP',replaySeconds:10}),history:null};}
  return{kind,state:E.createMatch(SEED,{telemetry:{focusPlayerId:'H-ST'}}),history:kind==='CORE_ONLY'?null:[]};
}
function stepCase(c){
  if(c.kind==='CONTROLLER_FULL'){P.step(c.state,STEP);return c.state.m;}
  E.step(c.state,STEP);
  if(c.kind==='CORE_MIN_HISTORY'){c.history.push(minimalFrame(c.state));keepRecent(c.history,c.state.time);}
  else if(c.kind==='CORE_DETAILED_HISTORY'){c.history.push(detailedFrame(c.state));keepRecent(c.history,c.state.time);}
  return c.state;
}
function matchOf(c){return c.kind==='CONTROLLER_FULL'?c.state.m:c.state}
function addRow(r){const tr=document.createElement('tr');tr.innerHTML='<td>'+r.label+'</td><td>'+fmtMs(r.wallMs)+'</td><td>'+fmtMs(r.computeMs)+'</td><td>'+fmtMs(r.maxChunkMs)+'</td><td>'+r.steps.toLocaleString()+'</td><td>'+r.speed.toFixed(0)+'×</td><td>'+fmtMem(r.memDelta)+'</td><td>'+r.frames+'</td>';$('rows').appendChild(tr)}
async function bench(def,index,total){
  const c=makeCase(def.kind),m=matchOf(c),startMem=mem(),wallStart=performance.now();let computeMs=0,maxChunkMs=0,steps=0;
  while(!cancelled&&!m.completed&&m.time<TARGET-.0001){
    const t0=performance.now();let local=0;
    while(!m.completed&&m.time<TARGET-.0001&&local<MAX_STEPS_PER_CHUNK){
      stepCase(c);local++;steps++;
      if(performance.now()-t0>=CHUNK_BUDGET_MS)break;
    }
    const cm=performance.now()-t0;computeMs+=cm;maxChunkMs=Math.max(maxChunkMs,cm);
    const pct=((index+Math.min(m.time,TARGET)/TARGET)/total)*100;$('progress').style.width=pct.toFixed(1)+'%';
    $('state').textContent=def.label+' · '+(m.time/60).toFixed(1)+'분 계산 중';
    await yieldBrowser();
  }
  const wallMs=performance.now()-wallStart,endMem=mem(),sim=Math.min(TARGET,m.time);
  return{...def,wallMs,computeMs,maxChunkMs,steps,speed:sim/(wallMs/1000),memDelta:startMem!=null&&endMem!=null?endMem-startMem:null,frames:c.kind==='CONTROLLER_FULL'?(c.state.history?.length||0):(c.history?.length||0)};
}
async function run(){
  if(running)return;running=true;cancelled=false;$('run').disabled=true;$('stop').disabled=false;$('rows').innerHTML='';$('summary').textContent='측정 중';$('progress').style.width='0%';
  const defs=[
    {kind:'CORE_ONLY',label:'① 순수 코어'},
    {kind:'CORE_MIN_HISTORY',label:'② 코어 + 최소 11초 기록'},
    {kind:'CORE_DETAILED_HISTORY',label:'③ 코어 + 상세 11초 기록'},
    {kind:'CONTROLLER_FULL',label:'④ 현재 P.step 전체'}
  ],results=[];
  try{
    for(let i=0;i<defs.length&&!cancelled;i++){const r=await bench(defs[i],i,defs.length);results.push(r);addRow(r);}
    if(cancelled){$('state').textContent='사용자가 중지함';$('summary').textContent='측정 중지';return}
    $('progress').style.width='100%';$('state').textContent='완료';
    const a=results[0],b=results[1],c=results[2],d=results[3];
    const pct=(x,base)=>base>0?((x-base)/base*100):0;
    $('summary').innerHTML=
      '순수 코어: <strong>'+fmtMs(a.computeMs)+'</strong><br>'+
      '최소 최근기록 추가 비용: <strong>+'+fmtMs(Math.max(0,b.computeMs-a.computeMs))+'</strong> ('+pct(b.computeMs,a.computeMs).toFixed(0)+'%)<br>'+
      '상세 최근기록 추가 비용: <strong>+'+fmtMs(Math.max(0,c.computeMs-a.computeMs))+'</strong> ('+pct(c.computeMs,a.computeMs).toFixed(0)+'%)<br>'+
      '현재 P.step 전체 추가 비용: <strong>+'+fmtMs(Math.max(0,d.computeMs-a.computeMs))+'</strong> ('+pct(d.computeMs,a.computeMs).toFixed(0)+'%)<br>'+
      '<span class="muted">각 경로는 별도 경기이므로 절대값보다 경로 간 비용 차이를 우선 봅니다.</span>';
    window.__FLR_COST_BREAKDOWN_RESULTS__=results;
  }finally{running=false;$('run').disabled=false;$('stop').disabled=true}
}
$('run').addEventListener('click',run);$('stop').addEventListener('click',()=>{cancelled=true});
})();