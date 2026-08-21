(function(root,factory){
  const api=factory(
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_CONTINUOUS_CORE)||((typeof require==='function')?require('./continuous_match_core.js'):null),
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_CHOICE_ACTION_RESOLVER_STEP38)||((typeof require==='function')?require('./choice_action_resolver_step38.js'):null),
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_MANAGER_TENDENCY_ADAPTER)||((typeof require==='function')?require('./manager_tendency_adapter.js'):null),
    (typeof globalThis!=='undefined'&&globalThis.FLRPG_ATTRIBUTE_MATCH_ADAPTER)||((typeof require==='function')?require('./attribute_match_adapter.js'):null)
  );
  if(typeof module==='object'&&module.exports)module.exports=api;else root.FLRPG_PROTAGONIST_MATCH_CONTROLLER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(E,R38,M,A){
'use strict';
const VERSION='TT051-PROTAGONIST-MATCH-CONTROLLER-1.6-MEANINGFUL-CHOICE-FLOORS';
const MODES={
  FULL_MATCH:{id:'FULL_MATCH',label:'전체 경기',presentation:'LIVE',threshold:0,minGap:0.8,description:'경기 전체를 보면서 모든 유효한 주인공 판단을 표시'},
  PLAYER_ALL:{id:'PLAYER_ALL',label:'내 플레이 보기',presentation:'HIGHLIGHT',threshold:0,minGap:0.8,description:'경기는 고속 계산하고 주인공 판단 장면은 모두 직전 10초부터 재생'},
  IMPORTANT:{id:'IMPORTANT',label:'중요한 상황 보기',presentation:'HIGHLIGHT',threshold:.80,minGap:75,description:'경기는 고속 계산하고 의미가 큰 주인공 판단 에피소드만 재생'},
  DECISIVE_ONLY:{id:'DECISIVE_ONLY',label:'결정적인 상황 보기',presentation:'HIGHLIGHT',threshold:.94,minGap:90,description:'경기는 고속 계산하고 득점·실점에 직접 가까운 주인공 판단만 재생'},
  FULL_SKIP:{id:'FULL_SKIP',label:'전체 스킵',presentation:'SKIP',threshold:Infinity,minGap:Infinity,description:'사용자 선택 없이 경기 종료까지 계산'},
  // STEP40 V0.1 compatibility alias. New UI no longer emits PLAYER_FOCUS.
  PLAYER_FOCUS:{id:'PLAYER_FOCUS',label:'내 플레이 보기',presentation:'HIGHLIGHT',threshold:0,minGap:0.8,description:'PLAYER_ALL compatibility alias'}
};
const B=()=>E.choiceActionBridge(),C=()=>E.choiceStateBridge(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash32=s=>{let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;};
const deep=v=>v==null?v:JSON.parse(JSON.stringify(v));
function angleDiff(a,b){let d=(a-b)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return d;}
function normalizeMode(mode){return mode==='PLAYER_FOCUS'?'PLAYER_ALL':(MODES[mode]?mode:'PLAYER_ALL');}
function modeDef(s){return MODES[normalizeMode(s.mode)]||MODES.PLAYER_ALL;}
function leanFrame(m){
  const snap=E.snapshot(m),ev=[...(m.events||[])].reverse().find(e=>e&&e.type!=='USER_CHOICE'&&e.text);
  return{time:Number(snap.time.toFixed(2)),score:{...snap.score},phase:snap.phase,possession:snap.possession,restart:m.restart?deep(m.restart):null,lastEvent:ev?{t:Number((ev.t||snap.time).toFixed(2)),type:ev.type||null,text:ev.text}:null,
    ball:{mode:snap.ball.mode,x:Number(snap.ball.x.toFixed(3)),y:Number(snap.ball.y.toFixed(3)),z:Number((snap.ball.z||0).toFixed(3)),vx:Number((snap.ball.vx||0).toFixed(3)),vy:Number((snap.ball.vy||0).toFixed(3)),vz:Number((snap.ball.vz||0).toFixed(3)),ownerId:snap.ball.ownerId||null,intendedReceiverId:snap.ball.intendedReceiverId||null,kind:snap.ball.kind||null,lastTouchTeam:snap.ball.lastTouchTeam||null,lastTouchPlayer:snap.ball.lastTouchPlayer||null,strikeStyle:snap.ball.strikeStyle||null,shotTeam:snap.ball.shotTeam||null,shotTargetY:Number.isFinite(snap.ball.shotTargetY)?Number(snap.ball.shotTargetY.toFixed(3)):null,age:Number((snap.ball.age||0).toFixed(3))},
    players:snap.players.map(p=>({id:p.id,name:p.name,team:p.team,role:p.role,slot:p.slot,x:Number(p.x.toFixed(3)),y:Number(p.y.toFixed(3)),vx:Number((p.vx||0).toFixed(3)),vy:Number((p.vy||0).toFixed(3)),tx:Number((p.tx||p.x).toFixed(3)),ty:Number((p.ty||p.y).toFixed(3)),action:p.action||null,tacticalTask:p.tacticalTask||null,markTargetId:p.markTargetId||null,hasBall:!!p.hasBall,bodyAngle:p.bodyAngle,faceTargetAngle:p.faceTargetAngle}))};
}
function pushHistory(s){
  const f=leanFrame(s.m),last=s.history[s.history.length-1];
  if(!last||Math.abs(last.time-f.time)>.025)s.history.push(f);else s.history[s.history.length-1]=f;
  const cutoff=s.m.time-(s.replaySeconds+1.0);while(s.history.length&&s.history[0].time<cutoff)s.history.shift();
  if(s.currentScene&&f.time>=s.currentScene.checkpointAt-0.001&&(s.resultTracker||(s.activeEpisode&&s.currentScene.episodeId===s.activeEpisode.id))){s.currentScene.postFrames.push(deep(f));if(s.currentScene.postFrames.length>420)s.currentScene.postFrames.shift();}
}
function replayFrames(s,seconds=null){const span=seconds==null?s.replaySeconds:seconds,cut=s.m.time-span-.001;return s.history.filter(f=>f.time>=cut).map(deep);}
function causalReplayFrames(s,seconds=null){
  let rows=replayFrames(s,seconds);if(rows.length<3)return rows;
  const last=rows.at(-1).time;
  // A highlight must never open halfway through a celebration whose scoring action is already
  // outside the replay buffer. TT-0.45 could therefore show players celebrating without ever
  // showing the goal that caused it. If the buffer begins in GOAL_CELEBRATION, begin instead at
  // the first causal live-ball/restart frame, provided enough context remains for judgement.
  if(rows[0].phase==='GOAL_CELEBRATION'){
    let firstLive=-1;for(let i=1;i<rows.length;i++){if(rows[i-1].phase==='GOAL_CELEBRATION'&&rows[i].phase!=='GOAL_CELEBRATION'){firstLive=i;break;}}
    if(firstLive>0&&last-rows[firstLive].time>=3.0)rows=rows.slice(firstLive);
  }
  if(rows.length<3)return rows;
  const first=rows[0].time,goals=(s.m.events||[]).filter(e=>e.type==='GOAL'&&e.t>=first-0.25&&e.t<=last+0.01);
  if(!goals.length)return rows;
  const g=goals.at(-1);let cut=-1;
  for(let i=1;i<rows.length;i++){if(rows[i-1].phase==='GOAL_CELEBRATION'&&rows[i].phase!=='GOAL_CELEBRATION'&&rows[i].time>g.t){cut=i;break;}}
  if(cut>0&&last-rows[cut].time>=3.0)rows=rows.slice(cut);
  return rows;
}
function engineOffsideLine(frame,attTeam,includeGK=false){
  const opp=frame.players.filter(p=>p.team!==attTeam&&(includeGK||p.role!=='GK')).map(p=>p.x).sort((a,b)=>a-b);
  if(opp.length<2)return null;return attTeam==='HOME'?opp[opp.length-2]:opp[1];
}
function localX(team,x){return team==='HOME'?x:105-x;}function localY(team,y){return team==='HOME'?y:68-y;}
function trackPassRelease(s){
  const b=s.m.ball;if(b.mode!=='FLIGHT'||b.kind==='SHOT'||!b.intendedReceiverId||!b.lastTouchPlayer||(b.age||0)>.11)return;
  const sig=`${b.lastTouchPlayer}|${b.intendedReceiverId}|${Number(b.originX||b.x).toFixed(2)}|${Number(b.targetX||b.x).toFixed(2)}|${Math.floor(s.m.time*10)}`;
  if(sig===s.lastPassReleaseSig)return;s.lastPassReleaseSig=sig;
  const f=leanFrame(s.m),src=f.players.find(p=>p.id===b.lastTouchPlayer),target=f.players.find(p=>p.id===b.intendedReceiverId);if(!src||!target)return;
  const engineLine=engineOffsideLine(f,src.team,false),referenceLine=engineOffsideLine(f,src.team,true),ballX=b.originX??b.x;
  const engineOffside=src.team==='HOME'?(target.x>52.5&&target.x>ballX+.25&&engineLine!=null&&target.x>engineLine+.25):(target.x<52.5&&target.x<ballX-.25&&engineLine!=null&&target.x<engineLine-.25);
  s.passReleases.push({at:Number(s.m.time.toFixed(2)),sourceId:src.id,sourceName:src.name,targetId:target.id,targetName:target.name,attackingTeam:src.team,ballX:Number(ballX.toFixed(3)),targetX:Number(target.x.toFixed(3)),engineOffsideLine:engineLine==null?null:Number(engineLine.toFixed(3)),referenceSecondLastOpponentLine:referenceLine==null?null:Number(referenceLine.toFixed(3)),engineWouldFlag:!!engineOffside});
  while(s.passReleases.length&&s.passReleases[0].at<s.m.time-30)s.passReleases.shift();
}
function create(seed='step40',opts={}){
  const heroPlayerId=opts.heroPlayerId||'H-ST',mode=normalizeMode(opts.mode||'PLAYER_ALL'),m=E.createMatch(seed,{telemetry:{focusPlayerId:heroPlayerId}});m.protagonistControllerId=heroPlayerId;
  if(A){for(const p of m.players)A.assign(m,p.id,A.baseProfile(60));if(opts.heroAbilityProfile)A.assign(m,heroPlayerId,opts.heroAbilityProfile);}
  if(M&&typeof M.init==='function')M.init(m,opts.managerProfiles||{HOME:'BALANCED',AWAY:'BALANCED'});
  const s={version:VERSION,seed,m,heroPlayerId,mode,pending:null,lastPauseAt:-99,lastPauseControlledSince:-999,lastChoiceAt:-99,lastChoice:null,pauses:[],autoResolved:0,modeThreshold:MODES[mode].threshold,futureOutcomePrecomputed:false,replaySeconds:clamp(Number(opts.replaySeconds)||10,6,12),history:[],passReleases:[],lastPassReleaseSig:null,scenes:[],currentScene:null,resultTracker:null,lastResult:null,choiceHistory:[],forceNextChoice:false,forceFromSceneId:null,activeEpisode:null,episodeSeq:0,appearanceStatus:opts.appearanceStatus==='SUBSTITUTE'?'SUBSTITUTE':'STARTER',performance:{rating:6.5,recklessFailures:0,substitutionPressure:0,managerUsageTrustDelta:0,lastImpact:null,history:[]}};
  pushHistory(s);return s;
}
function hero(s){return B().playerById(s.m,s.heroPlayerId);}
function onBallImportance(f){
  const x=f.localX,shot=f.shot||{},top=f.candidates?.[0],ids=new Set((f.candidates||[]).slice(0,4).map(c=>c.id));let v=.16+clamp((x-35)/70,0,1)*.34;
  if(shot.inBox)v+=.22;if(shot.openWindow)v+=.10;if(shot.oneVOne)v+=.38;if(shot.dGoal<=16)v+=.08;
  if(top?.id==='SHOT')v+=.08;if(top?.id==='TAKE_ON')v+=.05;if(top?.id==='DEEP_CROSS'||top?.id==='CUTBACK')v+=.08;
  // Important play is not synonymous with shooting: a current-state line-breaking pass
  // can be the decisive player judgement, especially for WF/CM roles.
  if(top?.id==='THROUGH_PASS')v+=.10;else if(top?.id==='PROGRESSIVE_PASS')v+=.065;else if(top?.id==='SWITCH_PASS'&&x>=58)v+=.035;
  if(x>=58&&ids.has('THROUGH_PASS'))v+=.035;if(f.role==='CM'&&x>=58&&(ids.has('THROUGH_PASS')||ids.has('PROGRESSIVE_PASS')))v+=.035;
  if(f.pressure<1.15)v+=.04;if(f.pressure>3.2)v+=.04;if(f.role==='GK')v-=.16;
  return clamp(v,0,1);
}
function defendingImportance(f){
  const d=f.distance,attackX=f.opponentAttackX||0,shot=f.threatShot||{};let v=.08+clamp((attackX-48)/58,0,1)*.34;
  if(d<=1.8)v+=.22;else if(d<=3.2)v+=.12;else if(d<=5.0)v+=.04;
  // Routine proximity is not automatically an IMPORTANT highlight. Raise the scene when
  // the ball carrier is actually in a finishing zone/window and the hero can influence it.
  if(shot.inBox)v+=.14;if(shot.openWindow)v+=.10;if(shot.oneVOne)v+=.22;if((shot.dGoal??99)<=16)v+=.07;
  if(attackX>=86)v+=.07;if((f.role==='CB'||f.role==='FB')&&attackX>=78)v+=.025;
  return clamp(v,0,1);
}
function isShotChoice(id){return['SHOT','DIRECT_SHOT','VOLLEY_SHOT','HEADER_SHOT'].includes(id);}function isPassChoice(id){return['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE','SHORT_DISTRIBUTION','LONG_DISTRIBUTION','ONE_TOUCH_PASS','HEADER_PASS'].includes(id);}function family(id){if(isShotChoice(id))return'슈팅';if(['CARRY','TAKE_ON'].includes(id))return'돌파';if(['EARLY_CROSS','DEEP_CROSS','CUTBACK'].includes(id))return'크로스';if(isPassChoice(id))return'패스';if(['TACKLE','DELAY','BLOCK_LANE'].includes(id))return'수비';return'볼 유지';}
function targetDisplay(c){return c?.meta?.targetSlot?`같은 팀 ${c.meta.targetSlot}`:(c.targetName||null)}function labelFor(c){const target=targetDisplay(c),t=target?` → ${target}`:'';const shotLabel=c.id==='SHOT'?(c.meta?.turningRequired?'터닝 슛':c.meta?.longRange?'중거리 슛':'슈팅'):'슈팅';return({SHOT:shotLabel,DIRECT_SHOT:'논스톱 슈팅',VOLLEY_SHOT:'발리 슈팅',HEADER_SHOT:'헤더 슈팅',ONE_TOUCH_PASS:'원터치 패스',HEADER_PASS:'헤더 패스',TRAP_CONTROL:'트래핑 후 컨트롤',CARRY:'공간 전진',TAKE_ON:'1대1 돌파',THROUGH_PASS:'공간 침투 패스',PROGRESSIVE_PASS:'발밑 전진 패스',AVAILABLE_PASS:'전진 패스',EARLY_CROSS:'얼리 크로스',DEEP_CROSS:'크로스',CUTBACK:'컷백',SWITCH_PASS:'전환 패스',SAFE_PASS:'안전한 패스',RECYCLE:'재순환',SHORT_DISTRIBUTION:'짧은 빌드업',LONG_DISTRIBUTION:'전방 롱 배급',HOLD:'볼 지키기',TURN_BACK:'방향 전환'}[c.id]||c.id)+t;}
function riskFor(c,f){if(c.id==='TAKE_ON')return f.pressure<1.8?'높음':'보통';if(['DIRECT_SHOT','VOLLEY_SHOT','HEADER_SHOT'].includes(c.id))return'높음';if(['ONE_TOUCH_PASS','HEADER_PASS'].includes(c.id))return'보통';if(c.id==='TRAP_CONTROL')return f.pressure<1.5?'높음':'낮음';if(c.id==='SHOT')return c.meta?.turningRequired?'높음':c.meta?.longRange?'높음':(f.shot?.blockers??0)>=1?'높음':f.shot?.openWindow?'보통':(f.shot?.dGoal??99)>15?'높음':'보통';if(c.id==='THROUGH_PASS')return'보통';if(c.id==='AVAILABLE_PASS')return c.meta?.contested?'높음':'보통';if(c.id==='CUTBACK'||c.id==='DEEP_CROSS')return'보통';if(c.id==='SAFE_PASS'||c.id==='RECYCLE')return'낮음';if(c.id==='HOLD')return f.pressure<1.5?'높음':'낮음';return'보통';}
function tooltipFor(c,f){
  const shownTarget=targetDisplay(c),target=shownTarget?` (${shownTarget})`:'';let intent='현재 공간을 이용해 공격을 이어갑니다.',related='볼 컨트롤, 판단',gain='공격을 이어갈 수 있음',loss='공 소유를 잃거나 공격 속도가 끊길 수 있음';
  if(c.id==='DIRECT_SHOT'){intent='다가오는 공을 멈추지 않고 현재 접촉 타이밍에서 바로 슈팅합니다.';related='골 결정력, 볼 컨트롤, 반응';gain='수비가 정비되기 전에 바로 마무리할 수 있음';loss='접촉이 어려우면 정확도가 떨어지거나 막힐 수 있음';}
  else if(c.id==='VOLLEY_SHOT'){intent='떠 있는 공을 땅에 내리지 않고 발리로 바로 마무리합니다.';related='골 결정력, 볼 컨트롤, 반응';gain='공이 뜬 상태에서 즉시 슈팅할 수 있음';loss='높이와 타이밍이 맞지 않으면 빗나가거나 막힐 수 있음';}
  else if(c.id==='HEADER_SHOT'){intent='머리 높이로 들어오는 공을 바로 골문 쪽으로 헤더 슈팅합니다.';related='헤딩, 예측, 점프';gain='트래핑 없이 즉시 마무리할 수 있음';loss='공중 경합에서 밀리거나 헤더가 빗나갈 수 있음';}
  else if(c.id==='ONE_TOUCH_PASS'){intent=`다가오는 공을 잡지 않고 동료${target}에게 한 번에 방향을 바꿔 연결합니다.`;related='패스, 볼 컨트롤, 시야';gain='템포를 살려 다음 동료에게 바로 연결할 수 있음';loss='접촉 방향이 어긋나면 패스가 끊길 수 있음';}
  else if(c.id==='HEADER_PASS'){intent=`공중볼을 소유하지 않고 머리로 동료${target}에게 바로 연결합니다.`;related='헤딩, 예측, 시야';gain='공중볼의 흐름을 끊지 않고 다음 플레이로 이어갈 수 있음';loss='경합에서 밀리거나 방향이 빗나갈 수 있음';}
  else if(c.id==='TRAP_CONTROL'){intent='들어오는 공을 먼저 내 소유로 안정시킨 뒤 다음 판단을 준비합니다.';related='볼 컨트롤, 반응, 밸런스';gain='공을 확보하고 다음 선택을 준비할 수 있음';loss='압박이나 어려운 궤적 때문에 첫 터치가 길어질 수 있음';}
  else if(c.id==='SHOT'){if(c.meta?.turningRequired){intent='골문을 등지거나 옆으로 둔 상태에서 몸을 돌려 터닝 슛을 시도합니다.';related='골 결정력, 볼 컨트롤, 민첩성';gain='몸을 돌려 직접 마무리할 수 있음';loss='회전 시간이 필요하고 정면 슈팅보다 정확도와 타이밍이 불리함';}else{intent='현재 보이는 슈팅 길로 직접 마무리를 시도합니다.';related='골 결정력, 슈팅 기술';gain='득점 또는 세컨드볼/세트피스 가능';loss='골키퍼 선방, 수비 블록, 빗나감 가능';}}
  else if(c.id==='TAKE_ON'){intent='앞의 수비수를 직접 제치고 다음 공간으로 진입합니다.';related='드리블, 민첩성, 가속';gain='수비 라인을 깨고 더 좋은 찬스를 만들 수 있음';loss='태클에 막히거나 공이 길어질 수 있음';}
  else if(c.id==='CARRY'){intent='수비수에게 직접 1대1 승부를 걸기보다, 열려 있는 공간으로 공을 직접 운반합니다.';related='드리블, 볼 컨트롤, 가속';gain='빈 공간을 전진하며 다음 선택을 만들 수 있음';loss='공간이 닫히기 전에 판단하지 못하면 압박을 받을 수 있음';}
  else if(c.id==='THROUGH_PASS'){intent=`전방 동료${target}의 발이 아니라, 달려갈 앞 공간으로 공을 먼저 보냅니다.`;related='시야, 패스, 타이밍';gain='수비 라인 뒤 공간에서 달리며 바로 다음 플레이를 만들 수 있음';loss='패스가 너무 길거나 타이밍이 어긋나면 차단되거나 오프사이드가 선언될 수 있음';}
  else if(c.id==='PROGRESSIVE_PASS'){intent=`전방 동료${target}의 현재 발밑/받기 쉬운 지점에 직접 연결해 공격 위치를 앞으로 옮깁니다.`;related='시야, 패스';gain='소유를 유지하면서 전진한 위치에서 다음 플레이를 만들 수 있음';loss='받는 선수가 바로 압박받으면 전진 효과가 줄어들 수 있음';}
  else if(c.id==='AVAILABLE_PASS'){intent=`패스 길 자체는 열려 있는 동료${target}에게 연결합니다.`;related='패스, 시야, 판단';gain='압박받는 동료라도 현재 존재하는 패스 선택을 사용할 수 있음';loss=c.meta?.contested?'받는 순간 수비 압박/경합으로 공을 잃을 위험이 큼':'연결 후 바로 압박을 받을 수 있음';}
  else if(['DEEP_CROSS','EARLY_CROSS','CUTBACK'].includes(c.id)){intent=`박스 안/뒤 공간의 동료${target}에게 전달을 노립니다.`;related='크로스, 시야, 패스';gain='즉시 슈팅 가능한 상황을 만들 수 있음';loss='수비에게 걷히거나 역습 출발점이 될 수 있음';}
  else if(c.id==='SAFE_PASS'){intent=`가까운 지원 동료${target}에게 연결해 압박을 피하고 소유권을 지킵니다.`;related='패스, 시야, 볼 컨트롤';gain='낮은 위험으로 공격을 계속할 수 있음';loss='전진 속도나 직접적인 찬스를 포기할 수 있음';}
  else if(c.id==='RECYCLE'){intent=`동료${target}에게 공을 되돌려 공격 구조를 다시 세웁니다.`;related='패스, 시야, 판단';gain='막힌 공격을 정리하고 새로운 패스길을 만들 수 있음';loss='전진한 위치를 일부 포기하고 상대 수비가 정비할 시간을 줄 수 있음';}
  else if(c.id==='SWITCH_PASS'){intent=`반대편 또는 먼 측면의 동료${target}로 전환해 수비 블록을 이동시킵니다.`;related='패스, 시야, 킥 정확도';gain='반대편 공간을 빠르게 사용할 수 있음';loss='거리 때문에 차단·부정확한 연결 위험이 커질 수 있음';}
  else if(c.id==='SHORT_DISTRIBUTION'){intent=`가까운 수비수/미드필더${target}에게 안전하게 연결해 후방 빌드업을 시작합니다.`;related='GK 패스, 시야, 볼 컨트롤';gain='소유권을 유지하며 안정적으로 공격을 시작할 수 있음';loss='상대 압박에 갇히면 위험 지역에서 공을 잃을 수 있음';}
  else if(c.id==='LONG_DISTRIBUTION'){intent=`전방 공격수${target}를 향해 길게 배급해 한 번에 압박을 넘깁니다.`;related='GK 킥, 롱패스, 판단';gain='상대 압박을 건너뛰고 전방 경합/세컨드볼을 만들 수 있음';loss='정확도가 떨어지면 곧바로 소유권을 내줄 수 있음';}
  else if(c.id==='HOLD'){intent='몸으로 공을 보호하며 동료 움직임을 기다립니다.';related='힘, 밸런스, 볼 컨트롤';gain='지원이 올 시간을 벌 수 있음';loss='압박이 강하면 갇히거나 탈취당할 수 있음';}
  return`의도: ${intent}\n관련 능력: ${related}\n위험: ${riskFor(c,f)}\n성공하면: ${gain}\n실패하면: ${loss}`;
}
function onBallOptions(frame){
  const displayCandidate=c=>{const slot=c.meta?.targetSlot||frame?._frame?.opts?.find(o=>o.p?.id===c.targetId)?.p?.slot||null,meta={...(c.meta||{}),...(slot?{targetSlot:slot}:{})},x={...c,meta};return{...x,targetName:targetDisplay(x)||c.targetName};};
  const ranked=(frame.candidates||[]).filter(c=>c.id!=='TURN_BACK').map(displayCandidate),top=ranked[0]?.score??0,out=[];
  if(frame.role==='GK'){
    const short=ranked.find(c=>['PROGRESSIVE_PASS','SAFE_PASS','SWITCH_PASS','RECYCLE'].includes(c.id)&&c.targetId);
    const prefix=frame.team==='HOME'?'H':'A',longTargetId=`${prefix}-ST`;
    if(short){const c={id:'SHORT_DISTRIBUTION',targetId:short.targetId,targetName:short.targetName||null,meta:short.meta||{}};const row={id:c.id,targetId:c.targetId,targetName:c.targetName,family:'패스',label:`짧은 빌드업${c.targetName?` → ${c.targetName}`:''}`};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}
    {const c={id:'LONG_DISTRIBUTION',targetId:longTargetId,targetName:null,meta:{}};const row={id:c.id,targetId:c.targetId,targetName:null,family:'패스',label:'전방 롱 배급 → ST'};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}
    return out;
  }
  const takeOn=ranked.find(c=>c.id==='TAKE_ON'),lowRiskPairs=new Map();
  for(const c of ranked)if(['SAFE_PASS','RECYCLE'].includes(c.id)&&c.targetId){const a=lowRiskPairs.get(c.targetId)||[];a.push(c.id);lowRiskPairs.set(c.targetId,a);}
  const optionForward=targetId=>frame?._frame?.opts?.find(o=>o.p?.id===targetId)?.forward??0;
  const meaningfulThroughTargets=new Set(ranked.filter(c=>c.id==='THROUGH_PASS'&&(c.meta?.leadForward??0)>=3.5).map(c=>c.targetId));
  const duplicateAllowed=c=>{
    if(c.id==='PROGRESSIVE_PASS'&&meaningfulThroughTargets.has(c.targetId))return false;
    const pair=lowRiskPairs.get(c.targetId)||[];if(pair.length<2)return true;
    const forward=optionForward(c.targetId);
    // Same teammate + nearly same physical pass should not be presented as two fake choices.
    // Back/lateral reset => RECYCLE, forward support => SAFE_PASS.
    return c.id==='SAFE_PASS';
  };
  for(const c of ranked){
    if(out.length>=6)break;
    if(c.id==='HOLD'&&out.length<2)continue;
    if(c.id==='CARRY'&&takeOn&&!c.meta?.clearRunway&&(takeOn.meta?.defenderDistance??99)<=1.75)continue;
    if(!duplicateAllowed(c))continue;
    const isPass=['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE'].includes(c.id);
    if(c.id!=='AVAILABLE_PASS'&&c.score<top-(isPass?3.35:2.25)&&c.id!=='SHOT')continue;
    if(out.some(x=>x.id===c.id&&x.targetId===c.targetId))continue;
    const row={id:c.id,targetId:c.targetId||null,targetName:c.targetName||null,family:family(c.id),label:labelFor(c),meta:c.meta?deep(c.meta):null};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);
  }
  // TT-0.46: an unmarked support player behind/lateral to the carrier must retain a
  // direct-to-feet SAFE_PASS. RECYCLE remains an NPC tactical ranking concept, but it must not
  // hide the user's physically safe receiving option.
  const directSafe=ranked.filter(c=>c.id==='SAFE_PASS'&&c.meta?.directSafe);
  for(const safe of directSafe){
    if(out.some(o=>o.id==='SAFE_PASS'&&o.targetId===safe.targetId))continue;
    if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='CARRY'||o.id==='AVAILABLE_PASS');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const row={id:safe.id,targetId:safe.targetId||null,targetName:safe.targetName||null,family:'패스',label:labelFor(safe),meta:safe.meta?deep(safe.meta):null};row.hint=tooltipFor(safe,frame);row.tooltip=row.hint;out.push(row);}
  }
  // TT-0.48 player-option floor: candidate ranking is allowed to prefer a shot, but it may
  // not erase a physically open support teammate sitting directly behind/lateral to the
  // protagonist. This reads the live pass geometry (not a synthetic target) and exposes at
  // most one extra SAFE_PASS to feet.
  const rawSupport=(frame?._frame?.opts||[]).filter(o=>o?.p&&o.p.role!=='GK'&&o.block===0&&o.d>=3&&o.d<=28&&o.open>=3.0&&o.forward>=-20&&o.forward<=4)
    .sort((a,b)=>(b.open-a.open)+(a.d-b.d)*.035);
  const support=rawSupport.find(o=>!out.some(x=>x.targetId===o.p.id&&x.family==='패스'));
  if(support){
    if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='CARRY'||o.id==='AVAILABLE_PASS');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const c={id:'SAFE_PASS',targetId:support.p.id,targetName:`같은 팀 ${support.p.slot}`,meta:{targetId:support.p.id,targetSlot:support.p.slot,forward:support.forward,d:support.d,receiverPressure:support.open,directSafe:true}};const row={id:c.id,targetId:c.targetId,targetName:c.targetName,family:'패스',label:labelFor(c),meta:deep(c.meta)};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}
  }
  // STEP78: an obviously open lead-space pass is a PLAYER option even when NPC ranking
  // prefers a safer/closer action. The same teammate may legitimately expose both a SAFE_PASS
  // to feet and a THROUGH_PASS into space; those are physically different instructions.
  const openLeadPasses=ranked.filter(c=>c.id==='THROUGH_PASS'&&(c.meta?.runLead||c.meta?.syntheticLead));
  for(const lead of openLeadPasses){
    if(out.some(o=>o.id==='THROUGH_PASS'&&o.targetId===lead.targetId))continue;
    if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='RECYCLE'||o.id==='CARRY');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const row={id:lead.id,targetId:lead.targetId||null,targetName:lead.targetName||null,family:'패스',label:labelFor(lead),meta:lead.meta?deep(lead.meta):null};row.hint=tooltipFor(lead,frame);row.tooltip=row.hint;out.push(row);}
  }
  // If the striker has drawn defenders and a winger is making a real release run,
  // keep the through-pass visible even when a dribble/shot scores higher. This is a
  // physical option created by team movement, not an artificial choice quota.
  const release=ranked.find(c=>c.id==='THROUGH_PASS'&&['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET'].includes(c.meta?.runnerTask));
  if(release&&!out.some(o=>o.id==='THROUGH_PASS'&&o.targetId===release.targetId)){
    if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='CARRY');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const row={id:release.id,targetId:release.targetId||null,targetName:release.targetName||null,family:'패스',label:labelFor(release),meta:release.meta?deep(release.meta):null};row.hint=tooltipFor(release,frame);row.tooltip=row.hint;out.push(row);}
  }
  // PLAYER risk floor: the raw live pass geometry, not NPC ranking, decides whether a risky
  // pass can be shown. One blocker / tight pressure / a marginal offside shoulder remains a
  // player choice; the live engine still decides interception or OFFSIDE after execution.
  const riskyRaw=(frame?._frame?.opts||[]).filter(o=>o?.p&&['ST','WF','CM','FB'].includes(o.p.role)&&o.block<=1&&o.d<=42&&o.forward>0&&o.open>=0.35&&(o.offsideRisk||o.block>0||o.open<1.8)).sort((a,b)=>(Number(b.offsideRisk)-Number(a.offsideRisk))+(b.forward-a.forward)*.03+(Number(b.running)-Number(a.running))*.5).slice(0,2);
  for(const o of riskyRaw){
    if(out.some(x=>x.family==='패스'&&x.targetId===o.p.id))continue;
    if(out.length>=6){const ix=out.findIndex(x=>x.id==='HOLD'||x.id==='RECYCLE'||x.id==='CARRY');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const c={id:'AVAILABLE_PASS',targetId:o.p.id,targetName:`같은 팀 ${o.p.slot}`,meta:{targetId:o.p.id,targetSlot:o.p.slot,forward:o.forward,d:o.d,receiverPressure:o.open,contested:o.open<1.8||o.block>0,laneBlockers:o.block,offsideRisk:!!o.offsideRisk,offsideMargin:Number(o.offsideMargin||0)}};const row={id:c.id,targetId:c.targetId,targetName:c.targetName,family:'패스',label:labelFor(c),meta:deep(c.meta)};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}
  }
  // A real, unblocked pass option must not disappear merely because the NPC score
  // strongly prefers shooting/carrying. Player choice availability != NPC preference.
  if(!out.some(o=>o.family==='패스')){
    const c=ranked.find(x=>['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE'].includes(x.id)&&duplicateAllowed(x)&&x.score>=-0.75);
    if(c&&out.length<6){const row={id:c.id,targetId:c.targetId||null,targetName:c.targetName||null,family:'패스',label:labelFor(c)};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}
  }
  // TT-0.51 1_2: physical availability and NPC preference are separate contracts.
  // The candidate engine always evaluates a live-space CARRY; low NPC score may rank it last,
  // but must not erase it from a protagonist checkpoint while there is actual forward space.
  const physicalCarry=ranked.find(c=>c.id==='CARRY'&&Number(c.meta?.space??frame.space??0)>=0.75);
  if(physicalCarry&&!out.some(o=>o.id==='CARRY')){
    if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='RECYCLE'||o.id==='AVAILABLE_PASS');if(ix>=0)out.splice(ix,1);}
    const row={id:'CARRY',targetId:null,targetName:null,family:'돌파',label:labelFor(physicalCarry),meta:physicalCarry.meta?deep(physicalCarry.meta):null};row.hint=tooltipFor(physicalCarry,frame);row.tooltip=row.hint;out.push(row);
  }
  if(ranked.some(c=>c.id==='HOLD')&&!out.some(c=>c.id==='HOLD')&&out.length<6){const c=ranked.find(x=>x.id==='HOLD'),row={id:'HOLD',targetId:null,targetName:null,family:'볼 유지',label:'볼 지키기'};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}
  return out;
}
function defensiveOptions(frame){
  const mk=(id,label,targetId=null,targetName=null)=>{let intent='',related='',gain='',loss='',risk='보통';if(id==='TACKLE'){intent='즉시 발을 넣어 공을 빼앗습니다.';related='태클, 반응';gain='바로 소유권을 가져올 수 있음';loss='실패하면 돌파 또는 파울 위험';risk='높음';}else if(id==='DELAY'){intent='볼 소유자와 골문 사이를 지키며 진로를 늦춰 동료 복귀 시간을 법니다.';related='수비 위치선정, 반응';gain='상대 공격 속도를 늦출 수 있음';loss='간격을 잘못 잡으면 패스나 돌파 시간을 줄 수 있음';risk='보통';}else{intent=`볼 소유자보다 골문 쪽 위치에서 위협적인 패스 대상${targetName?` (${targetName})`:''}으로 향하는 길을 막습니다.`;related='예측, 수비 위치선정';gain='전진 패스를 차단할 수 있음';loss='볼 소유자에게 직접 압박을 덜 줄 수 있음';risk='보통';}const tip=`의도: ${intent}\n관련 능력: ${related}\n위험: ${risk}\n성공하면: ${gain}\n실패하면: ${loss}`;return{id,family:'수비',label,targetId,targetName,hint:tip,tooltip:tip};};
  const out=[],goalSide=Number(frame.goalSideMargin??0),behind=goalSide<-.55;
  if(frame.role==='GK'){
    if(frame.distance<=1.75)out.push(mk('TACKLE','몸을 던져 먼저 건드리기'));
    if(frame.distance<=11.5)out.push(mk('DELAY','각도 좁히며 버티기'));
    if(frame.threatTarget&&frame.distance<=10.5)out.push(mk('BLOCK_LANE',`컷백/패스 대비 → ${frame.threatTarget.name}`,frame.threatTarget.id,frame.threatTarget.name));
    return out;
  }
  // An attacker who has already been bypassed should not receive centre-back style
  // contain/lane-screen choices from behind. At most a genuinely close back-pressure tackle.
  if(frame.distance<=1.55)out.push(mk('TACKLE',behind?'뒤에서 압박 태클':'태클'));
  if(!behind&&frame.distance<=5.6)out.push(mk('DELAY','지연 수비'));
  if(!behind&&frame.threatTarget)out.push(mk('BLOCK_LANE',`패스길 차단 → ${frame.threatTarget.name}`,frame.threatTarget.id,frame.threatTarget.name));
  return out;
}
function incomingImportance(f){const ids=new Set((f.candidates||[]).map(c=>c.id));let v=.44+clamp((Number(f.localX||0)-52)/70,0,1)*.24;if(ids.has('DIRECT_SHOT')||ids.has('VOLLEY_SHOT'))v+=.25;if(ids.has('HEADER_SHOT'))v+=.30;if((f.contactZ||0)>.8)v+=.05;if((f.pressure||99)<1.7)v+=.05;return clamp(v,0,1);}
function incomingOptions(frame){const out=[];for(const c of frame.candidates||[]){const row={id:c.id,targetId:c.targetId||null,targetName:c.targetName||null,family:family(c.id),label:labelFor(c),meta:c.meta?deep(c.meta):null};row.hint=tooltipFor(c,frame);row.tooltip=row.hint;out.push(row);}return out;}
function inspect(s){const f=C().inspect(s.m,s.heroPlayerId);if(!f)return null;const importance=f.kind==='ON_BALL'?onBallImportance(f):f.kind==='DEFENDING'?defendingImportance(f):f.kind==='INCOMING_BALL'?incomingImportance(f):0,options=f.kind==='ON_BALL'?onBallOptions(f):f.kind==='DEFENDING'?defensiveOptions(f):f.kind==='INCOMING_BALL'?incomingOptions(f):[];return{frame:f,importance:Number(importance.toFixed(3)),options,futureOutcomePrecomputed:false};}
function gapReady(s,importance){const def=modeDef(s),age=s.m.time-s.lastPauseAt;if(['IMPORTANT','DECISIVE_ONLY'].includes(normalizeMode(s.mode))){if(importance>=.985)return age>=20;return age>=def.minGap;}if(importance>=.965)return age>=.8;return age>=def.minGap;}
function episodeKeepsRestart(s,ep){const r=s.m.restart;return!!(r&&ep&&r.team===ep.team&&['CORNER','FREE_KICK','THROW_IN'].includes(r.kind));}
function updateEpisodeState(s){
  const ep=s.activeEpisode;if(!ep){if(!s.pending&&!s.resultTracker&&!s.forceNextChoice&&s.m.protagonistInteractiveEpisode?.active)s.m.protagonistInteractiveEpisode=null;return;}
  if(s.m.completed||s.m.time>(ep.hardUntil||ep.until||0)){s.activeEpisode=null;return;}
  if(s.m.restart&&!episodeKeepsRestart(s,ep)){s.activeEpisode=null;return;}
  if(episodeKeepsRestart(s,ep)){ep.lostAt=null;ep.until=Math.min(ep.hardUntil||s.m.time+28,Math.max(ep.until||0,s.m.time+7.0));return;}
  if(s.m.possession!==ep.team){if(ep.lostAt==null)ep.lostAt=s.m.time;if(s.m.time-ep.lostAt>=0.85)s.activeEpisode=null;}
  else{ep.lostAt=null;const snap=E.snapshot(s.m),bx=ep.team==='HOME'?snap.ball.x:105-snap.ball.x,stillAttack=bx>=57||snap.phase==='FINAL_THIRD'||snap.phase==='CHANCE';if(stillAttack)ep.until=Math.min(ep.hardUntil||s.m.time+28,Math.max(ep.until||0,s.m.time+4.0));}
}
function episodeContinuation(s,f){const ep=s.activeEpisode,h=hero(s);return!!(ep&&h&&['ON_BALL','INCOMING_BALL'].includes(f?.kind)&&s.m.possession===h.team&&ep.team===h.team&&s.m.time<=(ep.hardUntil||ep.until||0)&&s.m.time-(ep.lastChoiceAt||-99)>=0.55);}
function readyForOnBallPause(s,f,importance){
  const h=hero(s);if(!h||f.kind!=='ON_BALL')return false;
  // STEP74: do not freeze a freshly received pass for a user choice while the receiver is
  // still visibly rotating from a stale running/body direction toward the first-touch posture.
  // This delays the checkpoint only; the engine keeps moving and no outcome is precomputed.
  if(h.action==='FIRST_TOUCH_FLOW'&&Number.isFinite(h.faceTargetAngle)&&Number.isFinite(h.bodyAngle)){
    const facingGap=Math.abs(angleDiff(h.bodyAngle,h.faceTargetAngle));
    const controlAge=Math.max(0,s.m.time-(h.controlledSince||s.m.time));
    // TT-0.48 authority chain: after the protagonist re-acquires the ball inside an
    // already-interactive episode, posture settling may delay the visual checkpoint only
    // briefly. It may never hand the episode back to owner AI / Hybrid without a choice.
    const forcedChain=!!s.forceNextChoice||episodeContinuation(s,f);
    if(facingGap>Math.PI*.36&&controlAge<(forcedChain?.90:1.45))return false;
  }
  // STEP74: do not pause on a stale backwards scan posture. A tightly-marked ST in the
  // attacking lane is allowed a real back-to-goal stance, but even that is capped near 105°.
  // This only waits for the live body rotation; it does not decide or precompute the choice.
  if(f.shot&&Number.isFinite(f.shot.bodyAngleDiff)&&['HOLD_BALL','SCAN_WITH_BALL','PROTECT_SCAN','SHIELD_SCAN','PROBE_WITH_BALL','CARRY_SCAN','WIDE_CARRY_SCAN'].includes(h.action)){
    const legitBack=h.role==='ST'&&f.pressure<1.50&&f.localX>=64&&f.localX<=91;
    const maxDiff=legitBack?Math.PI*.49:Math.PI*.46;
    const forcedChain=!!s.forceNextChoice||episodeContinuation(s,f),controlAge=Math.max(0,s.m.time-(h.controlledSince||s.m.time));
    // TT-0.48: a chained/re-acquired protagonist may visually settle for a moment,
    // but posture can never suppress the next user decision until the Episode expires.
    if(f.shot.bodyAngleDiff>maxDiff&&!(forcedChain&&controlAge>=1.15))return false;
  }
  // STEP76: never freeze the user decision while the protagonist is still visibly rotating
  // through a >90-degree stale receiving/carry posture. Waiting here advances only live body
  // orientation; it does not select or resolve any action. A turning shot remains possible in
  // the narrow ~85-90 degree band after the posture settles.
  if(f.shot&&Number.isFinite(f.shot.bodyAngleDiff)&&f.shot.bodyAngleDiff>Math.PI*.49){
    const controlAge=Math.max(0,s.m.time-(h.controlledSince||s.m.time));
    if(!(s.forceNextChoice||episodeContinuation(s,f))||controlAge<1.05)return false;
  }
  if(s.forceNextChoice||episodeContinuation(s,f))return true;
  const critical=!!(f.shot?.oneVOne||(f.shot?.inBox&&f.shot?.openWindow&&(f.shot?.blockers??9)<=1));
  const newControl=Math.abs((h.controlledSince||-1)-s.lastPauseControlledSince)>.001;
  // A newly-controlled 1v1 / open-box chance belongs to the player before NPC ownerThink.
  // Do not allow nextThink/lockTarget to fire an automatic shot and only pause on the rebound.
  if(critical&&newControl&&s.m.time-s.lastPauseAt>=.45)return true;
  if((h.lockTargetUntil||0)>s.m.time+.04)return false;if(h.nextThink>s.m.time+.14)return false;
  if(!newControl&&!gapReady(s,importance))return false;if(newControl&&s.m.time-s.lastPauseAt<.55)return false;if(!newControl&&s.m.time-s.lastPauseAt<1.75)return false;return true;
}
function readyForIncomingPause(s,f,importance){if(f.kind!=='INCOMING_BALL')return false;const eta=Number(f.eta);if(!Number.isFinite(eta)||eta<.07||eta>.82)return false;const mode=normalizeMode(s.mode),age=s.m.time-s.lastPauseAt,chain=episodeContinuation(s,f);if(chain)return age>=.08;if(mode==='IMPORTANT'&&importance<MODES.IMPORTANT.threshold)return false;if(mode==='DECISIVE_ONLY'&&importance<MODES.DECISIVE_ONLY.threshold)return false;if(['FULL_MATCH','PLAYER_ALL','PLAYER_FOCUS'].includes(mode))return age>=.22;if(mode==='IMPORTANT')return age>=18;if(mode==='DECISIVE_ONLY')return age>=24;return false;}
function readyForDefPause(s,f,importance){if(f.kind!=='DEFENDING'||f.distance>5.6)return false;const mode=normalizeMode(s.mode),age=s.m.time-s.lastPauseAt;if(mode==='IMPORTANT'&&age<150)return false;if(mode==='DECISIVE_ONLY'&&age<210)return false;if(!gapReady(s,importance))return false;const h=hero(s);if(!h||h.nextChallengeAt>s.m.time+.25)return false;return true;}
function sanitizeFrameForScene(q){if(!q)return null;const f=q.frame||{};return{kind:f.kind,playerId:f.playerId,team:f.team,role:f.role,slot:f.slot,time:Number((f.time||0).toFixed(3)),localX:Number.isFinite(f.localX)?Number(f.localX.toFixed(3)):null,localY:Number.isFinite(f.localY)?Number(f.localY.toFixed(3)):null,pressure:Number.isFinite(f.pressure)?Number(f.pressure.toFixed(3)):null,space:Number.isFinite(f.space)?Number(f.space.toFixed(3)):null,held:Number.isFinite(f.held)?Number(f.held.toFixed(3)):null,shot:f.shot?deep(f.shot):null,distance:Number.isFinite(f.distance)?Number(f.distance.toFixed(3)):null,opponentId:f.opponentId||null,opponentName:f.opponentName||null,opponentAttackX:Number.isFinite(f.opponentAttackX)?Number(f.opponentAttackX.toFixed(3)):null,goalSideMargin:Number.isFinite(f.goalSideMargin)?Number(f.goalSideMargin.toFixed(3)):null,threatTarget:f.threatTarget?deep(f.threatTarget):null,threatShot:f.threatShot?deep(f.threatShot):null,eta:Number.isFinite(f.eta)?Number(f.eta.toFixed(3)):null,contactX:Number.isFinite(f.contactX)?Number(f.contactX.toFixed(3)):null,contactY:Number.isFinite(f.contactY)?Number(f.contactY.toFixed(3)):null,contactZ:Number.isFinite(f.contactZ)?Number(f.contactZ.toFixed(3)):null,incomingSpeed:Number.isFinite(f.incomingSpeed)?Number(f.incomingSpeed.toFixed(3)):null,flightKind:f.flightKind||null,sourceId:f.sourceId||null,candidates:(f.candidates||[]).map(c=>({id:c.id,targetId:c.targetId||null,targetName:c.targetName||null,score:c.score,meta:c.meta?deep(c.meta):null}))};}
function maybeCheckpoint(s){
  updateEpisodeState(s);const def=modeDef(s);if(s.pending||s.resultTracker||def.presentation==='SKIP'||s.m.completed||s.m.restart)return null;const q=inspect(s);
  // TT-0.51 1_1/1_6: a one-button checkpoint is not a meaningful decision. Do not auto-apply
  // that sole material action. Keep live pressure/movement running while temporarily reserving
  // protagonist owner authority; reopen only when >=2 real options exist or possession ends.
  if(!q||!q.options.length){if(s.m.protagonistDeferredChoice?.playerId===s.heroPlayerId)s.m.protagonistDeferredChoice=null;return null;}
  const f=q.frame;
  if(q.options.length===1){const h=hero(s),started=s.m.protagonistDeferredChoice?.playerId===s.heroPlayerId?s.m.protagonistDeferredChoice.startedAt:s.m.time;s.m.protagonistDeferredChoice={playerId:s.heroPlayerId,kind:f.kind,startedAt:started,lastSeenAt:s.m.time,soleChoiceId:q.options[0].id,futureOutcomePrecomputed:false};if(f.kind==='ON_BALL'&&h&&s.m.ball.mode==='CONTROLLED'&&s.m.ball.ownerId===s.heroPlayerId){s.m.protagonistInteractiveEpisode={active:true,playerId:s.heroPlayerId,episodeId:s.activeEpisode?.id||'DEFERRED-MEANINGFUL-CHOICE',sceneId:null,armedAt:started,deferredMeaningfulChoice:true};h.action='WAIT_MEANINGFUL_CHOICE';h.tacticalTask='WAIT_MEANINGFUL_CHOICE';h.tx=h.x;h.ty=h.y;h.sprint=false;h.nextThink=Math.max(h.nextThink||0,s.m.time+.18);}s.m.stats.singleOptionCheckpointsSuppressed=(s.m.stats.singleOptionCheckpointsSuppressed||0)+1;return null;}
  if(s.m.protagonistDeferredChoice?.playerId===s.heroPlayerId){s.m.protagonistDeferredChoice=null;if(s.m.protagonistInteractiveEpisode?.deferredMeaningfulChoice)s.m.protagonistInteractiveEpisode=null;}
  const episodeChain=episodeContinuation(s,f);if(q.importance<def.threshold&&!episodeChain)return null;if(f.kind==='ON_BALL'&&!readyForOnBallPause(s,f,q.importance))return null;if(f.kind==='INCOMING_BALL'&&!readyForIncomingPause(s,f,q.importance))return null;if(f.kind==='DEFENDING'&&!readyForDefPause(s,f,q.importance))return null;
  const h=hero(s),id=`STEP40-${s.pauses.length+1}`,chained=!!s.forceNextChoice||episodeChain,continuationFromSceneId=s.forceFromSceneId||(episodeChain?s.activeEpisode?.lastSceneId:null)||null,pre=causalReplayFrames(s,s.replaySeconds),episodeId=chained?(s.activeEpisode?.id||continuationFromSceneId||id):(s.activeEpisode?.id||id);if(h?.pendingShot){h.pendingShot=null;h.faceTargetAngle=null;h.lockTargetUntil=0;if(h.action==='TURNING_SHOT_PREP'){h.action='HOLD_BALL';h.tacticalTask='HOLD_BALL';}}s.m.protagonistInteractiveEpisode={active:true,playerId:s.heroPlayerId,episodeId,sceneId:id,armedAt:s.m.time};s.pending={id,episodeId,at:Number(s.m.time.toFixed(2)),minute:Number((s.m.time/60).toFixed(2)),kind:f.kind,importance:q.importance,options:q.options,state:{phase:E.snapshot(s.m).phase,score:{...s.m.score},ball:{mode:s.m.ball.mode,ownerId:s.m.ball.ownerId},player:{id:h.id,role:h.role,x:Number(h.x.toFixed(2)),y:Number(h.y.toFixed(2))}},futureOutcomePrecomputed:false,replayFrames:pre,chained,continuationFromSceneId};s.forceNextChoice=false;s.forceFromSceneId=null;
  s.lastPauseAt=s.m.time;s.lastPauseControlledSince=h?.controlledSince??-999;s.pauses.push({id,at:s.pending.at,minute:s.pending.minute,kind:s.pending.kind,importance:s.pending.importance,options:s.pending.options.map(x=>({...x})),futureOutcomePrecomputed:false});
  s.currentScene={schemaVersion:'FLR_DEBUG_SCENE_0.1',controllerVersion:VERSION,seed:s.seed,mode:normalizeMode(s.mode),heroPlayerId:s.heroPlayerId,sceneId:id,episodeId,continuationFromSceneId,checkpointAt:s.pending.at,replayWindowSeconds:s.replaySeconds,checkpointState:deep(s.pending.state),checkpointInspect:sanitizeFrameForScene(q),availableOptions:s.pending.options.map(deep),preFrames:pre,preEvents:s.m.events.filter(e=>e.t>=(pre[0]?.time??(s.m.time-s.replaySeconds))-.001).map(deep),passReleases:s.passReleases.filter(x=>x.at>=s.m.time-s.replaySeconds-.001).map(deep),choice:null,postFrames:[],postEvents:[],result:null};
  s.scenes.push(s.currentScene);if(s.scenes.length>60)s.scenes.shift();return s.pending;
}
function eventKey(e){return`${Number(e.t).toFixed(3)}|${e.type}|${e.text}`;}
function beginResultTracker(s,opt,res,beforeKeys){
  const familyName=opt.family||family(opt.id),now=s.m.time,intentUntil=Number.isFinite(res?.intentUntil)?Number(res.intentUntil):null;
  let minimumUntil=now+0.85,deadline=now+5.2;
  if(['CARRY','HOLD'].includes(opt.id)){minimumUntil=intentUntil||now+1.0;deadline=minimumUntil+0.45;}
  else if(opt.id==='TAKE_ON'){minimumUntil=intentUntil||now+1.05;deadline=now+3.8;}
  else if(isShotChoice(opt.id)){minimumUntil=now+0.8;deadline=now+10.0;}
  else if(['TACKLE','DELAY','BLOCK_LANE'].includes(opt.id)){minimumUntil=now+0.8;deadline=now+4.5;}
  else if(familyName==='패스'||familyName==='크로스'){minimumUntil=now+0.9;deadline=now+8.0;}
  s.resultTracker={sceneId:s.currentScene?.sceneId||null,startedAt:Number(now.toFixed(3)),minimumUntil,deadline,choiceId:opt.id,targetId:opt.targetId||null,targetName:opt.targetName||null,label:opt.label,family:familyName,action:res.action?deep(res.action):null,intentUntil,seen:new Set(beforeKeys||[]),newEvents:[],startScore:{...s.m.score},startPossession:s.m.possession,startOwnerId:s.m.ball.ownerId||null,terminalEvent:null,terminalAt:null,possessionChangedAt:null,done:false};
  if(s.currentScene){s.currentScene.choice={at:Number(now.toFixed(3)),id:opt.id,label:opt.label,targetId:opt.targetId||null,targetName:opt.targetName||null,family:familyName,applied:deep(res)};s.currentScene.postFrames=[];}
}
function shotMissDirection(s,scene){
  const frames=(scene?.postFrames||[]).filter(f=>f.ball?.kind==='SHOT');if(!frames.length)return null;const f=frames[frames.length-1],team=f.ball.shotTeam||scene?.checkpointInspect?.team||hero(s)?.team||'HOME',ly=localY(team,f.ball.y),y1=E.FIELD?.GOAL_Y1??30.34,y2=E.FIELD?.GOAL_Y2??37.66;if(ly<y1)return'골문 왼쪽 바깥';if(ly>y2)return'골문 오른쪽 바깥';return'골문 바깥';
}
function shotStyle(scene){const f=(scene?.postFrames||[]).find(x=>x.ball?.kind==='SHOT'&&x.ball?.strikeStyle);const st=f?.ball?.strikeStyle;return st==='TURNING'?'터닝 슛':st==='CURLED'?'감아차기':st==='CHIP'?'칩슛':st==='PLACED'?'정교한 슈팅':'슈팅';}
function eventFlowText(tr,limit=4){
  const rows=(tr.newEvents||[]).filter(e=>e.type!=='USER_CHOICE').slice(0,limit).map(e=>e.text).filter(Boolean);
  return rows.join(' → ');
}
function protagonistMovement(scene){
  const a=scene?.checkpointState?.player,last=scene?.postFrames?.[scene.postFrames.length-1],b=last?.players?.find(p=>p.id===scene?.heroPlayerId);
  if(!a||!b)return null;return Number(Math.hypot(b.x-a.x,b.y-a.y).toFixed(1));
}
function resultNarrative(s,tr,terminal=null){
  const scene=s.currentScene,choice=tr.choiceId,ev=terminal||tr.terminalEvent||tr.newEvents[tr.newEvents.length-1]||null,style=isShotChoice(choice)?(choice==='HEADER_SHOT'?'헤더 슈팅':choice==='VOLLEY_SHOT'?'발리 슈팅':choice==='DIRECT_SHOT'?'논스톱 슈팅':shotStyle(scene)):null,flow=eventFlowText(tr);
  if(isShotChoice(choice)){
    if(ev?.type==='GOAL')return{code:'GOAL',headline:`${style} → 득점`,detail:`${ev.text||flow||`${style}이 골망을 흔들었습니다.`} 세리머니와 킥오프 준비까지 실제 장면으로 이어졌습니다.`,terminalEvent:deep(ev)};
    if(['SAVE','CHIP_SAVE'].includes(ev?.type))return{code:'SAVED',headline:`${style} → 골키퍼 선방`,detail:`${ev.text||'골키퍼가 슈팅을 막았습니다.'} 이후 공의 소유가 정리되는 장면까지 이어졌습니다.`,terminalEvent:deep(ev)};
    if(ev?.type==='CHIP_PARRY')return{code:'PARRIED',headline:`${style} → 골키퍼가 쳐냄`,detail:`${ev.text||'골키퍼가 손끝으로 공을 쳐냈습니다.'} 이후 세컨드볼 상황까지 이어졌습니다.`,terminalEvent:deep(ev)};
    if(ev?.type==='BLOCK')return{code:'BLOCKED',headline:`${style} → 수비 블록`,detail:`${ev.text||'수비수에게 슈팅이 막혔습니다.'} 이후 튄 공의 다음 소유 상황까지 이어졌습니다.`,terminalEvent:deep(ev)};
    if(ev?.type==='CORNER')return{code:'CORNER',headline:`${style} → 굴절 후 코너킥`,detail:`${ev.text||'수비에 맞고 나가 코너킥이 됐습니다.'} 코너킥 준비 위치까지 이어졌습니다.`,terminalEvent:deep(ev)};
    if(ev?.type==='GOAL_KICK'){const side=shotMissDirection(s,scene);return{code:'MISS',headline:`${style} → 빗나감`,detail:`${style}이 ${side||'골문 바깥'}으로 벗어났고 골킥 준비 장면까지 이어졌습니다.`,terminalEvent:deep(ev)};}
    return{code:'SHOT_CONTINUE',headline:`${style} 결과`,detail:flow||'슈팅 이후 다음 경기 상태까지 이어졌습니다.',terminalEvent:ev?deep(ev):null};
  }
  if(choice==='TAKE_ON'){
    const x=tr.newEvents.find(e=>['DRIBBLE_BEAT','TAKE_ON_TACKLED','TAKE_ON_LOOSE'].includes(e.type));
    if(x?.type==='DRIBBLE_BEAT')return{code:'BEAT',headline:'1대1 돌파 성공',detail:flow||`${x.text} 이후 다음 판단 상태까지 이어졌습니다.`,terminalEvent:deep(x)};
    if(x?.type==='TAKE_ON_TACKLED')return{code:'TACKLED',headline:'1대1 돌파 실패',detail:flow||`${x.text} 이후 상대의 다음 플레이까지 이어졌습니다.`,terminalEvent:deep(x)};
    if(x?.type==='TAKE_ON_LOOSE')return{code:'LOOSE',headline:'1대1 돌파 후 루즈볼',detail:flow||`${x.text} 이후 루즈볼 경합까지 이어졌습니다.`,terminalEvent:deep(x)};
  }
  if(['TACKLE','DELAY','BLOCK_LANE'].includes(choice)){
    const x=tr.newEvents.find(e=>['TACKLE','FOUL','LOOSE','INTERCEPT'].includes(e.type));
    if(x)return{code:x.type,headline:`${tr.label} 결과`,detail:flow||x.text,terminalEvent:deep(x)};
  }
  if(['THROUGH_PASS','PROGRESSIVE_PASS','AVAILABLE_PASS','SWITCH_PASS','SAFE_PASS','RECYCLE','EARLY_CROSS','DEEP_CROSS','CUTBACK'].includes(choice)){
    const bad=tr.newEvents.find(e=>['INTERCEPT','PASS_MISCONTROL','PASS_BOBBLE','OFFSIDE','PASS_OUT','THROW_IN'].includes(e.type));
    if(bad){const miss=bad.type==='PASS_OUT';return{code:bad.type,headline:miss?`${tr.label} → 패스 미스`:`${tr.label} 결과`,detail:flow||bad.text,terminalEvent:deep(bad)};}
    const last=scene?.postFrames?.[scene.postFrames.length-1],target=tr.targetId&&last?.players?.find(p=>p.id===tr.targetId),owner=last?.ball?.ownerId;
    if(target&&owner===target.id)return{code:'CONNECTED',headline:`${tr.label} → 연결`,detail:flow||`패스가 ${target.name}에게 연결되어 공격이 이어졌습니다.`,terminalEvent:null};
    if(last?.possession===scene?.checkpointInspect?.team)return{code:'POSSESSION_KEPT',headline:`${tr.label} → 공격 지속`,detail:flow||'선택한 패스 이후 같은 팀의 다음 플레이까지 이어졌습니다.',terminalEvent:null};
    return{code:'POSSESSION_LOST',headline:`${tr.label} → 소유권 변화`,detail:flow||'선택한 패스 이후 상대 팀의 다음 플레이까지 이어졌습니다.',terminalEvent:null};
  }
  const last=scene?.postFrames?.[scene.postFrames.length-1],same=last?.possession===scene?.checkpointInspect?.team;
  if(choice==='CARRY'){const moved=protagonistMovement(scene),base=moved!=null?`공을 약 ${moved.toFixed(1)}m 운반했습니다.`:'전진 동작을 실행했습니다.';return{code:same?'POSSESSION_KEPT':'POSSESSION_LOST',headline:'전진 결과',detail:flow||(same?`${base} 공을 유지한 채 다음 판단 상태에 도달했습니다.`:`${base} 이후 소유권을 잃었고 상대의 다음 플레이까지 이어졌습니다.`),terminalEvent:ev?deep(ev):null};}
  if(choice==='HOLD'){const held=Math.max(0,(scene?.postFrames?.[scene.postFrames.length-1]?.time||tr.startedAt)-tr.startedAt).toFixed(1);return{code:same?'POSSESSION_KEPT':'POSSESSION_LOST',headline:'볼 지키기 결과',detail:flow||(same?`약 ${held}초 동안 공을 보호하며 동료 움직임을 기다렸고, 공을 유지한 채 다음 판단 상태에 도달했습니다.`:`볼을 지키는 과정에서 소유권을 잃었고 상대의 다음 플레이까지 이어졌습니다.`),terminalEvent:ev?deep(ev):null};}
  return{code:same?'POSSESSION_KEPT':'POSSESSION_LOST',headline:`${tr.label} 결과`,detail:flow||(same?'선택 이후 공을 유지하며 다음 상태로 이어졌습니다.':'선택 이후 상대에게 소유권이 넘어간 뒤 다음 플레이까지 이어졌습니다.'),terminalEvent:ev?deep(ev):null};
}

