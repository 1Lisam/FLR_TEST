const $=s=>document.querySelector(s),canvas=$('#pitch'),ctx=canvas.getContext('2d');
const index=await fetch('data/index.json').then(r=>r.json());
let reviews={};try{reviews=await fetch('data/reviews.json').then(r=>r.ok?r.json():{});}catch{}
let record=null,episode=null,reviewKey='whole',time=0,from=0,to=0,playing=false,last=performance.now(),selected=null,recorder=null,chunks=[];
const names={ 'ne1-reported-wide':'새 엔진 · 신고된 1번 원본','ne1-current-1':'새 엔진 · 수리 후 1번', 'p7-near_before':'기존 엔진 · 골문 앞 무대응 원본','p7-near_after':'기존 엔진 · 골문 앞 대응 표본','p7-central_before':'기존 엔진 · 중앙 무대응 원본','p7-central_after':'기존 엔진 · 중앙 대응 이후 기록'};
const label=id=>names[id]??'새 엔진 · 별도 '+id.replace('formation-holdout-','').replace('holdout-','')+'번';
const actor=id=>id?.startsWith('H-')?'블루 '+id.slice(2):id?.startsWith('A-')?'레드 '+id.slice(2):id??'';
const isFormation=e=>['GROUP_LOCKSTEP_REVIEW','PERSISTENT_FLAT_LINE_REVIEW'].includes(e?.peak?.kind);
const episodeLabel=e=>isFormation(e)?(e.team===0?'블루':'레드')+' '+e.peak.actors.length+'명 묶음':actor(e.carrier);
const clock=t=>Math.floor(t/60).toString().padStart(2,'0')+':'+(t%60).toFixed(1).padStart(4,'0');
for(const r of index.records){const o=document.createElement('option');o.value=r.id;o.textContent=label(r.id)+' · 의심 '+r.candidates+'건';$('#record').append(o);}
function decode(row){return{time:row[0],ball:{x:row[1],y:row[2],z:row[3],owner:record.nodes[row[4]]?.id??null},restart:!!row[5],controlled:!!row[6],direction:row[7],players:record.nodes.map((p,i)=>({...p,x:row[8][i*3],y:row[8][i*3+1],facing:row[8][i*3+2]}))};}
function pose(at){
 let hi=record.frames.findIndex(f=>f[0]>=at);if(hi<0)hi=record.frames.length-1;
 const b=decode(record.frames[hi]),a=decode(record.frames[Math.max(0,hi-1)]),dt=b.time-a.time,blend=dt>0&&dt<=.6?Math.max(0,Math.min(1,(at-a.time)/dt)):0;
 if(hi===0||at>=b.time-1e-7){b.time=at;return b;}
 if(blend>0){a.players.forEach((p,i)=>{p.x+=(b.players[i].x-p.x)*blend;p.y+=(b.players[i].y-p.y)*blend;if(p.facing!==null&&b.players[i].facing!==null)p.facing+=Math.atan2(Math.sin(b.players[i].facing-p.facing),Math.cos(b.players[i].facing-p.facing))*blend;});if(!a.restart&&!b.restart){a.ball.x+=(b.ball.x-a.ball.x)*blend;a.ball.y+=(b.ball.y-a.ball.y)*blend;}}
 a.time=at;return a;
}
function draw(c,at,width=1150,height=800){
 const s=pose(at),x=v=>50+v*10,y=v=>60+v*10;c.save();c.scale(width/1150,height/800);c.fillStyle='#13291e';c.fillRect(0,0,1150,800);
 for(let i=0;i<10;i++){c.fillStyle=i%2?'#285636':'#244c30';c.fillRect(50+i*105,60,105,680);}
 c.strokeStyle='#b0c7ab';c.lineWidth=1.4;
 const rect=(a,b,w,h)=>c.strokeRect(x(a),y(b),w*10,h*10),line=(a,b,d,e)=>{c.beginPath();c.moveTo(x(a),y(b));c.lineTo(x(d),y(e));c.stroke();};
 rect(0,0,105,68);line(52.5,0,52.5,68);c.beginPath();c.arc(x(52.5),y(34),91.5,0,Math.PI*2);c.stroke();rect(0,13.84,16.5,40.32);rect(88.5,13.84,16.5,40.32);rect(0,24.84,5.5,18.32);rect(99.5,24.84,5.5,18.32);rect(-1.6,30.34,1.6,7.32);rect(105,30.34,1.6,7.32);
 const group=new Set(isFormation(episode)?episode.peak.actors:[]),focus=selected??episode?.peak.facts.availableDefenders?.[0]?.id;
 if($('#trails').checked){for(const p of s.players){const rows=record.frames.filter(f=>f[0]>=at-(isFormation(episode)?8:3)&&f[0]<=at);c.strokeStyle=p.id===focus||group.has(p.id)?'#ffd36d':p.id===s.ball.owner?'#fff9bc':p.team===0?'#84bbef55':'#ff969655';c.lineWidth=p.id===focus||p.id===s.ball.owner||group.has(p.id)?3:1;c.beginPath();rows.forEach((r,i)=>{const n=record.nodes.findIndex(q=>q.id===p.id);const px=r[8][n*3],py=r[8][n*3+1];if(i)c.lineTo(x(px),y(py));else c.moveTo(x(px),y(py));});c.stroke();}}
 for(const p of s.players){const px=x(p.x),py=y(p.y);if(p.id===focus||p.id===episode?.carrier||group.has(p.id)){c.strokeStyle=p.id===focus||group.has(p.id)?'#ffce6a':'#fffbd5';c.lineWidth=2.5;c.beginPath();c.arc(px,py,13,0,Math.PI*2);c.stroke();}c.fillStyle=p.role==='GK'?(p.team===0?'#c0ebd9':'#ebd1be'):p.team===0?'#559fe5':'#df6462';c.beginPath();c.arc(px,py,8,0,Math.PI*2);c.fill();c.strokeStyle='#e5efdd';c.lineWidth=1;c.stroke();if(p.facing!==null){c.beginPath();c.moveTo(px,py);c.lineTo(px+Math.cos(p.facing)*12,py+Math.sin(p.facing)*12);c.stroke();}c.font='bold 10px sans-serif';c.textAlign='center';c.strokeStyle='#142a20';c.lineWidth=3;c.strokeText(p.id.replace(/^[HA]-/,''),px,py-13);c.fillStyle='#fff';c.fillText(p.id.replace(/^[HA]-/,''),px,py-13);}
 c.fillStyle='#fff5d4';c.strokeStyle='#152b1d';c.beginPath();c.arc(x(s.ball.x),y(s.ball.y),4,0,Math.PI*2);c.fill();c.stroke();
 c.fillStyle='#b9ccc2';c.font='14px sans-serif';c.textAlign='left';c.fillText(label(record.id)+' · 위치 기록 재생',50,29);c.textAlign='right';c.fillText(clock(at),1100,29);c.textAlign='left';c.font='12px sans-serif';c.fillText('블루 '+(s.direction===1?'→':'←')+'          '+(group.size?'노랑: 대표 관측창에서 함께 측정한 묶음 · 경로는 지난 8초':'흰 테두리: 공 소유자 · 노랑: 살펴보는 선수')+'          레드 '+(s.direction===1?'←':'→'),50,777);c.restore();
}
function facts(){
 const box=$('#facts');box.replaceChildren();if(!episode){box.textContent='이 구간은 자동 경고 유무와 관계없이 직접 살펴봅니다.';return;}
 const f=episode.peak.facts,lines=[];
 if(isFormation(episode)){
  lines.push(episode.peak.actors.map(actor).join(' · '));
  lines.push(f.windowSeconds.toFixed(1)+'초 동안 묶음의 중심은 '+f.centroidDisplacement.toFixed(1)+'m 이동했고, 각 선수의 묶음 안 위치 관계 변화 크기는 '+f.shapeRmsMetres.toFixed(3)+'m였습니다.');
  lines.push('관측 시점의 '+Math.round(f.lineAlignedFraction*100)+'%에서 12m 이상 폭을 가진 한 줄(깊이 차이 2.5m 이하)을 유지했습니다. 한 줄이라는 이유만으로 오류는 아닙니다.');
  lines.push('같은 동안 공은 '+f.ballPath.toFixed(1)+'m 이동했습니다. 공 소유 표시 변화는 '+f.ownerChanges+'번이며, 패스 중 소유자 없음도 포함합니다.');
  for(const p of f.members)lines.push(actor(p.id)+' · 이동 '+p.displacement.toFixed(1)+'m · 공까지 '+p.ballDistanceFrom.toFixed(1)+'→'+p.ballDistanceTo.toFixed(1)+'m · 가까운 상대까지 '+p.nearestOpponentFrom.toFixed(1)+'→'+p.nearestOpponentTo.toFixed(1)+'m');
 }else{
 lines.push(actor(episode.carrier)+'가 '+f.windowSeconds.toFixed(1)+'초 동안 골문 쪽으로 '+f.carrierAdvance.toFixed(1)+'m 전진했습니다.');
 if(f.frontPressureFraction!==undefined)lines.push('관찰한 시점 중 앞 수비수와 가까이 맞선 비율은 '+Math.round(f.frontPressureFraction*100)+'%입니다. 이것만으로 무대응을 확정하지 않습니다.');
 for(const p of f.availableDefenders.slice(0,3)){let line=actor(p.id)+' · 소유자와 '+p.startDistance.toFixed(1)+'m → '+p.endDistance.toFixed(1)+'m, 몸은 '+p.displacement.toFixed(1)+'m 이동했습니다.';if(p.nearestOtherAttackers[0])line+=' 다른 상대 '+actor(p.nearestOtherAttackers[0].id)+'까지 '+p.nearestOtherAttackers[0].distance.toFixed(1)+'m입니다.';lines.push(line);}
 if(f.keeper)lines.push('창 끝에서 '+actor(f.keeper.id)+'와 소유자 거리는 '+f.keeper.distance.toFixed(1)+'m입니다.');}
 for(const text of lines){const d=document.createElement('div');d.className='fact';d.textContent=text;box.append(d);}
 const m=document.createElement('p');m.className='muted';m.textContent='위 수치는 '+clock(episode.peak.from)+'~'+clock(episode.peak.to)+'의 대표 관측창에만 해당합니다. '+(isFormation(episode)?'긴 구간의 모든 선수가 동시에 같은 묶음이었다는 뜻은 아닙니다.':'전체 의심 구간은 더 길 수 있습니다.');box.append(m);
}
function showReview(){
 const r=reviews[record.id]?.[reviewKey];$('#badge').className='';
 const verdicts={CONFIRMED_ERROR:'오류 확인',CONFIRMED_RIGIDITY:'집단 경직 확인',PLAUSIBLE_GROUP_MOVEMENT:'설명 가능한 동반 이동',PLAUSIBLE_RESPONSE:'대응 근거 확인',SUSPICIOUS:'의심 유지',INSUFFICIENT:'근거 부족',NO_TARGET_ERROR_OBSERVED:'본 구간에서 해당 오류 못 찾음'};
 $('#badge').textContent=r?verdicts[r.verdict]??r.verdict:'AI 미검토';if(['CONFIRMED_ERROR','CONFIRMED_RIGIDITY'].includes(r?.verdict))$('#badge').className='confirmed';if(['PLAUSIBLE_RESPONSE','PLAUSIBLE_GROUP_MOVEMENT'].includes(r?.verdict))$('#badge').className='allowed';
 $('#judgement').textContent=r?.reason??'이 구간은 아직 문맥을 검토하지 않았습니다. 자동 선별만으로 오류라고 판정하지 않습니다.';
 $('#counter').textContent=r?.counterEvidence?'함께 본 반대 근거 · '+r.counterEvidence:'';
 $('#reviewScope').textContent=r?.scope??'다른 공격수, 동료의 대응, 장면 전후를 함께 확인해야 합니다.';
}
function selectRange(key,a,b,e=null){playing=false;episode=e;reviewKey=key;selected=null;from=Math.max(record.frames[0][0],a);to=Math.min(record.frames.at(-1)[0],b);time=from;$('#timeline').min=from;$('#timeline').max=to;$('#title').textContent=e?(isFormation(e)?'대표 관측 '+clock(e.peak.from)+'~'+clock(e.peak.to):clock(e.from)+'~'+clock(e.to))+' · '+episodeLabel(e):key==='whole'?'전체 기록':'놓침 점검 · '+clock(from)+'~'+clock(to);$('#context').textContent=e?(isFormation(e)?'긴 선별 구간의 대표 관측창과 앞뒤 3초를 재생합니다. 노란 묶음의 위치 관계를 살펴보며, 정상적인 라인 이동도 있을 수 있습니다.':'노란 선수만의 책임으로 단정하지 않습니다. 동료·상대와 전후 움직임을 함께 봅니다.'):'자동 경고가 없더라도 정상으로 처리하지 않고 직접 살펴보는 구간입니다.';facts();showReview();for(const b of document.querySelectorAll('aside button'))b.classList.toggle('active',b.dataset.key===key);update();}
async function load(id){
 playing=false;if(recorder?.state==='recording'){recorder.stop();$('#video').textContent='재생 영상 기록 시작';}canvas.dataset.record='';$('#title').textContent='기록을 읽는 중';for(const b of document.querySelectorAll('button'))b.disabled=true;
 const loaded=await fetch(index.records.find(r=>r.id===id).file).then(r=>r.json());if($('#record').value!==id)return;
 record=loaded;canvas.dataset.record=id;for(const b of document.querySelectorAll('button'))b.disabled=false;
 $('#source').textContent=(record.source.kind?.includes('NATIVE')?'계산으로 진행한 기록 · 실제 UI 영상과 구분':'기존 실제 기록')+' · 상품 '+record.source.product.slice(0,8);
 $('#episodes').replaceChildren();$('#cohorts')?.replaceChildren();for(const e of record.report.episodes){const b=document.createElement('button');b.dataset.key=e.id;b.textContent=clock(e.from)+'~'+clock(e.to);const small=document.createElement('small');small.textContent=episodeLabel(e)+' · '+(isFormation(e)?e.cohorts.length+'개 관측 묶음':e.actors.map(actor).slice(0,3).join(', '));b.append(small);b.onclick=()=>selectRange(e.id,e.peak.from-3,e.peak.to+3,e);$('#episodes').append(b);
  if($('#cohorts'))for(const c of e.cohorts??[]){const cb=document.createElement('button');cb.dataset.key=c.id;cb.textContent=clock(c.peak.from)+'~'+clock(c.peak.to)+' · '+c.actors.map(actor).join(', ');cb.onclick=()=>selectRange(c.id,c.peak.from-3,c.peak.to+3,c);$('#cohorts').append(cb);}}
 if(!record.report.episodes.length)$('#episodes').textContent='이 탐지 범위에서 의심 후보 없음. 정상 판정은 아닙니다.';
 $('#audits').replaceChildren();for(const [i,a] of record.auditWindows.entries()){const b=document.createElement('button');b.dataset.key='audit-'+i;b.textContent=clock(a.from)+'~'+clock(a.to);b.onclick=()=>selectRange('audit-'+i,a.from,a.to);$('#audits').append(b);}
 const c=record.report.coverage;$('#coverage').textContent=record.scope==='FORMATION'?'22명 자료 '+c.validFrames+'개 시점 · 재시작을 제외한 연속 관찰 '+c.examinedSeconds.toFixed(1)+'초. 재시작 제외 '+c.restartSeconds.toFixed(1)+'초. 자료 누락 '+c.invalidFrames+'개, 시간 단절 '+c.clockBreaks+'건.':'22명 자료 '+c.validFrames+'개 시점 · 연속 시간 '+c.timelineSeconds.toFixed(1)+'초. 재시작 '+c.restartSeconds.toFixed(1)+'초, 공이 자유로운 구간 '+c.uncontrolledBallSeconds.toFixed(1)+'초, GK 소유 '+c.keeperPossessionSeconds.toFixed(1)+'초는 이번 판단에서 제외합니다. 자료 누락 '+c.invalidFrames+'개, 시간 단절 '+c.clockBreaks+'건.';
 $('#technical').textContent=JSON.stringify({source:record.source,inputSha256:record.report.inputSha256,detector:record.report.detectorHashes,existingNearOmitted:record.report.existingNearOmitted},null,2);
 const preferred=reviews[id]?._defaultKey,all=[...record.report.episodes,...record.report.episodes.flatMap(e=>e.cohorts??[])];
 const first=preferred?all.find(e=>e.id===preferred):id==='ne1-reported-wide'&&record.scope!=='FORMATION'?record.report.episodes.find(e=>e.carrier==='H-RW'&&e.from<50&&e.to>50):record.report.episodes[0];
 if(first)selectRange(first.id,first.peak.from-3,first.peak.to+3,first);else selectRange('whole',record.frames[0][0],record.frames.at(-1)[0]);
}
function update(){if(!record)return;draw(ctx,time);$('#timeline').value=time;$('#clock').textContent=clock(time);$('#play').textContent=playing?'일시정지':'재생';canvas.dataset.time=time.toFixed(3);canvas.dataset.players='22';if($('#positions').closest('details').open){const s=pose(time),prior=pose(Math.max(record.frames[0][0],time-1));const t=document.createElement('table');t.innerHTML='<tr><th>선수</th><th>가로 위치(m)</th><th>세로 위치(m)</th><th>최근 1초 이동(m)</th><th>공과 거리(m)</th></tr>';for(const p of s.players){const q=prior.players.find(q=>q.id===p.id),tr=document.createElement('tr');for(const text of [actor(p.id),p.x.toFixed(1),p.y.toFixed(1),Math.hypot(p.x-q.x,p.y-q.y).toFixed(1),Math.hypot(p.x-s.ball.x,p.y-s.ball.y).toFixed(1)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}t.append(tr);}$('#positions').replaceChildren(t);}}
$('#record').onchange=e=>load(e.target.value);$('#whole').onclick=()=>selectRange('whole',record.frames[0][0],record.frames.at(-1)[0]);$('#play').onclick=()=>{if(time>=to)time=from;playing=!playing;last=performance.now();update();};$('#timeline').oninput=e=>{playing=false;time=Number(e.target.value);update();};
$('#previous').onclick=()=>{playing=false;time=Math.max(from,time-.2);update();};$('#next').onclick=()=>{playing=false;time=Math.min(to,time+.2);update();};$('#trails').onchange=update;$('#positions').closest('details').ontoggle=update;
canvas.onclick=e=>{const r=canvas.getBoundingClientRect(),x=((e.clientX-r.left)*1150/r.width-50)/10,y=((e.clientY-r.top)*800/r.height-60)/10,s=pose(time),p=[...s.players].sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];selected=Math.hypot(p.x-x,p.y-y)<3?p.id:null;update();};
async function save(blob,name){if(location.origin==='http://127.0.0.1:4189'){const r=await fetch('/__capture?name='+encodeURIComponent(name),{method:'POST',body:blob});if(r.ok){$('#saved').textContent='저장됨 · '+await r.text();return;}}const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}
$('#capture').onclick=()=>{const name='FLR-NE1-observer-'+record.id+'-'+time.toFixed(1)+'s.png';$('#saved').textContent='저장 중';canvas.toBlob(b=>save(b,name));};
$('#sheet').onclick=()=>{const name='FLR-NE1-observer-'+record.id+'-'+reviewKey+'.png';$('#saved').textContent='저장 중';const c=document.createElement('canvas');c.width=2300;c.height=1600;const x=c.getContext('2d');for(let i=0;i<16;i++){x.save();x.translate((i%4)*575,Math.floor(i/4)*400);draw(x,from+(to-from)*i/15,575,400);x.restore();}c.toBlob(b=>save(b,name));};
$('#video').onclick=()=>{if(recorder?.state==='recording'){recorder.stop();$('#video').textContent='재생 영상 기록 시작';return;}const name='FLR-NE1-observer-'+record.id+'-'+reviewKey+'.webm';chunks=[];const stream=canvas.captureStream(30);recorder=new MediaRecorder(stream,{mimeType:MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm'});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{save(new Blob(chunks,{type:'video/webm'}),name);stream.getTracks().forEach(t=>t.stop());};recorder.start(1000);$('#video').textContent='재생 영상 기록 끝내기';};
function loop(now){if(playing){time=Math.min(to,time+Math.min(.2,(now-last)/1000)*Number($('#speed').value));if(time>=to)playing=false;update();}last=now;requestAnimationFrame(loop);}requestAnimationFrame(loop);$('#record').value=index.defaultRecord??'ne1-reported-wide';await load($('#record').value);
