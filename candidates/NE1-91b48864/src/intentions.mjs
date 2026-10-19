import {clamp,distance,local,world,teammates,opponents,segmentPoint,mix} from './math.mjs';
import {byId,tendencies} from './model.mjs';

const isCB=p=>p.role.endsWith('CB');
const isFB=p=>p.role==='LB'||p.role==='RB';
const isForward=p=>p.role.includes('ST')||['LW','RW'].includes(p.role);
const outfield=ps=>ps.filter(p=>p.role!=='GK');
function assign(p,team,target,kind,reason,focus=null){
  const pos=world(team,{x:clamp(target.x,kind==='restart'?.4:1,kind==='restart'?104.6:104),y:clamp(target.y,kind==='restart'?.4:2,kind==='restart'?67.6:66)});
  p.intention={...pos,kind,reason,focus};
}
function offsideLine(m,team){
  const xs=opponents(m,team).map(p=>local(team,p).x).sort((a,b)=>b-a);
  return Math.max(52.5,local(team,m.ball).x,xs[1]??105)-.8;
}
function openSupport(m,p,desired,carrier){
  const team=p.team,others=teammates(m,team).filter(q=>q.id!==p.id),rivals=opponents(m,team);
  const current=local(team,p),previous=local(team,p.intention);
  let best=desired,bestCost=Infinity;
  // One small continuous search around the team's assigned area. It never moves a body.
  for(const dx of [-3,0,3])for(const dy of [-3,0,3]){
    const c={x:clamp(desired.x+dx,2,offsideLine(m,team)),y:clamp(desired.y+dy,4,64)},w=world(team,c);
    let cost=distance(c,desired)*.8+distance(c,previous)*.24+distance(c,current)*.05;
    for(const q of others)cost+=Math.max(0,7-distance(w,q))*2;
    for(const q of rivals){cost+=Math.max(0,4-distance(w,q))*1.4;
      if(carrier){const lane=segmentPoint(q,carrier,w);if(lane.t>.12&&lane.t<.92)cost+=Math.max(0,2.6-lane.d)*1.5;}}
    if(cost<bestCost){bestCost=cost;best=c;}
  }
  return best;
}
function attackPlan(m,team,carrier){
  const own=teammates(m,team),rivals=opponents(m,team),b=local(team,m.ball),style=tendencies[m.teams[team].style];
  const back=clamp(b.x-28+style.advance*.4,15,51),limit=offsideLine(m,team);
  const ownHalfThreats=rivals.filter(q=>q.role!=='GK'&&local(team,q).x<52.5);
  for(const p of own){
    const a=local(team,p);let x,y=34+(p.base.y-34)*style.width,kind='support',reason='패스길과 팀 간격 유지';
    if(p.role==='GK'){x=clamp(b.x*.12,3,11);y=clamp(34+(b.y-34)*.12,28,40);kind='keeper';reason='뒤 공간과 공 관찰';}
    else if(isCB(p)){x=back+(p.role==='LCB'?-1:1);y=34+(p.base.y-34)*1.16;reason='공 뒤에서 순환 패스와 역습 대비';}
    else if(isFB(p)){
      const sameSide=b.y<34?p.base.y<34:p.base.y>34;
      const exposed=ownHalfThreats.some(q=>Math.abs(local(team,q).y-p.base.y)<22);
      x=clamp(back+(sameSide?11:5)+style.advance,18,exposed?53:72);
      if(exposed){const q=ownHalfThreats.filter(q=>Math.abs(local(team,q).y-p.base.y)<22).sort((a,b)=>local(team,a).x-local(team,b).x)[0];
        x=Math.min(x,local(team,q).x+5);reason='우리 진영의 측면 공격수와 뒤 공간 보호';kind='balance';}
      else reason=sameSide?'측면 동료 아래에서 지연 지원':'반대편 뒤 공간과 전환 패스 준비';
    }
    else if(p.role==='DM'){x=clamp(b.x-11,back+9,67);y=34+(b.y-34)*.28;reason='중앙 연결과 공 뒤 보호';}
    else if(p.role.includes('CM')){
      const near=(p.base.y<34)===(b.y<34);
      x=clamp(b.x+(near?-5:4)+style.advance*.5,back+13,82);
      y=mix(p.base.y,b.y,.2);reason=near?'공 소유자 옆·뒤의 패스 연결':'반대 중원에서 다음 전진 준비';
    }
    else if(['LM','RM'].includes(p.role)){x=clamp(b.x+4+style.advance,36,86);reason='측면 폭과 전방 패스 연결';}
    else if(['LW','RW'].includes(p.role)){x=clamp(b.x+13+style.advance,44,94);reason='공격 폭과 뒷공간의 패스 선택지';}
    else {x=clamp(b.x+18+style.advance*.5,45,94);y=p.base.y+(b.y-34)*.12;reason='센터백 사이 깊이와 전방 연결';}
    if(p.role!=='GK')x=Math.min(x,limit);
    let target={x,y};
    if(carrier&&p.id!==carrier.id&&!['keeper','balance'].includes(kind)&&!isCB(p))target=openSupport(m,p,target,carrier);
    assign(p,team,target,kind,reason,m.ball.owner);
  }
}
function pressArrival(p,carrier){
  // Estimate an interception from current velocity, rather than distance to a
  // position the carrier is already leaving. This samples no future match/RNG.
  const dx=carrier.x-p.x,dy=carrier.y-p.y;
  const a=carrier.vx**2+carrier.vy**2-p.maxSpeed**2;
  const b=2*(dx*carrier.vx+dy*carrier.vy),c=dx*dx+dy*dy;
  if(c<1e-8)return 0;
  const discriminant=b*b-4*a*c;
  const roots=Math.abs(a)<1e-8?(b<0?[-c/b]:[]):discriminant>=0?[(-b-Math.sqrt(discriminant))/(2*a),(-b+Math.sqrt(discriminant))/(2*a)]:[];
  return Math.min(...roots.filter(t=>t>=0),30);
}
function groundInterception(p,ball){
  const speed=Math.hypot(ball.vx,ball.vy);
  if(ball.z>.02||ball.vz>0||speed<.5)return null;
  const ux=ball.vx/speed,uy=ball.vy/speed;
  const reach=p.role==='GK'?1.05+p.keeping*.25:.68;
  // Current velocity, rolling deceleration and motor acceleration give a
  // meeting estimate. No match steps, random draws or future result are run.
  const at=t=>{const duration=Math.min(t,speed/.85),d=speed*duration-.425*duration*duration;return {x:ball.x+ux*d,y:ball.y+uy*d};};
  const margin=t=>{const q=at(t),dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);
    const forward=d?(p.vx*dx+p.vy*dy)/d:0,accelerating=Math.min(t,Math.max(0,(p.maxSpeed-forward)/4.8));
    const travel=forward*accelerating+2.4*accelerating*accelerating+p.maxSpeed*(t-accelerating);
    return d-reach-travel;
  };
  let lower=0;
  for(let upper=.1;upper<=4.00001;upper+=.1){
    const q=at(upper);if(q.x<.4||q.x>104.6||q.y<.4||q.y>67.6)break;
    if(margin(upper)<=0){let hi=upper,lo=lower;for(let n=0;n<8;n++){const mid=(lo+hi)/2;if(margin(mid)>0)lo=mid;else hi=mid;}
      const point=at(hi);if(p.role==='GK'&&(local(p.team,point).x>=16.5||Math.abs(point.y-34)>=20))return null;
      return {time:hi,point};
    }
    lower=upper;
  }
  return null;
}
function defencePlan(m,team,carrier){
  const own=teammates(m,team),field=outfield(own),b=local(team,m.ball),style=tendencies[m.teams[team].style];
  const line=clamp(b.x-19+style.advance*.4,7,45);
  const attackers=opponents(m,team).filter(q=>q.role!=='GK').map(p=>({p,a:local(team,p)})).sort((a,b)=>a.a.x-b.a.x);
  const previous=m.teams[team].pressId;
  const canPress=carrier&&(b.x<style.pressHeight||field.some(p=>distance(p,carrier)<9));
  const primary=canPress?[...field].sort((a,c)=>{
    const cost=p=>pressArrival(p,carrier)+(isCB(p)&&b.x>38?2.5:0)+(isFB(p)&&Math.abs(local(team,p).y-b.y)>22?4:0);
    // Small ownership preference, evaluated against current physical position.
    return cost(a)-(a.id===previous?.35:0)-cost(c)+(c.id===previous?.35:0);
  })[0]:null;
  m.teams[team].pressId=primary?.id??null;
  const cover=primary?[...field].filter(p=>p!==primary&&!isCB(p)&&!isFB(p)).sort((a,c)=>distance(a,carrier)-distance(c,carrier))[0]:null;
  const assigned=new Set();
  for(const p of own){
    let x,y=34+(p.base.y-34)*.8+(b.y-34)*.18,kind='block',reason='공 쪽으로 이동하며 팀 간격 유지',focus=carrier?.id??null;
    if(p.role==='GK'){
      const goal={x:0,y:34},ray={x:b.x,y:b.y-34},d=Math.hypot(ray.x,ray.y);
      const depth=clamp(2.5+(28-b.x)*.16,2.5,6.5);
      x=d?depth*b.x/d:2.5;y=34+(d?depth*(b.y-34)/d:0);
      if(carrier&&b.x<12&&Math.abs(b.y-34)<16&&distance(p,carrier)<8){x=Math.max(1,b.x-1.2);y=b.y;}
      kind='keeper';reason='공과 골문 사이 각도·접촉 준비';
    } else if(p===primary){
      // Receding targets need a short lead; chasing their current coordinates
      // makes the arrival motor brake forever outside physical challenge range.
      const lead=Math.min(1.5,pressArrival(p,carrier));
      const a=local(team,{x:carrier.x+carrier.vx*lead,y:carrier.y+carrier.vy*lead});
      x=a.x-1.05;y=a.y+(a.y<34?.25:-.25);kind='press';reason='공 소유자의 진행 경로에 접근해 압박';
    } else if(p===cover){x=clamp(b.x-8,line+4,72);y=clamp(b.y+(b.y<34?5:-5),8,60);kind='cover';reason='압박 뒤 패스길과 돌파 대비';}
    else if(isCB(p)||isFB(p)){
      x=line+(isFB(p)?1.5:0);
      const relevant=attackers.filter(({p:q,a})=>q.id!==carrier?.id&&!assigned.has(q.id)&&a.x<line+14&&Math.abs(a.y-y)<(isCB(p)?17:19));
      const threat=relevant.sort((a,c)=>Math.abs(a.a.y-y)+a.a.x*.25-Math.abs(c.a.y-y)-c.a.x*.25)[0];
      if(threat){assigned.add(threat.p.id);x=Math.min(x,threat.a.x-2);y=mix(y,threat.a.y,.65);kind='protect';reason='위험한 공격수의 골대 쪽과 통로 보호';}
    } else if(isForward(p)){x=clamp(line+24,24,73);y=34+(p.base.y-34)*.7+(b.y-34)*.18;reason='전방 패스길 차단과 역습 출구';}
    else{x=clamp(line+12+(p.role==='DM'?-3:0),17,60);reason='수비선 앞 공간과 반대편 연결 차단';}
    if(kind==='block'&&!isCB(p)&&!isFB(p)){
      // The line is an area to defend, not a shared destination. Screen a real
      // nearby passing connection inside that area; keep press/cover/backline
      // authority and the single physical motor. No random spacing or motion.
      const anchor={x,y};let dx=0,dy=0,total=.25,strongest=0;
      for(const {p:q,a} of attackers){
        if(q.id===carrier?.id)continue;
        const lane=segmentPoint(anchor,b,a);
        // Continuous influence avoids a nearest-opponent winner changing every
        // plan and sending a settled actor back in the opposite direction.
        const weight=Math.max(0,1-lane.d/24)**2*Math.max(0,1-Math.abs(a.y-y)/26)*(.4+.6*4*lane.t*(1-lane.t));
        const length=distance(b,a),along=length>0?Math.max(0,1-6/length):0;
        // Occupy the receiving side of a real connection, rather than merely
        // projecting the shared depth back onto a lane at almost the same x.
        const screen={x:mix(b.x,a.x,along),y:mix(b.y,a.y,along)};
        dx+=clamp(screen.x-x,-7,7)*weight;dy+=clamp(screen.y-y,-6,6)*weight;total+=weight;
        if(weight>strongest){strongest=weight;focus=q.id;}
      }
      if(strongest>0){x+=dx/total;y+=dy/total;reason='팀 간격 안에서 주변 상대의 패스 통로 차단';}
    }
    assign(p,team,{x,y},kind,reason,focus);
  }
}
export function plan(m){
  const carrier=byId(m,m.ball.owner),possession=carrier?.team??m.lastTouchTeam;
  for(let team=0;team<2;team++){
    if(team===possession)attackPlan(m,team,carrier);else defencePlan(m,team,carrier);
  }
  if(!carrier){
    // At most one factual ball retriever per team. Everyone else keeps team duties.
    const point={x:clamp(m.ball.x+m.ball.vx*.35,1,104),y:clamp(m.ball.y+m.ball.vy*.35,1,67)};
    for(let team=0;team<2;team++){
      const eligible=teammates(m,team).filter(p=>(p.role!=='GK'||local(team,point).x<16&&Math.abs(point.y-34)<22)&&!(m.ball.directThrowTeam!=null&&p.id===m.ball.lastKicker));
      const meetings=eligible.map(p=>({p,meeting:groundInterception(p,m.ball)})).filter(row=>row.meeting).sort((a,b)=>a.meeting.time-b.meeting.time);
      const first=meetings[0],nearest=first?.p??eligible.sort((a,b)=>distance(a,point)/a.maxSpeed-distance(b,point)/b.maxSpeed)[0];
      if(nearest)assign(nearest,team,local(team,first?.meeting.point??point),'receive','흐르는 실제 공을 회수',m.ball.lastKicker);
    }
  }
  if(carrier){
    const a=local(carrier.team,carrier),rivals=opponents(m,carrier.team);let best={x:a.x+5,y:a.y},score=-Infinity;
    for(const dy of [-5,-2.5,0,2.5,5]){
      const c={x:Math.min(103,a.x+5),y:clamp(a.y+dy,4,64)},w=world(carrier.team,c);
      const clearance=Math.min(...rivals.map(q=>distance(q,w)));
      const previous=local(carrier.team,carrier.intention);
      const s=Math.min(7,clearance)-Math.abs(c.y-34)*.035-Math.abs(dy)*.14-distance(c,previous)*.15;
      if(s>score){score=s;best=c;}
    }
    assign(carrier,carrier.team,best,'carry','전방 공간으로 운반하며 패스·슛 관찰');
  }
  if(m.restart){
    for(const p of m.players){
      if(p.id===m.restart.taker)assign(p,p.team,local(p.team,m.restart),'restart','재시작 지점으로 접근');
      else if(p.team!==m.restart.team&&distance(p,m.restart)<9.15){
        const dx=p.x-m.restart.x,dy=p.y-m.restart.y,d=Math.hypot(dx,dy)||1;
        assign(p,p.team,local(p.team,{x:m.restart.x+dx/d*10,y:m.restart.y+dy/d*10}),'restart','재시작 거리 확보');
      }
    }
  }
}