function applyPerformanceImpact(s,tr,result){
  const sc=s.currentScene,ci=sc?.checkpointInspect||{},raw=ci.candidates||[],chosen=raw.find(c=>c.id===tr.choiceId),safeIds=new Set(['SAFE_PASS','RECYCLE','PROGRESSIVE_PASS','SWITCH_PASS']),safe=raw.filter(c=>safeIds.has(c.id)).sort((a,b)=>(b.score??-99)-(a.score??-99))[0]||null;
  const risky=['SHOT','TAKE_ON','CARRY'].includes(tr.choiceId),failed=new Set(['MISS','SAVED','BLOCKED','TACKLED','LOOSE','POSSESSION_LOST']).has(result.code);
  const shotGood=tr.choiceId==='SHOT'&&(ci.shot?.oneVOne||ci.shot?.openWindow||(ci.shot?.blockers??9)===0&&(ci.shot?.dGoal??99)<=14.5);
  const materiallyWorse=!!safe&&!!chosen&&(safe.score??-99)>(chosen.score??-99)+0.65;
  const reckless=risky&&failed&&!shotGood&&materiallyWorse;
  let ratingDelta=0,substitutionPressureDelta=0,managerUsageTrustDelta=0,reason='NO_PENALTY';
  if(reckless){
    s.performance.recklessFailures=(s.performance.recklessFailures||0)+1;
    const repeat=Math.min(3,s.performance.recklessFailures-1);
    ratingDelta=-(0.14+repeat*0.05);
    if(s.appearanceStatus==='STARTER'){substitutionPressureDelta=0.15+repeat*0.05;managerUsageTrustDelta=-(0.025+repeat*0.015);reason='RISKY_FAILURE_STARTER';}
    else{managerUsageTrustDelta=-(0.065+repeat*0.025);reason='RISKY_FAILURE_SUBSTITUTE';}
  }else if(['GOAL','BEAT','CONNECTED'].includes(result.code)&&risky){
    ratingDelta=0.05;reason='RISKY_ACTION_SUCCEEDED';
  }
  s.performance.rating=clamp((s.performance.rating||6.5)+ratingDelta,1,10);
  s.performance.substitutionPressure=clamp((s.performance.substitutionPressure||0)+substitutionPressureDelta,0,1);
  s.performance.managerUsageTrustDelta=clamp((s.performance.managerUsageTrustDelta||0)+managerUsageTrustDelta,-1,1);
  const impact={at:Number(s.m.time.toFixed(2)),appearanceStatus:s.appearanceStatus,choiceId:tr.choiceId,resultCode:result.code,reckless,saferOption:safe?{id:safe.id,targetId:safe.targetId||null,targetName:safe.targetName||null,score:safe.score}:null,chosenScore:chosen?.score??null,ratingDelta:Number(ratingDelta.toFixed(3)),rating:Number(s.performance.rating.toFixed(3)),substitutionPressureDelta:Number(substitutionPressureDelta.toFixed(3)),substitutionPressure:Number(s.performance.substitutionPressure.toFixed(3)),managerUsageTrustDelta:Number(managerUsageTrustDelta.toFixed(3)),managerUsageTrustTotal:Number(s.performance.managerUsageTrustDelta.toFixed(3)),reason};
  s.performance.lastImpact=impact;s.performance.history.push(deep(impact));if(s.performance.history.length>60)s.performance.history.shift();return impact;
}
function finalizeResult(s,terminal=null){const tr=s.resultTracker;if(!tr||tr.done)return null;tr.done=true;const r={sceneId:tr.sceneId,at:Number(s.m.time.toFixed(2)),choiceId:tr.choiceId,label:tr.label,targetId:tr.targetId||null,targetName:tr.targetName||null,family:tr.family,selectedChoice:{id:tr.choiceId,label:tr.label,targetId:tr.targetId||null,targetName:tr.targetName||null},...resultNarrative(s,tr,terminal),events:tr.newEvents.map(deep),score:{...s.m.score},possession:s.m.possession};r.performanceImpact=applyPerformanceImpact(s,tr,r);s.lastResult=r;s.choiceHistory.push(deep(r));if(s.choiceHistory.length>60)s.choiceHistory.shift();if(s.currentScene){s.currentScene.postEvents=tr.newEvents.map(deep);s.currentScene.result=deep(r);}const h=hero(s),heroOwn=s.m.ball.mode==='CONTROLLED'&&s.m.ball.ownerId===s.heroPlayerId,ownRestart=!!h&&s.m.restart&&s.m.restart.team===h.team&&['CORNER','FREE_KICK','THROW_IN'].includes(s.m.restart.kind),sameTeam=!!h&&(s.m.possession===h.team||ownRestart);
  if(sameTeam){const ep=s.activeEpisode||{id:`EP-${++s.episodeSeq}`,team:h.team,startedAt:tr.startedAt,hardUntil:tr.startedAt+20};ep.team=h.team;ep.lastSceneId=tr.sceneId;ep.lastChoiceAt=tr.startedAt;ep.hardUntil=ep.hardUntil||ep.startedAt+20;ep.until=Math.min(ep.hardUntil,Math.max(ep.until||0,s.m.time+(ownRestart?8.0:6.5)));ep.lostAt=null;s.activeEpisode=ep;if(s.currentScene)s.currentScene.episodeId=ep.id;}
  else if(s.activeEpisode)s.activeEpisode=null;
  if(s.m.userChoiceControl?.playerId===s.heroPlayerId)s.m.userChoiceControl=null;if(heroOwn){s.forceNextChoice=true;s.forceFromSceneId=tr.sceneId;if(h)h.nextThink=Math.max(h.nextThink||0,s.m.time);}s.resultTracker=null;return r;}
