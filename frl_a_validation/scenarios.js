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
    {id:'press-cover',label:'압박 · 커버 전환',description:'primary press와 cover/mark/recovery의 동시 context',setup(s){s.ball.x=58;s.ball.y=51;s.possession=1;s.lastPossession=1;s.ball.owner=19;s.ball.mode='controlled';setPlayer(s,19,58,51,{duty:'CARRY'});setPlayer(s,4,54,48,{duty:'PRESS'});setPlayer(s,2,43,27,{duty:'COVER'});setPlayer(s,3,44,41,{duty:'MARK'});setPlayer(s,5,50,34,{duty:'RECOVERY'});}}
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
