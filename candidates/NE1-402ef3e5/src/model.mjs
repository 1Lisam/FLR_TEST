import {clamp,random,world,event} from './math.mjs';

export const DT=1/30;
export const PREVIEW_SECONDS=180;
export const formations={
  '433':[['GK',4,34],['LB',27,9],['LCB',23,25],['RCB',23,43],['RB',27,59],['DM',38,34],['LCM',46,22],['RCM',46,46],['LW',63,9],['ST',67,34],['RW',63,59]],
  '442':[['GK',4,34],['LB',27,9],['LCB',23,25],['RCB',23,43],['RB',27,59],['LM',46,10],['LCM',42,26],['RCM',42,42],['RM',46,58],['LST',65,27],['RST',65,41]]
};
export const tendencies={
  defensive:{advance:-4,pressHeight:61,width:0.92,risk:0.75},
  neutral:{advance:0,pressHeight:73,width:1,risk:1},
  attacking:{advance:4,pressHeight:86,width:1.04,risk:1.18}
};
export function createMatch(options={}) {
  const seed=Math.max(1,Number(options.seed)||1)>>>0;
  const m={seed,rng:seed,time:0,tick:0,endAt:PREVIEW_SECONDS,status:'playing',awaitingChoice:null,
    score:[0,0],players:[],teams:[],events:[],eventId:0,lastTouchTeam:0,
    nextPlan:0,ball:{x:52.5,y:34,z:0,vx:0,vy:0,vz:0,owner:null,lastKicker:null,kickTime:-10,kind:'ground',target:null,offside:[]},
    restart:null,stats:[0,1].map(()=>({passes:0,completed:0,shots:0,saves:0,interceptions:0})),summary:null};
  for(let team=0;team<2;team++){
    const formation=options.formations?.[team]||['433','442'][team];
    const style=options.styles?.[team]||'neutral';
    if(!formations[formation]||!tendencies[style])throw Error('UNKNOWN_TEAM_SETUP');
    m.teams.push({id:team,formation,style,pressId:null});
    const quality=clamp(options.quality?.[team]??0.7,0.3,1);
    for(const [i,[role,bx,by]] of formations[formation].entries()){
      const ability=()=>clamp(quality+(random(m)-.5)*.18,.3,1);
      const p={id:`${team===0?'H':'A'}-${role}`,team,role,slot:i,base:{x:bx,y:by},
        ...world(team,{x:role==='GK'?4:bx*.7,y:by}),vx:0,vy:0,facing:team===0?0:Math.PI,
        maxSpeed:5.8+ability()*1.9,skill:ability(),defence:ability(),keeping:role==='GK'?ability():0,
        intention:{x:0,y:0,kind:'shape',reason:'킥오프 대형'},nextAction:0,controlledSince:-1,
        lastChallenge:-10,action:'',actionUntil:0};
      p.intention.x=p.x;p.intention.y=p.y;m.players.push(p);
    }
  }
  const kicker=m.players.find(p=>p.team===0&&p.role.includes('ST'));
  kicker.x=52.5;kicker.y=34;kicker.controlledSince=0;kicker.nextAction=.65;m.ball.owner=kicker.id;
  event(m,'kickoff',{team:0,playerId:kicker.id});
  return m;
}
export const byId=(m,id)=>m.players.find(p=>p.id===id);
export function community(m){
  const facts=m.events.filter(e=>['goal','save','interception'].includes(e.type)).slice(-3);
  if(!facts.length)return [{text:`${Math.floor(m.time/60)}분 시험 구간이 끝났습니다. 득점은 ${m.score[0]} 대 ${m.score[1]}입니다.`,source:{time:m.time,score:[...m.score]}}];
  return facts.map(e=>({eventId:e.id,text:e.type==='goal'?`${e.team===0?'블루':'레드'}팀 득점! ${e.playerId}의 마무리가 점수로 이어졌네요.`:e.type==='save'?`${e.playerId}의 선방으로 슛을 막았습니다.`:`${e.playerId}가 패스를 끊었네요.`,source:{type:e.type,t:e.t}}));
}
