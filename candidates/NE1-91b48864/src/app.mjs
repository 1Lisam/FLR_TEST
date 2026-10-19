import {createMatch,step,snapshot,DT} from './engine.mjs';
import {draw,pointOnPitch} from './render.mjs';
const $=s=>document.querySelector(s),canvas=$('#pitch');
let m,activeConfiguration,playing=false,speed=1,acc=0,last=performance.now(),history=[],replay=null,selected=null,recorder=null,chunks=[];
const labels={kickoff:'킥오프',pass:'패스',shot:'슈팅',receive:'패스 연결',interception:'가로채기',recovery:'흐른 공 회수',block:'슛 차단',save:'선방',smother:'골키퍼 회수',tackle:'공 경합',goal:'득점',offside:'오프사이드',restart:'재시작 준비',restartTaken:'재시작 실행',previewEnd:'3분 시험 종료'};
const restartNames={kickoff:'킥오프',throw:'스로인',corner:'코너킥',goalKick:'골킥',freeKick:'프리킥'};
function configuration(){return{seed:Number($('#seed').value),formations:[$('#homeFormation').value,$('#awayFormation').value],styles:[$('#homeStyle').value,$('#awayStyle').value],quality:$('#quality').value==='home'?[.85,.5]:$('#quality').value==='away'?[.5,.85]:[.7,.7]};}
function reset(){if(recorder?.state==='recording')stopRecording();activeConfiguration=configuration();m=createMatch(activeConfiguration);playing=false;acc=0;replay=null;selected=null;history=[snapshot(m)];$('#history').max=0;$('#history').value=0;$('#community').textContent='';update();}
function update(){
 const view=replay===null?m:history[replay];
 $('#score').textContent=view.score.join(' : ');$('#clock').textContent=`${Math.floor(view.time/60).toString().padStart(2,'0')}:${Math.floor(view.time%60).toString().padStart(2,'0')}`;
 $('#phase').textContent=m.status==='ended'?'시험 종료':view.restart?restartNames[view.restart.type]:playing?'진행 중':m.tick?'일시정지':'시작 전';
 $('#play').textContent=m.status==='ended'?'같은 경기 다시':playing?'일시정지':m.tick?'계속':'경기 시작';
 $('#viewStatus').textContent=replay===null?'현재 경기 · '+speed+'배속':'지나간 장면 · 계산 정지';
 const p=view.players.find(p=>p.id===selected);$('#actor').textContent=p?`${p.team===0?'블루':'레드'} ${p.role} · ${p.intention.reason}`:'선수를 누르면 지금 맡은 행동을 볼 수 있습니다.';
 const events=m.events.slice(-15).reverse();$('#events').replaceChildren(...events.map(e=>{const d=document.createElement('div');d.className='event';d.textContent=`${Math.floor(e.t/60)}:${Math.floor(e.t%60).toString().padStart(2,'0')} · ${e.playerId||(['블루','레드'][e.team]??'')} ${labels[e.type]||e.type}${e.targetId?' → '+e.targetId:''}${e.restart?' · '+restartNames[e.restart]:''}`;return d;}));
 if(m.summary)$('#community').replaceChildren(...m.summary.map(r=>{const d=document.createElement('p');d.textContent='팬의 한마디 · '+r.text;return d;}));
 canvas.dataset.tick=String(view.tick);canvas.dataset.players=String(view.players.length);canvas.dataset.status=m.status;canvas.dataset.time=String(m.time);
 // Deliberate read-only DOM receipt; QA need not reach into hidden engine globals.
 $('#build').textContent=`${m.teams[0].formation} / ${m.teams[1].formation} · seed ${m.seed}`;
 draw(canvas,view,{selected,seed:m.seed,speed,replay:replay!==null});
}
function loop(now){
 const elapsed=Math.min(.2,(now-last)/1000);last=now;
 if(playing&&replay===null&&!document.hidden){
   acc+=elapsed*speed;const budget=performance.now()+10;
   while(acc>=DT&&performance.now()<budget){if(!step(m)){playing=false;acc=0;break;}acc-=DT;
     if(m.tick%6===0){history.push(snapshot(m));$('#history').max=history.length-1;$('#history').value=history.length-1;}}
 }
 update();requestAnimationFrame(loop);
}
$('#play').onclick=()=>{if(m.status==='ended')reset();replay=null;playing=!playing;acc=0;};
$('#reset').onclick=reset;
$('#newSeed').onclick=()=>{$('#seed').value=Number($('#seed').value)+1;reset();};
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('selected',x===b));});
$('#history').oninput=e=>{playing=false;acc=0;replay=Number(e.target.value);update();};
$('#live').onclick=()=>{replay=null;$('#history').value=history.length-1;update();};
canvas.onclick=e=>{const pos=pointOnPitch(canvas,e.clientX,e.clientY),view=replay===null?m:history[replay];const p=[...view.players].sort((a,b)=>Math.hypot(a.x-pos.x,a.y-pos.y)-Math.hypot(b.x-pos.x,b.y-pos.y))[0];selected=Math.hypot(p.x-pos.x,p.y-pos.y)<3?p.id:null;update();};
async function download(blob,name){
 if(location.origin==='http://127.0.0.1:4189'){
  try{const response=await fetch('/__capture?name='+encodeURIComponent(name),{method:'POST',body:blob});if(response.ok){$('#recordStatus').textContent='노트북에 저장됨 · '+await response.text();return;}}catch{}
 }
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('#capture').onclick=()=>{const t=replay===null?m.time:history[replay].time;canvas.toBlob(b=>download(b,`FLR-NE1-seed${m.seed}-${Math.floor(t)}s.png`));};
$('#report').onclick=()=>download(new Blob([JSON.stringify({version:'NE1-preview',configuration:activeConfiguration,scope:'actual elapsed history only',time:m.time,events:m.events,stats:m.stats,history})],{type:'application/json'}),`FLR-NE1-seed${m.seed}-report.json`);
function stopRecording(){recorder.stop();$('#record').textContent='영상 기록 시작';$('#recordStatus').textContent='표시된 화면의 영상 기록을 저장합니다.';}
$('#record').onclick=()=>{
 if(recorder?.state==='recording'){stopRecording();return;}
 if(!canvas.captureStream||!window.MediaRecorder){$('#recordStatus').textContent='이 브라우저에서는 영상 기록을 지원하지 않습니다.';return;}
 chunks=[];const stream=canvas.captureStream(30);recorder=new MediaRecorder(stream,{mimeType:MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm'});
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{download(new Blob(chunks,{type:'video/webm'}),`FLR-NE1-seed${m.seed}.webm`);stream.getTracks().forEach(t=>t.stop());chunks=[];};
 recorder.start(1000);$('#record').textContent='영상 기록 끝내기';$('#recordStatus').textContent='현재 보이는 경기장을 기록 중입니다. 재생 속도도 그대로 기록됩니다.';
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;acc=0;}});
reset();requestAnimationFrame(loop);
