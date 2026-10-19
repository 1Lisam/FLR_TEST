const $=s=>document.querySelector(s),canvas=$('#pitch'),ctx=canvas.getContext('2d');
const index=await fetch('data/index.json').then(r=>r.json());
let reviews={};try{reviews=await fetch('data/reviews.json').then(r=>r.ok?r.json():{});}catch{}
const imported=new Map();let record=null,episode=null,reviewKey='whole',time=0,from=0,to=0,playing=false,last=performance.now(),selected=null,recorder=null,chunks=[];
const names={ 'ne1-reported-wide':'새 엔진 · 신고된 1번 원본','ne1-current-1':'새 엔진 · 수리 후 1번', 'p7-near_before':'기존 엔진 · 골문 앞 무대응 원본','p7-near_after':'기존 엔진 · 골문 앞 대응 표본','p7-central_before':'기존 엔진 · 중앙 무대응 원본','p7-central_after':'기존 엔진 · 중앙 대응 이후 기록'};
const label=id=>names[id]??'새 엔진 · 별도 '+id.replace('formation-holdout-','').replace('holdout-','')+'번';
const actor=id=>id?.startsWith('H-')?'블루 '+id.slice(2):id?.startsWith('A-')?'레드 '+id.slice(2):id??'';
const isFormation=e=>['GROUP_LOCKSTEP_REVIEW','PERSISTENT_FLAT_LINE_REVIEW'].includes(e?.peak?.kind);
const auditKinds={DEFENSIVE_RESPONSE_REVIEW:'공 근처 수비 대응',NEAR_GOAL_RESPONSE_REVIEW:'골문 앞 대응',GROUP_LOCKSTEP_REVIEW:'집단 경직',PERSISTENT_FLAT_LINE_REVIEW:'지속되는 한 줄',OFF_BALL_STILLNESS:'공 없는 선수 정지',OFF_BALL_OSCILLATION:'공 없는 선수 왕복',UNPROTECTED_ADVANCE:'전진 뒤 보호 공백',PRESS_BLOCK_DISCONNECTION:'압박과 후방 단절',BALL_CROWD:'공 주변 몰림',CARRIER_SUPPORT_LIMITED:'공 가진 선수 지원 부족',KEEPER_CLOSE_INACTION:'가까운 골키퍼 무대응',BOX_CARRY_REVIEW:'박스 안 운반·마무리 검토',FREE_BALL_APPROACH_REVIEW:'흘러나온 공 회수',PLAYER_DISCONTINUITY:'선수 이동 급변',BALL_DISCONTINUITY:'공 이동 급변',BODY_FACING_DISCONTINUITY:'몸 방향 급변',RESTART_TAKER_DISCONNECTED:'재시작 키커 거리'};
const episodeLabel=e=>record?.scope==='RELATION_AUDIT'?auditKinds[e.kind]??e.kind:isFormation(e)?(e.team===0?'블루':'레드')+' '+e.peak.actors.length+'명 묶음':actor(e.carrier);
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
 const group=new Set(isFormation(episode)||record.scope==='RELATION_AUDIT'?episode?.peak.actors??[]:[]),focus=selected??episode?.peak.facts.availableDefenders?.[0]?.id;
 if($('#trails').checked){for(const p of s.players){const rows=record.frames.filter(f=>f[0]>=at-(isFormation(episode)?8:3)&&f[0]<=at);c.strokeStyle=p.id===focus||group.has(p.id)?'#ffd36d':p.id===s.ball.owner?'#fff9bc':p.team===0?'#84bbef55':'#ff969655';c.lineWidth=p.id===focus||p.id===s.ball.owner||group.has(p.id)?3:1;c.beginPath();rows.forEach((r,i)=>{const n=record.nodes.findIndex(q=>q.id===p.id);const px=r[8][n*3],py=r[8][n*3+1];if(i)c.lineTo(x(px),y(py));else c.moveTo(x(px),y(py));});c.stroke();}}
 for(const p of s.players){const px=x(p.x),py=y(p.y);if(p.id===focus||p.id===episode?.carrier||group.has(p.id)){c.strokeStyle=p.id===focus||group.has(p.id)?'#ffce6a':'#fffbd5';c.lineWidth=2.5;c.beginPath();c.arc(px,py,13,0,Math.PI*2);c.stroke();}c.fillStyle=p.role==='GK'?(p.team===0?'#c0ebd9':'#ebd1be'):p.team===0?'#559fe5':'#df6462';c.beginPath();c.arc(px,py,8,0,Math.PI*2);c.fill();c.strokeStyle='#e5efdd';c.lineWidth=1;c.stroke();if(p.facing!==null){c.beginPath();c.moveTo(px,py);c.lineTo(px+Math.cos(p.facing)*12,py+Math.sin(p.facing)*12);c.stroke();}c.font='bold 10px sans-serif';c.textAlign='center';c.strokeStyle='#142a20';c.lineWidth=3;c.strokeText(p.id.replace(/^[HA]-/,''),px,py-13);c.fillStyle='#fff';c.fillText(p.id.replace(/^[HA]-/,''),px,py-13);}
 c.fillStyle='#fff5d4';c.strokeStyle='#152b1d';c.beginPath();c.arc(x(s.ball.x),y(s.ball.y),4,0,Math.PI*2);c.fill();c.stroke();
 c.fillStyle='#b9ccc2';c.font='14px sans-serif';c.textAlign='left';c.fillText(label(record.id)+' · 위치 기록 재생',50,29);c.textAlign='right';c.fillText(clock(at),1100,29);c.textAlign='left';c.font='12px sans-serif';c.fillText('블루 '+(s.direction===1?'→':'←')+'          '+(group.size?'노랑: 대표 관측창에서 함께 측정한 묶음 · 경로는 지난 8초':'흰 테두리: 공 소유자 · 노랑: 살펴보는 선수')+'          레드 '+(s.direction===1?'←':'→'),50,777);c.restore();
}
function facts(){
 const box=$('#facts');box.replaceChildren();if(!episode){box.textContent='이 구간은 자동 경고 유무와 관계없이 직접 살펴봅니다.';return;}
 const f=episode.peak.facts,lines=[];
 if(record.scope==='RELATION_AUDIT'&&!isFormation(episode)){
  lines.push(episode.peak.actors.map(actor).join(' · ')||'공의 연속성');
  const descriptions={DEFENSIVE_RESPONSE_REVIEW:'공 소유자는 전진했지만 앞에서 가까이 맞선 수비가 적게 기록됐습니다. 실제 접근·지연·마크와 돌파를 함께 확인합니다.',NEAR_GOAL_RESPONSE_REVIEW:'골문 가까이의 실제 수비·골키퍼 대응을 앞뒤 장면과 함께 봅니다.',OFF_BALL_STILLNESS:'공이 이동하는 동안 가까운 선수가 거의 움직이지 않았습니다. 지원·마크·공간 확보 중 무엇을 하고 있는지 함께 봅니다.',OFF_BALL_OSCILLATION:'선수 몸이 반복해서 이동 방향을 뒤집었습니다. 한 번의 방향 전환이나 목적지 변경만으로 선별하지 않습니다.',UNPROTECTED_ADVANCE:'풀백 뒤의 측면 상대 가까이에 골 쪽을 지키는 동료가 보이지 않았습니다. 정상적인 전진이나 실제 인계가 있는지 확인합니다.',PRESS_BLOCK_DISCONNECTION:'공에 접근한 선수와 뒤를 받칠 동료의 간격이 크게 벌어졌습니다. 팀 전체의 대응을 봅니다.',CARRIER_SUPPORT_LIMITED:'짧은 거리의 열린 패스 경로가 적게 보입니다. 패스가 반드시 가능해야 한다는 판정은 아닙니다.',BALL_CROWD:'같은 팀 여러 명이 공 가까이에 모였습니다. 세컨드볼 경합과 역할 포기를 구분합니다.',FREE_BALL_APPROACH_REVIEW:'소유자 없는 공과 가까운 선수의 거리가 줄지 않았습니다. 공의 이동·높이와 상대 대응을 함께 봅니다.',BOX_CARRY_REVIEW:'골문 가까이에서 운반이 이어졌습니다. 슛·패스·드리블 중 어떤 행동이 납득되는지 봅니다.'};
  lines.push(descriptions[episode.kind]??'기록된 이동 변화가 큽니다. 앞뒤 물리적 움직임을 직접 확인해야 합니다.');
  if(f.path!==undefined)lines.push('선수 실제 경로 '+f.path.toFixed(2)+'m · 공 경로 '+(f.ballPath??0).toFixed(2)+'m');
  if(f.physicalReversals!==undefined)lines.push('실제 몸 이동 반전 '+f.physicalReversals+'회 · 순이동 '+f.net+'m');
  if(f.nearestConnection!==undefined)lines.push('가장 가까운 후방 연결 '+f.nearestConnection+'m');
  if(f.optionsOverWindow)lines.push('관측 시점별 열린 짧은 패스 경로 '+f.optionsOverWindow.join(', '));
  if(f.exposedFraction!==undefined)lines.push('보호 공백 관측 비율 '+Math.round(f.exposedFraction*100)+'%');
  if(f.speed!==undefined)lines.push('기록된 이동 속도 '+f.speed+'m/s · 간격 '+f.seconds+'초');
  if(f.degrees!==undefined)lines.push('몸 방향 변화 '+f.degrees+'도 · 간격 '+f.seconds+'초');
  if(f.availableDefenders)for(const p of f.availableDefenders.slice(0,3))lines.push(actor(p.id)+' · 소유자까지 '+p.startDistance.toFixed(1)+'→'+p.endDistance.toFixed(1)+'m');
 }else if(isFormation(episode)){
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
 const verdicts={REVIEWED_WITH_FINDINGS:'검토함 · 문제·의심 있음',REVIEWED_NO_ADDITIONAL_FINDING:'검토함 · 추가 문제 못 찾음',CONFIRMED_ERROR:'오류 확인',CONFIRMED_RIGIDITY:'집단 경직 확인',PLAUSIBLE_GROUP_MOVEMENT:'설명 가능한 동반 이동',PLAUSIBLE_RESPONSE:'대응 근거 확인',SUSPICIOUS:'의심 유지',INSUFFICIENT:'근거 부족',NO_TARGET_ERROR_OBSERVED:'본 구간에서 해당 오류 못 찾음'};
 $('#badge').textContent=r?verdicts[r.verdict]??r.verdict:'AI 미검토';if(['CONFIRMED_ERROR','CONFIRMED_RIGIDITY'].includes(r?.verdict))$('#badge').className='confirmed';if(['PLAUSIBLE_RESPONSE','PLAUSIBLE_GROUP_MOVEMENT'].includes(r?.verdict))$('#badge').className='allowed';
 $('#judgement').textContent=r?.reason??'이 구간은 아직 문맥을 검토하지 않았습니다. 자동 선별만으로 오류라고 판정하지 않습니다.';
 $('#counter').textContent=r?.counterEvidence?'함께 본 반대 근거 · '+r.counterEvidence:'';
 $('#reviewScope').textContent=r?.scope??'다른 공격수, 동료의 대응, 장면 전후를 함께 확인해야 합니다.';
}
function selectRange(key,a,b,e=null){playing=false;episode=e;reviewKey=key;selected=null;from=Math.max(record.frames[0][0],a);to=Math.min(record.frames.at(-1)[0],b);time=from;$('#timeline').min=from;$('#timeline').max=to;$('#title').textContent=e?(isFormation(e)?'대표 관측 '+clock(e.peak.from)+'~'+clock(e.peak.to):clock(e.from)+'~'+clock(e.to))+' · '+episodeLabel(e):key==='whole'?'전체 기록':'놓침 점검 · '+clock(from)+'~'+clock(to);$('#context').textContent=e?(isFormation(e)?'긴 선별 구간의 대표 관측창과 앞뒤 3초를 재생합니다. 노란 묶음의 위치 관계를 살펴보며, 정상적인 라인 이동도 있을 수 있습니다.':'노란 선수만의 책임으로 단정하지 않습니다. 동료·상대와 전후 움직임을 함께 봅니다.'):'자동 경고가 없더라도 정상으로 처리하지 않고 직접 살펴보는 구간입니다.';facts();showReview();for(const b of document.querySelectorAll('aside button'))b.classList.toggle('active',b.dataset.key===key);update();}
async function load(id){
 playing=false;if(recorder?.state==='recording'){recorder.stop();$('#video').textContent='재생 영상 기록 시작';}canvas.dataset.record='';$('#title').textContent='기록을 읽는 중';for(const b of document.querySelectorAll('button'))b.disabled=true;
 const loaded=imported.get(id)??await fetch(index.records.find(r=>r.id===id).file).then(r=>r.json());if($('#record').value!==id)return;
 record=loaded;canvas.dataset.record=id;for(const b of document.querySelectorAll('button'))b.disabled=false;
 $('#source').textContent=(record.source.kind?.includes('NATIVE')?'계산으로 진행한 기록 · 실제 UI 영상과 구분':'기존 실제 기록')+' · 상품 '+record.source.product.slice(0,8);
 $('#episodes').replaceChildren();$('#cohorts')?.replaceChildren();for(const e of record.report.episodes){const b=document.createElement('button');b.dataset.key=e.id;b.dataset.domain=e.domain??'';b.textContent=clock(e.from)+'~'+clock(e.to);const small=document.createElement('small');small.textContent=episodeLabel(e)+' · '+(isFormation(e)?(e.cohorts?.length??1)+'개 관측 묶음':e.actors.map(actor).slice(0,3).join(', '));b.append(small);b.onclick=()=>selectRange(e.id,e.peak.from-3,e.peak.to+3,e);$('#episodes').append(b);
  if($('#cohorts'))for(const c of e.cohorts??[]){const cb=document.createElement('button');cb.dataset.key=c.id;cb.textContent=clock(c.peak.from)+'~'+clock(c.peak.to)+' · '+c.actors.map(actor).join(', ');cb.onclick=()=>selectRange(c.id,c.peak.from-3,c.peak.to+3,c);$('#cohorts').append(cb);}}
 if(!record.report.episodes.length)$('#episodes').textContent='이 탐지 범위에서 의심 후보 없음. 정상 판정은 아닙니다.';
 $('#audits').replaceChildren();for(const [i,a] of record.auditWindows.entries()){const b=document.createElement('button');b.dataset.key=a.id??'audit-'+i;b.textContent=clock(a.from)+'~'+clock(a.to)+(a.verdict?' · '+(a.verdict==='AI_NOT_REVIEWED'?'미검토':'검토함'):'');b.onclick=()=>selectRange(a.id??'audit-'+i,a.from,a.to);$('#audits').append(b);}
 if(record.scope==='RELATION_AUDIT'){const filter=document.querySelector('#domain');filter.replaceChildren(new Option('전체','all'));for(const d of record.report.domains)filter.append(new Option(d.label,d.id));filter.onchange=()=>{for(const b of document.querySelectorAll('#episodes button'))b.hidden=filter.value!=='all'&&b.dataset.domain!==filter.value;};document.querySelector('#domains').textContent=record.report.domains.map(d=>d.label+' · '+d.limits).join(' / ');}const c=record.report.coverage;$('#coverage').textContent=record.scope==='RELATION_AUDIT'?'양 팀 22명 · '+c.validFrames+'개 시점 · 전체 '+record.report.cells.length+'구간 중 '+record.report.reviewSummary.reviewedCells+'구간 검토. 경고 후보 '+record.report.episodes.length+'건은 각각 미검토일 수 있습니다. 자료 누락 '+c.invalidFrames+'개, 단절 '+c.gaps.length+'건. 재시작 정보 '+record.report.observability.restartMetadataFrames+'/'+record.report.observability.restartFrames+'개, 몸 방향 누락 '+record.report.observability.missingFacingPairs+'쌍.':record.scope==='FORMATION'?'22명 자료 '+c.validFrames+'개 시점 · 재시작을 제외한 연속 관찰 '+c.examinedSeconds.toFixed(1)+'초. 재시작 제외 '+c.restartSeconds.toFixed(1)+'초. 자료 누락 '+c.invalidFrames+'개, 시간 단절 '+c.clockBreaks+'건.':'22명 자료 '+c.validFrames+'개 시점 · 연속 시간 '+c.timelineSeconds.toFixed(1)+'초. 재시작 '+c.restartSeconds.toFixed(1)+'초, 공이 자유로운 구간 '+c.uncontrolledBallSeconds.toFixed(1)+'초, GK 소유 '+c.keeperPossessionSeconds.toFixed(1)+'초는 이번 판단에서 제외합니다. 자료 누락 '+c.invalidFrames+'개, 시간 단절 '+c.clockBreaks+'건.';
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
if($('#importReport'))$('#importReport').onchange=async e=>{
 try{const file=e.target.files[0];if(!file)return;if(file.size>8*1024*1024)throw Error('8MB 이하 검사 기록이 필요합니다.');const v=JSON.parse(await file.text());
  if(v.scope!=='RELATION_AUDIT'||v.nodes?.length!==22||!v.frames?.length||v.frames.length>10000||v.frames.some(f=>f[8]?.length!==66||f[8].some((x,i)=>i%3!==2&&!Number.isFinite(x)))||!v.report?.cells||v.report.schema!=='FOOTBALL_RELATION_AUDIT_1'||!v.report.inputSha256)throw Error('통합 검사기로 만든 화면용 기록이 필요합니다.');
  v.report.reviewSummary={status:'REVIEW_INCOMPLETE',reviewedCells:0,totalCells:v.report.cells.length};v.auditWindows=v.report.cells.map(c=>({id:c.id,from:c.from,to:c.to,verdict:'AI_NOT_REVIEWED'}));v.id='import-'+Date.now();imported.set(v.id,v);$('#record').append(new Option('새로 연 검사 기록 · '+file.name,v.id));$('#record').value=v.id;await load(v.id);$('#importStatus').textContent='이 기기에서만 읽었습니다. 외부로 전송하지 않습니다.';
 }catch(err){$('#importStatus').textContent=err.message;}
};
