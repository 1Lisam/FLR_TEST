(function(root){
'use strict';
// Isolated, opt-in movement replacement trial. The shipped checkout remains legacy.
// No random draws, ball writes, future outcomes, or player position/velocity writes.
const VERSION='MOVEMENT_PROOF_B';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const local=(team,p)=>({x:team==='HOME'?p.x:105-p.x,y:team==='HOME'?p.y:68-p.y});
const world=(team,p)=>({x:team==='HOME'?p.x:105-p.x,y:team==='HOME'?p.y:68-p.y});
const other=team=>team==='HOME'?'AWAY':'HOME';
const mode=()=>root.FLR_MOVEMENT_PROOF_MODE||'LEGACY';
const active=m=>mode()==='TRIAL'&&!!m&&!m.restart&&!m.setPieceLive&&!m.completed&&['CONTROLLED','FLIGHT','LOOSE'].includes(m.ball?.mode);
const diagnostics={plans:0,detail:0,coarse:0,legacyBridge:0};
function legacy(fn){if(mode()==='BRIDGE')diagnostics.legacyBridge++;return fn();}
function protectedAction(m,p){
  const now=Number(m.time)||0;
  if(m.ball.mode==='CONTROLLED'&&m.ball.ownerId===p.id)return 'BALL_OWNER';
  if(m.ball.mode==='FLIGHT'&&m.ball.intendedReceiverId===p.id)return 'LIVE_RECEIVER';
  if(m.userChoiceControl?.playerId===p.id&&Number(m.userChoiceControl.until||Infinity)>now)return 'USER_ACTION';
  if(m.activeDuel&&(m.activeDuel.attackerId===p.id||m.activeDuel.defenderId===p.id))return 'LIVE_DUEL';
  if(['SHOT_PREP','TURNING_SHOT_PREP','POST_SHOT_FOLLOW','GK_DIVE','GK_RECOVERY'].includes(p.action)&&Number(p.lockTargetUntil)>now)return 'CONTACT_ACTION';
  return null;
}
function plan(m){
  const ps=m.players,b=m.ball,owner=b.mode==='CONTROLLED'?ps.find(p=>p.id===b.ownerId):null;
  const possession=owner?.team||b.lastTouchTeam||m.possession;
  const result=[],protectedIds=new Map(ps.map(p=>[p.id,protectedAction(m,p)]).filter(([,reason])=>reason));
  const add=(p,q,type,reason,targetId=null)=>result.push({id:p.id,type,task:type,targetPoint:world(p.team,{x:clamp(q.x,1,104),y:clamp(q.y,2,66)}),reasonCode:reason,source:VERSION,targetId,sprint:distance(local(p.team,p),q)>3,stationaryAllowed:distance(local(p.team,p),q)<1,responsibility:{type,targetId,reasonCode:reason}});
  for(const team of ['HOME','AWAY']){
    const teamPlayers=ps.filter(p=>p.team===team),field=teamPlayers.filter(p=>p.role!=='GK'),opponents=ps.filter(p=>p.team!==team),bl=local(team,b),attack=possession===team;
    const profile=m.managerProfiles?.[team]||{},bias=clamp(((profile.lineHeight??.5)-.5)*8,-4,4);
    const opponentLine=opponents.map(p=>local(team,p).x).sort((a,b)=>b-a)[1]??95;
    const offside=Math.max(52.5,bl.x,opponentLine)-1;
    const available=field.filter(p=>!protectedIds.has(p.id));
    const nearest=(pool,point)=>pool.slice().sort((a,b)=>distance(a,point)-distance(b,point)||a.id.localeCompare(b.id));
    let responder=null,cover=null;
    if(b.mode==='LOOSE')responder=nearest(available,b)[0];
    else if(!attack&&owner){
      // Allocate one reachable challenge, rather than rewarding a trailing chase
      // while the defender in the carrier's path retreats to an unrelated line.
      const velocity={x:(owner.vx||0)*(team==='HOME'?1:-1),y:(owner.vy||0)*(team==='HOME'?1:-1)};
      const approach={x:bl.x+velocity.x*.6,y:bl.y+velocity.y*.6};
      const candidates=available.map(p=>{const q=local(team,p);return{p,cost:distance(q,approach)+Math.max(0,q.x-bl.x)*.65+(p.role==='CB'&&bl.x>60?5:0)+(p.role==='FB'&&Math.abs(q.y-bl.y)>17?7:0)};}).sort((a,b)=>a.cost-b.cost||a.p.id.localeCompare(b.p.id));
      responder=candidates[0]?.p;
      const incumbent=candidates.find(v=>v.p.intent?.source===VERSION&&v.p.intent.type==='PRESS'&&v.p.intent.targetId===owner.id);
      if(incumbent&&incumbent.cost<=candidates[0].cost+2)responder=incumbent.p;
      const coverPoint=world(team,{x:bl.x-8,y:34+(bl.y-34)*.6});
      cover=nearest(available.filter(p=>p!==responder&&p.role!=='WF'&&p.role!=='ST'),coverPoint)[0];
    }
    const deepThreats=opponents.filter(p=>p.role!=='GK'&&p!==owner).map(p=>({p,q:local(team,p)}));
    const back=clamp(bl.x-18+bias,10,63),mid=clamp(back+12,19,75),front=clamp(mid+12,30,88);
    const wideThreatFor=p=>{
      const left=/^L/.test(p.slot),lane=left?14:54;
      return deepThreats.filter(t=>Math.abs(t.q.y-lane)<15).sort((a,b)=>a.q.x-b.q.x)[0];
    };
    // Allocate each current off-ball threat once. Counter protection also applies
    // in possession: a carrying fullback cannot be counted as his own cover.
    const assignments=new Map(),assignedThreats=new Set();
    const threats=deepThreats.filter(t=>t.q.x<(attack?bl.x+3:back+12)).sort((a,b)=>a.q.x-b.q.x||a.p.id.localeCompare(b.p.id));
    for(const t of threats){
      const wide=Math.abs(t.q.y-34)>17;
      const candidates=available.filter(p=>p!==responder&&p!==cover&&!assignments.has(p.id)&&(p.role==='CB'||p.role==='FB'||(wide&&p.role==='CM'))).map(p=>{
        const q=local(team,p),sameSide=(q.y-34)*(t.q.y-34)>=0;
        return{p,q,cost:distance(q,t.q)+(wide?(p.role==='FB'?0:p.role==='CM'?5:11):(p.role==='CB'?0:10))+(sameSide?0:10)};
      }).filter(v=>!attack||v.p.role==='CB'||wide).sort((a,b)=>a.cost-b.cost||a.p.id.localeCompare(b.p.id));
      const winner=candidates[0];if(winner){assignments.set(winner.p.id,t);assignedThreats.add(t.p.id);}
    }
    // Search a small receiving area against present opponents and teammates.
    // The preference is a usable angle, not a new fixed coordinate or future pass.
    const supportPoint=(p,base)=>{
      if(!owner)return base;
      const q=local(team,p),friends=field.filter(a=>a!==p&&a!==owner).map(a=>local(team,a));
      const candidates=[];
      for(const dx of [-3,0,3])for(const dy of [-5,0,5]){
        const v={x:clamp(base.x+dx,5,Math.min(96,offside)),y:clamp(base.y+dy,5,63)},length=distance(bl,v);
        const lane=Math.min(8,...opponents.map(a=>{const o=local(team,a),ux=v.x-bl.x,uy=v.y-bl.y,t=clamp(((o.x-bl.x)*ux+(o.y-bl.y)*uy)/Math.max(1,ux*ux+uy*uy),0,1);return distance(o,{x:bl.x+ux*t,y:bl.y+uy*t});}));
        const spacing=Math.min(7,...friends.map(a=>distance(a,v)));
        candidates.push({v,cost:distance(v,base)*.3+distance(v,q)*.18+Math.max(0,length-23)*.6-lane*.7-spacing*.25});
      }
      candidates.sort((a,b)=>a.cost-b.cost);return candidates[0].v;
    };
    for(const p of teamPlayers){
      const q=local(team,p),side=/^L/.test(p.slot)?-1:/^R/.test(p.slot)?1:0,protectedReason=protectedIds.get(p.id);
      if(protectedReason){result.push({id:p.id,protected:true,reasonCode:protectedReason});continue;}
      if(p.role==='GK'){
        const near=!attack&&bl.x<20,depth=near?clamp(bl.x*.32,1.8,7):clamp(3+bl.x*.055,3,8.2);
        add(p,{x:depth,y:34+(bl.y-34)*clamp(depth/Math.max(8,bl.x),.04,.4)},'GK_COVER','CURRENT_BALL_GOAL_ANGLE');continue;
      }
      if(p===responder){
        const pressure=b.mode==='LOOSE'?{x:bl.x,y:bl.y}:{x:bl.x-.65,y:bl.y+(q.y<bl.y?-.25:.25)};
        add(p,pressure,b.mode==='LOOSE'?'RECOVER_LOOSE':'PRESS','NEAREST_CURRENT_BALL_RESPONDER',owner?.id||null);continue;
      }
      if(p===cover){add(p,{x:Math.max(3,bl.x-6),y:34+(bl.y-34)*.64},'COVER','CURRENT_PRESS_BACKUP',owner?.id||null);continue;}
      const assigned=assignments.get(p.id);
      if(assigned){
        add(p,{x:clamp(assigned.q.x-2.3,3,attack?62:back+4),y:assigned.q.y+(34-assigned.q.y)*.10},attack?'REST_BALANCE':'MARK','UNIQUE_CURRENT_THREAT_COVER',assigned.p.id);continue;
      }
      if(attack){
        if(p.role==='CB'){
          const threats=deepThreats.filter(t=>Math.abs(t.q.y-34)<20),limit=threats.length?Math.min(...threats.map(t=>t.q.x))-2:62;
          add(p,{x:clamp(Math.min(bl.x-17,limit),8,62)+(side===1?-1:0),y:34+side*9+(bl.y-34)*.13},'REST_BALANCE','CENTRAL_BUILD_AND_COUNTER_COVER');
        }else if(p.role==='FB'){
          const threat=wideThreatFor(p),ballSide=side*(bl.y-34)>0;
          const covered=threat&&field.some(a=>a!==p&&a.id!==b.ownerId&&a.role!=='WF'&&local(team,a).x<=threat.q.x+1&&Math.abs(local(team,a).y-threat.q.y)<9);
          let x=clamp(bl.x-(ballSide?9:18),12,ballSide?78:64);
          if(threat&&!covered)x=Math.min(x,threat.q.x-2);
          add(p,{x:Math.max(5,x),y:34+side*(ballSide?25:21)+(bl.y-34)*.08},'WIDE_SUPPORT','WIDTH_WITH_CURRENT_COUNTER_PROTECTION',!covered?threat?.p.id:null);
        }else if(p.role==='CM'){
          const pivot=side===0,x=clamp(bl.x+(pivot?-11:side*(bl.y-34)>0?-5:6),15,Math.min(87,offside));
          add(p,supportPoint(p,{x,y:pivot?34+(bl.y-34)*.30:34+side*13+(bl.y-34)*.22}),'SUPPORT','CURRENT_OPEN_RECEIVING_ANGLE');
        }else if(p.role==='ST'){
          add(p,supportPoint(p,{x:clamp(bl.x+12,28,Math.min(96,offside)),y:34+(bl.y-34)*.45}),'FORWARD_RUN','CURRENT_OPEN_FORWARD_CONNECTION');
        }else{
          add(p,supportPoint(p,{x:clamp(bl.x+10,24,Math.min(94,offside)),y:34+side*24+(bl.y-34)*.12}),'WIDE_RUN','CURRENT_OPEN_ATTACK_WIDTH');
        }
      }else{
        const group=p.role==='CB'||p.role==='FB'?back:p.role==='CM'?mid:front;
        const lane=p.role==='CB'?34+side*8:p.role==='FB'?34+side*22:p.role==='CM'?34+side*12:p.role==='WF'?34+side*21:34;
        let target={x:group+(p.role==='FB'?1.5:side===1?-.8:.8),y:clamp(lane+(bl.y-34)*.22,5,63)},threat=null;
        // Threat ownership has already been allocated; do not mark it a second time.
        if(threat&&threat.q.x<group+10){target={x:clamp(threat.q.x-2.3,3,group+4),y:threat.q.y+(34-threat.q.y)*.08};}
        add(p,target,threat?'MARK':'RECOVERY',threat?'CURRENT_GOAL_SIDE_THREAT':'CONNECTED_DEFENSIVE_BLOCK',threat?.p.id||null);
      }
    }
  }
  diagnostics.plans++;
  return result;
}
function applyDetail(m){
  if(!active(m))return false;
  const proposals=plan(m);diagnostics.detail++;
  m._testOnlyCausalLedger?.start(m,'football_movement_policy');
  for(const proposal of proposals){
    const p=m.players.find(p=>p.id===proposal.id);if(proposal.protected)continue;
    // Retire tactical commitments for migrated off-ball actors. Explicit action
    // contracts above continue to belong to the action/reception executors.
    for(const key of ['lockTargetUntil','runUntil','postPassContinueUntil','postPassSupportUntil','postShotHoldUntil','openChannelUntil','crossAttackUntil'])p[key]=0;
    for(const key of ['_shapeContinuityIntent','_hybridEntryContinuity','_defensivePursuitIntent','_defensiveFacingAuthority'])delete p[key];
    p.tx=proposal.targetPoint.x;p.ty=proposal.targetPoint.y;p.action=p.tacticalTask=proposal.type;p.sprint=proposal.sprint;
    p.markTargetId=proposal.type==='MARK'?proposal.targetId:null;p.responsibilityType=proposal.type;p.responsibilityTargetId=proposal.targetId;
    p.intent={...proposal,createdAt:m.time,expiresAt:m.time};
    p.faceTargetAngle=Math.atan2(m.ball.y-p.y,m.ball.x-p.x);
  }
  m._defensiveResponsibility={};m._defenceRoleLocks={};m._markLocks={};
  m._testOnlyCausalLedger?.end(m,'football_movement_policy');
  return true;
}
const api={VERSION,mode,active,legacy,plan,applyDetail,diagnostics,protectedAction};
if(typeof module!=='undefined'&&module.exports)module.exports=api;root.FLRPG_FOOTBALL_MOVEMENT_POLICY=api;
})(typeof globalThis!=='undefined'?globalThis:this);
