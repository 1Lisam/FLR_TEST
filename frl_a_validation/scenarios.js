(function(){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function base(seed){
    const match=new window.ASTRA_FIXTURE_ENGINE.Match(seed); // replaced by viewer's local fixture constructor
    return JSON.parse(match.serialize());
  }
  function setPlayer(s,id,x,y,extra={}){const p=s.players[id];Object.assign(p,{x,y,vx:0,vy:0,target:{x,y},...extra});}
  const defs=[
    {id:'defensive-shift',label:'수비 라인 횡이동',description:'상대 볼/shape 이동에 대한 수비 라인의 lateral response',setup(s){s.ball.x=67;s.ball.y=24;s.possession=1;s.lastPossession=1;s.ball.owner=20;s.ball.mode='controlled';setPlayer(s,20,67,24);[1,2,3,4].forEach((id,i)=>setPlayer(s,id,32+i*3,18+i*10,{duty:'COVER'}));}},
    {id:'transition-return',label:'공수 전환 · 복귀',description:'소유권이 막 바뀐 뒤 midfield/defense recovery urgency',setup(s){s.ball.x=45;s.ball.y=40;s.possession=0;s.lastPossession=1;s.transitionAt=0;s.ball.owner=9;s.ball.mode='controlled';setPlayer(s,9,45,40,{duty:'SUPPORT'});[5,6,7,12,13,14].forEach((id,i)=>setPlayer(s,id,48+(i%3)*5,12+Math.floor(i/3)*35,{duty:'RECOVERY'}));}},
    {id:'build-support',label:'빌드업 지원 이동',description:'볼 운반자와 CB/DM/MF의 현재 support shape',setup(s){s.ball.x=31;s.ball.y=34;s.possession=0;s.lastPossession=0;s.ball.owner=5;s.ball.mode='controlled';setPlayer(s,5,31,34,{duty:'CARRY'});setPlayer(s,2,25,25,{duty:'SUPPORT'});setPlayer(s,3,25,43,{duty:'SUPPORT'});setPlayer(s,6,37,26,{duty:'SUPPORT'});setPlayer(s,7,37,42,{duty:'SUPPORT'});}},
    {id:'press-cover',label:'압박 · 커버 전환',description:'primary press와 cover/mark/recovery의 동시 context',setup(s){s.ball.x=58;s.ball.y=51;s.possession=1;s.lastPossession=1;s.ball.owner=19;s.ball.mode='controlled';setPlayer(s,19,58,51,{duty:'CARRY'});setPlayer(s,4,54,48,{duty:'PRESS'});setPlayer(s,2,43,27,{duty:'COVER'});setPlayer(s,3,44,41,{duty:'MARK'});setPlayer(s,5,50,34,{duty:'RECOVERY'});}},
    {id:'elastic-winger-return',label:'측면 대응 후 복귀',description:'FB가 측면 위협에 반응하고 인접 커버가 국소적으로 보완하는 강제 시작',setup(s){s.ball.x=48;s.ball.y=11;s.possession=1;s.lastPossession=1;s.ball.owner=19;s.ball.mode='controlled';setPlayer(s,19,48,11,{duty:'CARRY'});setPlayer(s,1,38,12);setPlayer(s,2,31,27);setPlayer(s,3,29,41);setPlayer(s,4,30,56);}},
    {id:'cb-step-local-cover',label:'CB 전진 압박 · 주변 커버',description:'한 CB의 직접 압박과 파트너/FB의 중앙·깊이 보호 강제 시작',setup(s){s.ball.x=35;s.ball.y=31;s.possession=1;s.lastPossession=1;s.ball.owner=20;s.ball.mode='controlled';setPlayer(s,20,35,31,{duty:'CARRY'});setPlayer(s,2,32,30);setPlayer(s,3,23,41);setPlayer(s,1,25,13);setPlayer(s,4,24,56);setPlayer(s,5,31,35);}},
    {id:'far-fb-narrow',label:'반대편 FB 중앙 압축',description:'한쪽 측면의 볼에 대해 반대편 FB가 추격 대신 구조를 보호하는 강제 시작',setup(s){s.ball.x=54;s.ball.y=9;s.possession=1;s.lastPossession=1;s.ball.owner=19;s.ball.mode='controlled';setPlayer(s,19,54,9,{duty:'CARRY'});setPlayer(s,4,33,60);setPlayer(s,1,31,10);}},
    {id:'fb-attack-cb-handoff',label:'FB 공격 가담 · CB 마크 인계',description:'유효한 측면 전진과 명시적 CB 인계·중앙 백업 강제 시작',setup(s){s.ball.x=67;s.ball.y=12;s.possession=0;s.lastPossession=0;s.ball.owner=8;s.ball.mode='controlled';setPlayer(s,8,67,12,{duty:'CARRY'});setPlayer(s,1,54,12);setPlayer(s,2,51,18);setPlayer(s,3,33,39);setPlayer(s,5,38,34);setPlayer(s,19,47,12);setPlayer(s,20,35,34);}},
    {id:'fb-attack-envelope',label:'FB 공격 가담 · 복귀 가능 범위',description:'CB 완전 인계 없이도 현재 회복 시간 안에서만 FB 지원을 허용하는 강제 시작',setup(s){s.ball.x=58;s.ball.y=13;s.possession=0;s.lastPossession=0;s.ball.owner=8;s.ball.mode='controlled';setPlayer(s,8,58,13,{duty:'CARRY'});setPlayer(s,1,43,12,{vx:1.4});setPlayer(s,2,24,26);setPlayer(s,3,24,43);setPlayer(s,5,34,34);setPlayer(s,19,44,12,{vx:-0.2});setPlayer(s,20,30,34);}},
    {id:'fb-invalid-advance-block',label:'FB 무근거 전진 차단',description:'공격 트리거·인계·회복 여지 없는 경우 FB가 측면 책임을 유지하는 강제 시작',setup(s){s.ball.x=43;s.ball.y=34;s.possession=0;s.lastPossession=0;s.ball.owner=6;s.ball.mode='controlled';setPlayer(s,6,43,34,{duty:'CARRY'});setPlayer(s,1,62,12);setPlayer(s,2,23,26);setPlayer(s,3,23,42);setPlayer(s,5,35,34);setPlayer(s,19,42,11);setPlayer(s,20,29,34);}},
    {id:'turnover-fb-recovery',label:'턴오버 직후 FB 책임 복귀',description:'높았던 FB가 소유권 상실 직후 즉시 측면·중앙 책임을 재평가하는 강제 시작',setup(s){s.ball.x=68;s.ball.y=12;s.possession=1;s.lastPossession=0;s.transitionAt=0;s.ball.owner=19;s.ball.mode='controlled';setPlayer(s,19,68,12,{duty:'CARRY'});setPlayer(s,1,65,12);setPlayer(s,2,43,25);setPlayer(s,3,31,42);setPlayer(s,5,38,34);setPlayer(s,20,38,34);}}
  ];
  window.FRL_A_SCENARIOS={defs,make:(def,seed,Engine)=>{
    const s=base.call(null,seed); // temporary constructor is installed by viewer before call
    def.setup(s);
    s.seed=String(seed);s.paused=true;s.phase='play';s.tick=0;s.time=0;s.clock=360;s.half=1;s.currentEvent=null;s.events=[];s.history=[];s.input=null;
    s.ball.z=0.15;s.ball.vx=0;s.ball.vy=0;s.ball.vz=0;s.ball.flight=null;s.ball.lastTouch=s.ball.owner;
    for(const p of s.players){p.target={x:clamp(p.target.x,0.2,104.8),y:clamp(p.target.y,0.2,67.8)};}
    return JSON.stringify(s);
  }};
})();