function updateResultTracker(s){
  const tr=s.resultTracker;if(!tr)return null;
  for(const e of s.m.events){const k=eventKey(e);if(tr.seen.has(k))continue;tr.seen.add(k);if(e.type==='USER_CHOICE')continue;if(e.t+0.001<tr.startedAt)continue;tr.newEvents.push(deep(e));}
  const terminals=isShotChoice(tr.choiceId)?['GOAL','SAVE','CHIP_SAVE','CHIP_PARRY','BLOCK','CORNER','GOAL_KICK']:tr.choiceId==='TAKE_ON'?['DRIBBLE_BEAT','TAKE_ON_TACKLED','TAKE_ON_LOOSE']:tr.choiceId==='TACKLE'?['TACKLE','FOUL','LOOSE']:[];
  if(!tr.terminalEvent){
    const terminal=tr.newEvents.find(e=>terminals.includes(e.type));
    if(terminal){
      tr.terminalEvent=deep(terminal);
      tr.terminalAt=Number(terminal.t);
      if(tr.choiceId==='TAKE_ON'&&terminal.type==='DRIBBLE_BEAT'){
        const h=hero(s);
        if(h&&s.m.ball.mode==='CONTROLLED'&&s.m.ball.ownerId===s.heroPlayerId){
          const until=Number(terminal.t)+0.95;
          s.m.userChoiceControl={playerId:s.heroPlayerId,choice:'TAKE_ON_CHAIN',mode:'POST_TAKE_ON',startedAt:Number(terminal.t),until,controllerOwned:true,futureOutcomePrecomputed:false};
          h.nextThink=Math.max(h.nextThink||0,until);
          h.lockTargetUntil=Math.max(h.lockTargetUntil||0,until);
        }
      }
      if(tr.choiceId==='TACKLE'&&terminal.type==='TACKLE'){
        const h=hero(s);
        if(h&&s.m.ball.mode==='CONTROLLED'&&s.m.ball.ownerId===s.heroPlayerId){
          const until=Number(terminal.t)+0.72,ad=h.team==='HOME'?1:-1;
          s.m.userChoiceControl={playerId:s.heroPlayerId,choice:'TACKLE_CHAIN',mode:'POST_TACKLE_SETTLE',startedAt:Number(terminal.t),until,controllerOwned:true,futureOutcomePrecomputed:false};
          h.action='POST_TACKLE_SETTLE';h.tacticalTask='POST_TACKLE_SETTLE';
          h.tx=clamp(h.x+ad*.75,1,104);h.ty=clamp(h.y+(h.vy||0)*.10,2,66);
          h.nextThink=Math.max(h.nextThink||0,until);h.lockTargetUntil=Math.max(h.lockTargetUntil||0,until);
        }
      }
    }
  }
  // A shot block can physically continue over the goal-line into a corner. In that case the
  // later dead-ball outcome is the natural terminal state, not the instant of impact.
  if(isShotChoice(tr.choiceId)&&tr.terminalEvent?.type==='BLOCK'){const later=tr.newEvents.find(e=>e.t>=(tr.terminalAt||0)&&['CORNER','GOAL_KICK','GOAL'].includes(e.type));if(later){tr.terminalEvent=deep(later);tr.terminalAt=Number(later.t);}}
  if(s.m.possession!==tr.startPossession&&tr.possessionChangedAt==null){tr.possessionChangedAt=s.m.time;if(s.m.userChoiceControl?.playerId===s.heroPlayerId&&s.m.userChoiceControl?.mode!=='POST_TACKLE_SETTLE')s.m.userChoiceControl=null;}
  const now=s.m.time,terminal=tr.terminalEvent,tt=terminal?.type||null,age=terminal?now-Number(tr.terminalAt||now):0,ballSettled=s.m.ball.mode==='CONTROLLED'||!!s.m.restart||s.m.ball.mode==='DEAD',heroOwnNow=s.m.ball.mode==='CONTROLLED'&&s.m.ball.ownerId===s.heroPlayerId;
  let ready=false;
  if(tt==='GOAL')ready=(s.m.phase!=='GOAL_CELEBRATION'&&(!s.m.restart||s.m.restart.kind!=='KICKOFF'))||age>=6.2;
  else if(['GOAL_KICK','CORNER','THROW_IN','OFFSIDE','FOUL'].includes(tt)){
    const ratio=Number(s.m.restart?.setup?.readyRatio||0),br=s.m.restart?.ballReturn,ballReady=!br||br.phase==='SETUP_READY';
    if(tt==='GOAL_KICK'||tt==='CORNER')ready=(now>=tr.minimumUntil)&&((ballReady&&ratio>=0.52)||!s.m.restart||age>=6.40);
    else ready=(now>=tr.minimumUntil)&&(ratio>=0.55||age>=4.60||!s.m.restart);
  }else if(['BLOCK','SAVE','CHIP_SAVE','CHIP_PARRY'].includes(tt)){
    const follow=tr.newEvents.find(e=>e.t>(tr.terminalAt||0)+0.30&&['PASS','SHOT','TAKE_ON','CLEARANCE'].includes(e.type));
    // If the direct rebound returns to the protagonist, hand control back BEFORE owner AI
    // gets another simulation action. This is the linked-decision contract, not a highlight filter.
    ready=heroOwnNow&&age>=0.08?true:ballSettled&&((follow&&now-follow.t>=0.20)||age>=2.10);
  }else if(['TAKE_ON_TACKLED','TAKE_ON_LOOSE','TACKLE','LOOSE','INTERCEPT'].includes(tt)){
    const follow=tr.newEvents.find(e=>e.t>(tr.terminalAt||0)+0.30&&['PASS','SHOT','TAKE_ON','CLEARANCE'].includes(e.type));
    ready=(heroOwnNow&&age>=(tr.choiceId==='TACKLE'&&tt==='TACKLE'?0.72:0.16))?true:ballSettled&&((follow&&now-follow.t>=0.20)||age>=2.10);
  }
  else if(tr.choiceId==='TAKE_ON'&&tt==='DRIBBLE_BEAT'){const settledHero=s.m.ball.mode==='CONTROLLED'&&s.m.ball.ownerId===s.heroPlayerId;ready=settledHero&&now>=Math.max(tr.minimumUntil,(tr.terminalAt||now)+0.88);if(!settledHero&&now>=(tr.terminalAt||now)+2.10&&ballSettled)ready=true;}
  else if(['CARRY','HOLD'].includes(tr.choiceId)){
    if(tr.possessionChangedAt!=null)ready=now-tr.possessionChangedAt>=1.20&&ballSettled;
    else if(tr.choiceId==='CARRY'&&heroOwnNow){const q=inspect(s),f=q?.frame||{},moved=protagonistMovement(s.currentScene)||0,critical=!!(f.shot?.oneVOne||(f.shot?.inBox&&f.shot?.openWindow&&(f.shot?.blockers??9)<=1));ready=(critical&&now>=tr.startedAt+1.35)||(moved>=7.5&&now>=tr.startedAt+2.90)||now>=tr.minimumUntil;}
    else ready=now>=tr.minimumUntil;
  }else if(tr.family==='패스'||tr.family==='크로스'){
    const heroOwn=s.m.ball.mode==='CONTROLLED'&&s.m.ball.ownerId===s.heroPlayerId;
    // Show one coherent attacking tempo instead of ending as soon as the first receiver settles.
    // If the sequence returns to the protagonist, hand the next decision back immediately.
    if(heroOwn&&now>=tr.startedAt+0.75)ready=true;
    else{
      const downstreamShot=[...tr.newEvents].reverse().find(e=>e.t>=tr.startedAt+0.35&&e.type==='SHOT');
      const shotOutcome=downstreamShot&&tr.newEvents.find(e=>e.t>=downstreamShot.t&&['GOAL','SAVE','CHIP_SAVE','CHIP_PARRY','BLOCK','CORNER','GOAL_KICK'].includes(e.type));
      if(shotOutcome){
        const sa=now-shotOutcome.t;
        if(['CORNER','GOAL_KICK'].includes(shotOutcome.type)){
          const ratio=Number(s.m.restart?.setup?.readyRatio||0),br=s.m.restart?.ballReturn,ballReady=!br||br.phase==='SETUP_READY';
          ready=(ballReady&&ratio>=0.52)||!s.m.restart||sa>=6.4;
        }else if(shotOutcome.type==='GOAL')ready=(s.m.phase!=='GOAL_CELEBRATION'&&(!s.m.restart||s.m.restart.kind!=='KICKOFF'))||sa>=6.2;
        else if(['SAVE','CHIP_SAVE','CHIP_PARRY','BLOCK'].includes(shotOutcome.type)){
          const follow=tr.newEvents.find(e=>e.t>shotOutcome.t+.30&&['PASS','SHOT','TAKE_ON','CLEARANCE'].includes(e.type));
          ready=ballSettled&&((follow&&now-follow.t>=.20)||sa>=2.1);
        }
      }else if(tr.possessionChangedAt!=null){
        const oppFollow=tr.newEvents.find(e=>e.t>=tr.possessionChangedAt+.20&&['PASS','SHOT','TAKE_ON','CLEARANCE'].includes(e.type));
        ready=ballSettled&&((oppFollow&&now-oppFollow.t>=.20)||now-tr.possessionChangedAt>=1.25);
      }else ready=now>=tr.startedAt+4.4&&ballSettled;
    }
  }else if(['DELAY','BLOCK_LANE'].includes(tr.choiceId))ready=now>=tr.startedAt+2.2||tr.possessionChangedAt!=null&&now-tr.possessionChangedAt>=1.1;
  if(ready||now>=tr.deadline||s.m.completed)return finalizeResult(s,terminal);
  return null;
}
function applyChoice(s,choiceId,targetId=null,inputMeta={}){
  if(!s.pending)return{ok:false,reason:'NO_PENDING_CHOICE'};
  const inputSource=inputMeta?.source||'DIRECT_API';
  // STEP78 canonical ownership proof: an in-pitch user action is accepted only after a
  // separate, explicit action-button gesture. Merely selecting/focusing a player or opening
  // the menu can never be interpreted as SHOT/PASS/CARRY.
  if(inputSource==='USER_UI_CLICK_IN_PITCH'&&inputMeta?.confirmedAction!==true)return{ok:false,reason:'IN_PITCH_ACTION_NOT_EXPLICITLY_CONFIRMED'};
  const same=s.pending.options.filter(o=>o.id===choiceId);let opt=null;
  if(targetId!=null){opt=same.find(o=>o.targetId===targetId)||null;if(!opt)return{ok:false,reason:'CHOICE_TARGET_NOT_AVAILABLE',requestedTargetId:targetId};}
  else{if(same.length>1&&same.some(o=>o.targetId!=null))return{ok:false,reason:'AMBIGUOUS_CHOICE_TARGET'};opt=same[0]||null;}
  if(!opt)return{ok:false,reason:'CHOICE_NOT_AVAILABLE'};
  const before=(s.m.events||[]).map(eventKey);let res;
  if(s.pending.kind==='ON_BALL'&&['SHORT_DISTRIBUTION','LONG_DISTRIBUTION'].includes(opt.id))res=R38.apply(s.m,{playerId:s.heroPlayerId,choice:opt.id,targetId:opt.targetId||null});
  else if(['ON_BALL','INCOMING_BALL'].includes(s.pending.kind))res=C().applyCandidate(s.m,s.heroPlayerId,opt.id,opt.targetId||null,inputSource,opt);
  else res=R38.apply(s.m,{playerId:s.heroPlayerId,choice:opt.id,targetId:opt.targetId||null});
  if(res.ok){
    res.inputSource=inputSource;res.requestedTargetId=opt.targetId||null;
    if(opt.targetId!=null&&(res.targetId||null)!==opt.targetId)return{ok:false,reason:'CHOICE_TARGET_RESOLUTION_MISMATCH',requestedTargetId:opt.targetId,resolvedTargetId:res.targetId||null};
    s.lastChoiceAt=s.m.time;s.lastChoice={at:Number(s.m.time.toFixed(2)),choice:opt.id,label:opt.label,targetId:opt.targetId||null,targetName:opt.targetName||null,family:opt.family||family(opt.id),kind:s.pending.kind,inputSource,futureOutcomePrecomputed:false};
    const h=hero(s),pendingEpisode=s.pending?.episodeId||null;if(h){let ep=s.activeEpisode;if(!ep||ep.team!==h.team||s.m.time>(ep.hardUntil||ep.until||0))ep={id:pendingEpisode||`EP-${++s.episodeSeq}`,team:h.team,startedAt:s.m.time,hardUntil:s.m.time+20};ep.id=pendingEpisode||ep.id;ep.hardUntil=ep.hardUntil||ep.startedAt+20;ep.lastSceneId=s.currentScene?.sceneId||ep.lastSceneId;ep.lastChoiceAt=s.m.time;ep.until=Math.min(ep.hardUntil,s.m.time+7.0);ep.lostAt=null;s.activeEpisode=ep;if(s.currentScene)s.currentScene.episodeId=ep.id;}
    if(s.currentScene)s.currentScene.choicePendingSnapshot=deep(s.pending);s.pending=null;beginResultTracker(s,opt,res,before);updateResultTracker(s);
  }
  return res;
}

function step(s,dt=.10){if(s.pending)return s.m;
  // Re-evaluate the result boundary before advancing the engine. A rebound/one-two may have
  // returned control to the protagonist on the previous physics frame; chained choice must win
  // that next decision boundary over normal owner AI.
  if(s.resultTracker){updateResultTracker(s);if(!s.resultTracker){maybeCheckpoint(s);if(s.pending)return s.m;}}
  maybeCheckpoint(s);if(s.pending)return s.m;if(M&&typeof M.preStep==='function')M.preStep(s.m);E.step(s.m,dt);if(R38&&typeof R38.resolveCarryChecks==='function')R38.resolveCarryChecks(s.m);if(M&&typeof M.postStep==='function')M.postStep(s.m);trackPassRelease(s);pushHistory(s);updateResultTracker(s);maybeCheckpoint(s);return s.m;}
function runAuto(s,seconds=5400){const target=Math.min(5400,s.m.time+seconds);let g=0;while(!s.m.completed&&s.m.time<target&&g++<300000){step(s,.10);if(s.pending){const pick=autoPick(s),r=applyChoice(s,pick.id,pick.targetId,{source:'AUTO_SIMULATION'});if(r.ok)s.autoResolved++;else s.pending=null;}}return summary(s);}
function autoPick(s){const p=s.pending;if(!p)return null;const ix=hash32(`${s.seed}|AUTO|${p.id}|${s.heroPlayerId}`)%Math.min(2,p.options.length);return p.options[ix]||p.options[0];}
function latestReplay(s){const pending=s.pending?.replayFrames?deep(s.pending.replayFrames):replayFrames(s,s.replaySeconds);if(!s.pending?.chained)return pending;const ep=s.pending?.episodeId,prior=ep?episodeReplay(s,ep):[],rows=[...prior,...pending],seen=new Set();return rows.filter(f=>{const k=Number(f.time).toFixed(3);if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>a.time-b.time).map(deep);}
function latestDebugScene(s){return s.currentScene?deep(s.currentScene):null;}
function sceneHistory(s){return(s.scenes||[]).map(deep);}
function sceneById(s,id){const x=(s.scenes||[]).find(sc=>sc.sceneId===id);return x?deep(x):null;}
function episodeScenes(s,episodeId){
  if(!episodeId)return[];return(s.scenes||[]).filter(sc=>sc.episodeId===episodeId&&sc.choice).map(deep);
}
function episodeReplay(s,episodeId){
  const rows=episodeScenes(s,episodeId);if(!rows.length)return[];const frames=[];
  for(let i=0;i<rows.length;i++){const sc=rows[i];if(i===0)frames.push(...(sc.preFrames||[]));frames.push(...(sc.postFrames||[]));}
  const seen=new Set();return frames.filter(f=>{const k=Number(f.time).toFixed(3);if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>a.time-b.time).map(deep);
}
function episodeDebug(s,episodeId){const scenes=episodeScenes(s,episodeId);if(!scenes.length)return null;return{schemaVersion:'FLR_DEBUG_EPISODE_0.1',controllerVersion:VERSION,seed:s.seed,mode:normalizeMode(s.mode),heroPlayerId:s.heroPlayerId,episodeId,startedAt:scenes[0]?.preFrames?.[0]?.time??scenes[0]?.checkpointAt,endedAt:scenes[scenes.length-1]?.postFrames?.at?.(-1)?.time??scenes[scenes.length-1]?.checkpointAt,scenes,frames:episodeReplay(s,episodeId)};}
function debugSummary(s){const sc=s.currentScene;if(!sc)return'저장된 선택 장면이 없습니다.';const lines=[`FLR DEBUG ${sc.sceneId}`,`seed=${sc.seed}`,`mode=${sc.mode}`,`hero=${sc.heroPlayerId}`,`checkpoint=${sc.checkpointAt}s (${(sc.checkpointAt/60).toFixed(2)}m)`,`kind=${sc.checkpointInspect?.kind} importance=${s.pauses.find(p=>p.id===sc.sceneId)?.importance??'-'}`,`phase=${sc.checkpointState?.phase} ball=${sc.checkpointState?.ball?.mode}/${sc.checkpointState?.ball?.ownerId||'-'}`];if(sc.choice)lines.push(`choice=${sc.choice.id}${sc.choice.targetName?` -> ${sc.choice.targetName}`:''}`);if(sc.result)lines.push(`result=${sc.result.code} | ${sc.result.headline} | ${sc.result.detail}`);if(sc.passReleases?.length){const p=sc.passReleases[sc.passReleases.length-1];lines.push(`lastPass=${p.sourceId}->${p.targetId} ballX=${p.ballX} targetX=${p.targetX} engineLine=${p.engineOffsideLine} referenceLine=${p.referenceSecondLastOpponentLine} engineWouldFlag=${p.engineWouldFlag}`);}return lines.join('\n');}
function summary(s){return{version:VERSION,seed:s.seed,mode:normalizeMode(s.mode),heroPlayerId:s.heroPlayerId,time:Number(s.m.time.toFixed(1)),score:{...s.m.score},pauseCount:s.pauses.length,autoResolved:s.autoResolved,userChoiceCount:(s.m.userChoiceLog||[]).length,pending:!!s.pending,resultActive:!!s.resultTracker,lastResult:s.lastResult?deep(s.lastResult):null,pauses:s.pauses.map(p=>({at:p.at,kind:p.kind,importance:p.importance,choices:p.options.map(o=>o.id)})),performance:deep(s.performance),appearanceStatus:s.appearanceStatus,futureOutcomePrecomputed:false};}
return{VERSION,MODES,create,inspect,maybeCheckpoint,applyChoice,step,runAuto,summary,autoPick,latestReplay,latestDebugScene,sceneHistory,sceneById,episodeScenes,episodeReplay,episodeDebug,debugSummary,finalizeResult,normalizeMode};
});
