'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),{spawn}=require('child_process');
let chromium;try{({chromium}=require('playwright'))}catch(_){chromium=null}

function parse(argv){const o={};for(let i=0;i<argv.length;i++){const x=argv[i];if(!x.startsWith('--'))continue;const p=x.indexOf('=');if(p>0)o[x.slice(2,p)]=x.slice(p+1);else o[x.slice(2)]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true}return o}
const args=parse(process.argv.slice(2));
const outDir=path.resolve(args.output||'artifacts/v58-football-visual-audit');
const scenario=String(args.scenario||'NATURAL');
const seconds=Math.max(scenario==='MOVING_RECEPTION'?2:10,Number(args.seconds||60));
const seeds=String(args.seeds||'V58-VISUAL-01,V58-VISUAL-02,V58-VISUAL-03,V58-VISUAL-04').split(',').filter(Boolean);
const port=Number(args.port||8765);
const pageURL=`http://127.0.0.1:${port}/QA/v58_football_visual_audit.html`;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const openplayState={freeze:new Map(),fbLast:new Map(),cbSwap:new Map()};

const localX=(team,x)=>team==='HOME'?x:105-x;
const sideSign=slot=>['LB','LCB','LCM','LW'].includes(slot)?-1:['RB','RCB','RCM','RW'].includes(slot)?1:0;
const worldSlotSide=(team,slot)=>team==='HOME'?sideSign(slot):-sideSign(slot);
function compact(row){
  return{
    t:row.simTime,phase:row.phase,possession:row.possession,
    ball:row.ball,events:row.events||[],restart:row.restart||null,setPiece:row.setPiece||null,
    attackDecision:row.attackDecision||null,challengeTrace:row.challengeTrace||null,
    players:row.players.map(p=>({
      id:p.id,team:p.team,role:p.role,slot:p.slot,x:p.x,y:p.y,vx:p.vx,vy:p.vy,tx:p.tx,ty:p.ty,
      type:p.responsibility.type,targetId:p.responsibility.targetId,markTargetId:p.responsibility.markTargetId,
      task:p.responsibility.task,action:p.responsibility.action,movingReceiveApproach:!!p.movingReceiveApproach
    }))
  };
}
function detect(row){
  const out=[],byId=new Map(row.players.map(p=>[p.id,p]));
  if(row.phase!=='OPEN_PLAY'||row.restart||row.setPiece||row.ball.mode!=='CONTROLLED'||!row.possession)return out;
  const freeKickSetupRows=row.players.filter(p=>String(p.responsibility?.task||'').startsWith('FREE_KICK_')).length;
  if(freeKickSetupRows>=4)return out;
  for(const p of row.players){
    if(p.team===row.possession||!['ST','WF'].includes(p.role))continue;
    const lx=localX(p.team,p.x);
    if(lx<35)out.push({kind:'DEEP_FORWARD',playerId:p.id,role:p.role,slot:p.slot,localX:+lx.toFixed(2),type:p.responsibility.type||null,task:p.responsibility.task||null,targetId:p.responsibility.targetId||null});
  }
  for(const team of ['HOME','AWAY']){
    if(row.possession===team)continue;
    const pairs=team==='HOME'?{'H-LB':'A-RW','H-RB':'A-LW'}:{'A-LB':'H-RW','A-RB':'H-LW'};
    for(const [fbId,wfId] of Object.entries(pairs)){
      const fb=byId.get(fbId),wf=byId.get(wfId);
      if(!fb||!wf)continue;
      const wx=team==='HOME'?wf.x:105-wf.x,wy=team==='HOME'?wf.y:68-wf.y;
      const wideThreat=wx<=49&&Math.abs(wy-34)>=15;
      const target=fb.responsibility?.targetId?byId.get(fb.responsibility.targetId):null;
      if(wideThreat&&target?.role==='ST'&&fb.responsibility?.type==='MARK'){
        out.push({kind:'FULLBACK_CENTRAL_ST_STEAL_WITH_WIDE_THREAT',team,playerId:fbId,wideThreatId:wfId,centralTargetId:target.id,wideLocalX:+wx.toFixed(2),wideLocalY:+wy.toFixed(2),task:fb.responsibility?.task||null});
      }
    }
  }
  for(const team of ['HOME','AWAY']){
    if(row.possession!==team)continue;
    const fbId=team==='HOME'?'H-LB':'A-LB',cbId=team==='HOME'?'H-LCB':'A-LCB';
    const fb=byId.get(fbId),cb=byId.get(cbId);
    if(fb&&cb&&/^INVERT_/.test(String(fb.responsibility?.task||''))){
      const fbl={x:team==='HOME'?fb.x:105-fb.x,y:team==='HOME'?fb.y:68-fb.y};
      const cbl={x:team==='HOME'?cb.x:105-cb.x,y:team==='HOME'?cb.y:68-cb.y};
      const lateralGap=Math.abs(fbl.y-cbl.y),depthGap=fbl.x-cbl.x;
      if(lateralGap<2.5&&depthGap>0&&depthGap<12){
        out.push({kind:'INVERT_FB_CB_SAME_LANE',team,fbId,cbId,lateralGap:+lateralGap.toFixed(2),depthGap:+depthGap.toFixed(2),fbTask:fb.responsibility?.task||null,fbLocalX:+fbl.x.toFixed(2),fbLocalY:+fbl.y.toFixed(2),cbLocalX:+cbl.x.toFixed(2),cbLocalY:+cbl.y.toFixed(2)});
      }
    }
  }
  if(scenario==='OPENPLAY_ROLES'&&row.phase==='OPEN_PLAY'&&!row.restart&&!row.setPiece){
    const pairs={HOME:{'H-LB':'A-RW','H-RB':'A-LW'},AWAY:{'A-LB':'H-RW','A-RB':'H-LW'}};
    for(const [team,pair] of Object.entries(pairs)){
      for(const [fbId,wfId] of Object.entries(pair)){
        const fb=byId.get(fbId),wf=byId.get(wfId);if(!fb||!wf)continue;
        const fbL={x:team==='HOME'?fb.x:105-fb.x,y:team==='HOME'?fb.y:68-fb.y};
        const wfL={x:team==='HOME'?wf.x:105-wf.x,y:team==='HOME'?wf.y:68-wf.y};
        const fbSpeed=Math.hypot(fb.vx||0,fb.vy||0),wfSpeed=Math.hypot(wf.vx||0,wf.vy||0);
        const key=fbId+'>'+wfId;
        const wingerThreat=row.possession!==team&&wfL.x<58&&Math.abs(wfL.y-34)>=13&&wfSpeed>=1.1;
        if(wingerThreat&&fbSpeed<=0.10){
          const since=openplayState.freeze.get(key)??row.simTime;openplayState.freeze.set(key,since);
          if(row.simTime-since>=0.45)out.push({kind:'FB_FREEZE_WITH_WINGER_PROGRESS',team,fbId,wfId,duration:+(row.simTime-since).toFixed(2),fbLocalX:+fbL.x.toFixed(2),fbLocalY:+fbL.y.toFixed(2),wfLocalX:+wfL.x.toFixed(2),wfLocalY:+wfL.y.toFixed(2),fbTask:fb.responsibility?.task||null,fbType:fb.responsibility?.type||null,fbTarget:fb.responsibility?.targetId||fb.responsibility?.markTargetId||null});
        }else openplayState.freeze.delete(key);

        const prior=openplayState.fbLast.get(fbId);
        if(prior){
          const dt=row.simTime-prior.t,dx=fbL.x-prior.x;
          if(dt>0&&dt<=0.35&&prior.x>=56&&dx<=-2.1){
            out.push({kind:'FB_OVERSHOOT_SNAP_RECOVERY',team,fbId,fromLocalX:+prior.x.toFixed(2),toLocalX:+fbL.x.toFixed(2),dt:+dt.toFixed(2),task:fb.responsibility?.task||null});
          }
        }
        openplayState.fbLast.set(fbId,{t:row.simTime,x:fbL.x,y:fbL.y});
      }

      const lcb=byId.get(team==='HOME'?'H-LCB':'A-LCB'),rcb=byId.get(team==='HOME'?'H-RCB':'A-RCB');
      if(lcb&&rcb){
        const ly=team==='HOME'?lcb.y:68-lcb.y,ry=team==='HOME'?rcb.y:68-rcb.y;
        const swapped=ly>ry+1.2;
        const key=team+'_CB_SWAP';
        if(swapped){
          const since=openplayState.cbSwap.get(key)??row.simTime;openplayState.cbSwap.set(key,since);
          if(row.simTime-since>=0.6)out.push({kind:'CB_SIDE_ORDER_SWAP',team,duration:+(row.simTime-since).toFixed(2),lcbLocalY:+ly.toFixed(2),rcbLocalY:+ry.toFixed(2),lcbTask:lcb.responsibility?.task||null,rcbTask:rcb.responsibility?.task||null});
        }else openplayState.cbSwap.delete(key);
      }
    }

    const wfFbPairs={'H-LW':'A-RB','H-RW':'A-LB','A-LW':'H-RB','A-RW':'H-LB'};
    for(const [wfId,oppFbId] of Object.entries(wfFbPairs)){
      const wf=byId.get(wfId),oppFb=byId.get(oppFbId);if(!wf||!oppFb||wf.team===row.possession)continue;
      const owns=wf.responsibility?.targetId===oppFbId||wf.responsibility?.markTargetId===oppFbId;
      if(!owns)continue;
      const team=wf.team,wfl={x:team==='HOME'?wf.x:105-wf.x,y:team==='HOME'?wf.y:68-wf.y},fbl={x:team==='HOME'?oppFb.x:105-oppFb.x,y:team==='HOME'?oppFb.y:68-oppFb.y};
      const deepFollow=wfl.x<45&&Math.abs(wfl.y-34)>=17&&Math.abs(wfl.y-fbl.y)<=7;
      if(deepFollow)out.push({kind:'DEFENDING_WF_FOLLOWS_OPP_FB_DEEP',team,wfId,oppFbId,wfLocalX:+wfl.x.toFixed(2),wfLocalY:+wfl.y.toFixed(2),oppFbLocalX:+fbl.x.toFixed(2),oppFbLocalY:+fbl.y.toFixed(2),type:wf.responsibility?.type||null,task:wf.responsibility?.task||null});
    }
  }

  const attackFbPairs={
    HOME:{'H-LB':'A-RW','H-RB':'A-LW'},
    AWAY:{'A-LB':'H-RW','A-RB':'H-LW'}
  };
  for(const [team,pairs] of Object.entries(attackFbPairs)){
    if(row.possession!==team)continue;
    for(const [fbId,wfId] of Object.entries(pairs)){
      const fb=byId.get(fbId),wf=byId.get(wfId);
      if(!fb||!wf)continue;
      const fl={x:team==='HOME'?fb.x:105-fb.x,y:team==='HOME'?fb.y:68-fb.y};
      const wl={x:team==='HOME'?wf.x:105-wf.x,y:team==='HOME'?wf.y:68-wf.y};
      const task=String(fb.responsibility?.task||fb.responsibility?.action||'');
      const threatCounterReady=wl.x<=60&&Math.abs(wl.y-34)>=14;
      const advanceGap=fl.x-wl.x,lateralGap=Math.abs(fl.y-wl.y);
      const innerLane=Math.abs(fl.y-34)<=18;
      const fbAdvanced=fl.x>=52&&advanceGap>=8;
      if(threatCounterReady&&fbAdvanced&&innerLane){
        out.push({kind:'FB_REST_DEFENCE_WIDE_THREAT_EXPOSURE',team,fbId,wfId,task,
          fbLocalX:+fl.x.toFixed(2),fbLocalY:+fl.y.toFixed(2),
          threatLocalX:+wl.x.toFixed(2),threatLocalY:+wl.y.toFixed(2),
          advanceGap:+advanceGap.toFixed(2),lateralGap:+lateralGap.toFixed(2)});
      }
    }
  }
  for(const team of ['HOME','AWAY']){
    const ps=row.players.filter(p=>p.team===team&&p.role!=='GK');
    const ys=ps.map(p=>p.y),xs=ps.map(p=>localX(team,p.x));
    const width=Math.max(...ys)-Math.min(...ys),depth=Math.max(...xs)-Math.min(...xs);
    if(width<24)out.push({kind:'TEAM_WIDTH_COMPRESSION',team,width:+width.toFixed(2),depth:+depth.toFixed(2)});
    if(depth<22)out.push({kind:'TEAM_DEPTH_COMPRESSION',team,width:+width.toFixed(2),depth:+depth.toFixed(2)});
    for(const p of ps.filter(p=>p.role==='FB'&&p.responsibility.markTargetId)){
      const t=byId.get(p.responsibility.markTargetId);
      if(t?.role==='WF'&&worldSlotSide(p.team,p.slot)&&worldSlotSide(t.team,t.slot)&&worldSlotSide(p.team,p.slot)!==worldSlotSide(t.team,t.slot)){
        out.push({kind:'OPPOSITE_WORLD_FLANK_FB_MARK',playerId:p.id,targetId:t.id});
      }
    }
  }
  return out;
}
function receptionContinuitySummary(ticks){
  const rows=ticks.map((row,index)=>{const p=row.players.find(q=>q.id==='H-ST');return{index,t:row.t,ballMode:row.ball.mode,ownerId:row.ball.ownerId,action:p?.action||null,x:p?.x??null,y:p?.y??null,vx:p?.vx??0,vy:p?.vy??0,speed:p?Math.hypot(p.vx||0,p.vy||0):0};}).filter(r=>r.x!=null);
  const contactIndex=rows.findIndex(r=>r.ownerId==='H-ST'&&r.ballMode==='CONTROLLED');
  const pre=contactIndex>0?rows.slice(0,contactIndex).filter(r=>r.ballMode==='FLIGHT'):[];
  const post=contactIndex>=0?rows.slice(contactIndex).filter(r=>r.action==='FIRST_TOUCH_FLOW'):[];
  const displacement=(rowset,i)=>i===0?null:Math.hypot(rowset[i].x-rowset[i-1].x,rowset[i].y-rowset[i-1].y);
  const summarize=rowsset=>{
    const speeds=rowsset.map(r=>r.speed),moves=rowsset.map((r,i)=>displacement(rowsset,i)).filter(v=>v!=null);
    let stopTicks=0,maxStopTicks=0,stopRestartCount=0;
    for(let i=0;i<rowsset.length;i++){
      const stopped=rowsset[i].speed<=0.08||(i>0&&displacement(rowsset,i)<=0.003);
      if(stopped){stopTicks++;maxStopTicks=Math.max(maxStopTicks,stopTicks);
        if(!rowsset.slice(Math.max(0,i-1),i).some(()=>false)){
          const end=Math.min(rowsset.length,i+13);
          if(rowsset.slice(i+1,end).some(r=>r.speed>=0.60))stopRestartCount++;
        }
      }else stopTicks=0;
    }
    return{
      ticks:rowsset.length,
      minSpeed:speeds.length?Math.min(...speeds):null,
      minDisplacement:moves.length?Math.min(...moves):null,
      maxContiguousStopSeconds:Number((maxStopTicks*.05).toFixed(3)),
      stopRestartCount
    };
  };
  return{contactIndex,contactTime:contactIndex>=0?rows[contactIndex].t:null,preContact:summarize(pre),firstTouchFlow:summarize(post)};
}
function finalThirdDiagnosticSummary(ticks){
  const rows=ticks.filter(r=>r.t>=230&&r.t<=280);
  const challengeReasons={},eligibleByTask={},eligibleRows=[];let challengeTraceTicks=0;
  const attackSelected={},attackTop={},attackRows=[],events={};const eventRows=[];
  for(const r of rows){
    for(const e of r.events||[]){events[e.type||'UNKNOWN']=(events[e.type||'UNKNOWN']||0)+1;if(eventRows.length<50)eventRows.push({t:r.t,event:e});}
    const ct=r.challengeTrace;
    if(ct){
      challengeTraceTicks++;
      for(const q of ct.rows||[]){
        challengeReasons[q.reason]=(challengeReasons[q.reason]||0)+1;
        if(q.eligible){eligibleByTask[q.task||'NONE']=(eligibleByTask[q.task||'NONE']||0)+1;if(eligibleRows.length<40)eligibleRows.push({t:r.t,...q});}
      }
    }
    const ad=r.attackDecision;
    if(ad){
      const sel=ad.selected?.type||ad.selected?.kind||ad.selected?.reason||'NONE',top=ad.alternatives?.[0]?.id||'NONE';
      attackSelected[sel]=(attackSelected[sel]||0)+1;attackTop[top]=(attackTop[top]||0)+1;
      if(attackRows.length<50)attackRows.push({t:r.t,playerId:ad.playerId,role:ad.role,currentState:ad.currentState,selected:ad.selected,alternatives:ad.alternatives});
    }
  }
  return{window:'230-280',events,eventRows,challengeTraceTicks,challengeReasons,eligibleByTask,eligibleRows,attackSelected,attackTop,attackRows};
}
function exactUserWindowSummary(seed,ticks){
  const inWin=(a,b)=>ticks.filter(r=>r.t>=a&&r.t<=b);
  const flagCount=(rows,kind)=>rows.reduce((n,r)=>n+(r.flags||[]).filter(f=>f.kind===kind).length,0);
  const player=(r,id)=>r.players.find(p=>p.id===id);
  const speed=p=>p?Math.hypot(p.vx||0,p.vy||0):null;
  const out={seed};
  if(seed==='V58-REST-01'){
    const rows=inWin(70,76),rb=rows.map(r=>({t:r.t,speed:speed(player(r,'H-RB')),task:player(r,'H-RB')?.task,action:player(r,'H-RB')?.action,x:player(r,'H-RB')?.x,y:player(r,'H-RB')?.y,tx:player(r,'H-RB')?.tx,ty:player(r,'H-RB')?.ty,possession:r.possession,ball:r.ball}));
    let cur=0,max=0;for(const q of rb){if((q.speed??99)<=.10){cur+=.05;max=Math.max(max,cur)}else cur=0}
    out.rbFreeze70_76={detectorHits:flagCount(rows,'FB_FREEZE_WITH_WINGER_PROGRESS'),maxContiguousNearZeroSeconds:+max.toFixed(2),samples:rb.filter((_,i)=>i%10===0)};
  }
  if(seed==='V58-REST-02'){
    const rows=inWin(200,220);
    const restartKinds={},setPieceKinds={},taskCounts={};
    for(const r of rows){
      const rk=r.restart?.kind||'NONE',sk=r.setPiece?.kind||r.setPiece?.type||'NONE';restartKinds[rk]=(restartKinds[rk]||0)+1;setPieceKinds[sk]=(setPieceKinds[sk]||0)+1;
      for(const p of r.players){const t=String(p.task||'');if(/SET_|CORNER|FREE_KICK|THROW|GOAL_KICK|WALL|KICKOFF/.test(t))taskCounts[t]=(taskCounts[t]||0)+1;}
    }
    out.setPiece200_220={restartKinds,setPieceKinds,taskCounts,samples:rows.filter((_,i)=>i%20===0).map(r=>({t:r.t,restart:r.restart,setPiece:r.setPiece,phase:r.phase,ball:r.ball,positions:r.players.map(p=>({id:p.id,x:p.x,y:p.y,tx:p.tx,ty:p.ty,task:p.task}))}))};
  }
  if(seed==='V58-REST-03'){
    const early=inWin(0,140),rows=inWin(230,280);
    const ownerCounts={},events={};let ownerChanges=0,prev=null,boxControlledTicks=0;
    for(const r of rows){
      const o=r.ball.ownerId||'NONE';ownerCounts[o]=(ownerCounts[o]||0)+1;if(prev!==null&&o!==prev)ownerChanges++;prev=o;
      for(const e of r.events||[]){events[e.type||'UNKNOWN']=(events[e.type||'UNKNOWN']||0)+1;}
      const op=player(r,o);if(op&&r.ball.mode==='CONTROLLED'){const lx=op.team==='HOME'?op.x:105-op.x,ly=op.team==='HOME'?op.y:68-op.y;if(lx>=88.5&&Math.abs(ly-34)<=20.2)boxControlledTicks++;}
    }
    out.roleWatch0_140={overshootHits:flagCount(early,'FB_OVERSHOOT_SNAP_RECOVERY'),cbSwapHits:flagCount(early,'CB_SIDE_ORDER_SWAP')};
    out.goalMouth230_280={ownerCounts,ownerChanges,events,boxControlledSeconds:+(boxControlledTicks*.05).toFixed(2),samples:rows.filter((_,i)=>i%20===0).map(r=>({t:r.t,owner:r.ball.ownerId,mode:r.ball.mode,phase:r.phase,possession:r.possession,events:r.events}))};
  }
  if(seed==='V58-REST-04'){
    const rows=inWin(118,125);
    out.wingerFollow118_125={deepFollowHits:flagCount(rows,'DEFENDING_WF_FOLLOWS_OPP_FB_DEEP'),samples:rows.filter((_,i)=>i%10===0).map(r=>{const lb=player(r,'H-LB'),rw=player(r,'A-RW');return{t:r.t,hLB:lb?{x:lb.x,y:lb.y,tx:lb.tx,ty:lb.ty,task:lb.task,speed:speed(lb)}:null,aRW:rw?{x:rw.x,y:rw.y,tx:rw.tx,ty:rw.ty,task:rw.task,targetId:rw.targetId,markTargetId:rw.markTargetId,speed:speed(rw)}:null,possession:r.possession,ball:r.ball};})};
  }
  return out;
}
function cardHtml(items,seed){
  const cards=items.map(x=>`<div class="card"><div class="lab">${x.label}</div><img src="${x.file}"></div>`).join('');
  return `<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui;background:#111;color:#fff;margin:0;padding:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{background:#1c1c1c;padding:8px}.lab{font-size:17px;margin:3px 0 8px;white-space:pre-wrap}.card img{display:block;width:100%;height:auto}</style><h1>${seed} · V58 football visual audit</h1><div class="grid">${cards}</div>`;
}
async function main(){
  if(!chromium)throw new Error('PLAYWRIGHT_UNAVAILABLE');
  fs.mkdirSync(outDir,{recursive:true});
  const server=spawn('python3',['-m','http.server',String(port),'--directory',process.cwd()],{stdio:'ignore'});
  let browser;
  try{
    await sleep(800);
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1320,height:920},deviceScaleFactor:1});
    const manifest={schema:'FLR_V58_FOOTBALL_VISUAL_AUDIT_1.0',sourceSHA:process.env.GITHUB_SHA||'LOCAL',seconds,seeds:[],policy:{tickData:'ALL_0.05S_GZIP_JSON',fixedScreens:'10S',anomalyScreens:'TRIGGERED_COOLDOWN',visualPass:'HUMAN_REVIEW_REQUIRED'}};
    for(const seed of seeds){
      openplayState.freeze.clear();openplayState.fbLast.clear();openplayState.cbSwap.clear();
      await page.goto(pageURL,{waitUntil:'load',timeout:30000});
      await page.waitForFunction(()=>window.FLR_V57_FRAME_TICK_QA?.engineReady?.(),null,{timeout:15000});
      await page.evaluate(({seed,scenario})=>window.FLR_V57_FRAME_TICK_QA.init({mode:'LEGACY_EXECUTE',scenario,seed,seconds:320,fps:20,showTargets:false,focusPlayer:scenario==='MOVING_RECEPTION'?'H-ST':null,finalThirdDeadlockDiagnostic:scenario==='FINAL_THIRD_DIAG',fixture:{kind:scenario==='MOVING_RECEPTION'?'MOVING_RECEPTION':'NATURAL'}}),{seed,scenario});
      const ticks=[],items=[],anomalies=[];let lastShotTick=-9999,shotNo=0;
      const exactSeconds=scenario==='FOLLOWUP_EXACT'?({'V58-REST-01':80,'V58-REST-02':225,'V58-REST-03':285,'V58-REST-04':130}[seed]||seconds):(scenario==='FINAL_THIRD_DIAG'?285:seconds);
      const total=Math.round(exactSeconds/0.05);
      for(let i=1;i<=total;i++){
        const row=await page.evaluate(()=>window.FLR_V57_FRAME_TICK_QA.step());
        const flags=detect(row);ticks.push({...compact(row),flags});
        const simRel=i*0.05;
        const exactWindow=scenario==='FOLLOWUP_EXACT'&&((seed==='V58-REST-01'&&simRel>=70&&simRel<=76)||(seed==='V58-REST-02'&&simRel>=200&&simRel<=220)||(seed==='V58-REST-03'&&((simRel>=70&&simRel<=140)||(simRel>=230&&simRel<=280)))||(seed==='V58-REST-04'&&simRel>=118&&simRel<=125));
        const finalThirdWindow=scenario==='FINAL_THIRD_DIAG'&&simRel>=230&&simRel<=280;
        const fixed=scenario==='MOVING_RECEPTION'?(i<=40&&i%2===0):scenario==='OPENPLAY_ROLES'?([68,70,72,74,76,78,116,118,120,122,124,126].some(t=>Math.abs(simRel-t)<0.026)):(scenario==='FOLLOWUP_EXACT'&&exactWindow&&i%20===0)||(finalThirdWindow&&i%20===0);
        const anomaly=flags.length&&i-lastShotTick>=40&&shotNo<6;
        if(fixed||anomaly){
          const kind=anomaly?'anomaly':'fixed',file=`${seed}_${kind}_${String(i).padStart(5,'0')}.png`;
          await page.locator('#qaPitch').screenshot({path:path.join(outDir,file)});
          const recv=row.players.find(p=>p.id==='H-ST'),recvSpeed=recv?Math.hypot(recv.vx||0,recv.vy||0):0;const label=anomaly?`ANOMALY t=${row.simTime.toFixed(2)}s\n${flags.map(f=>JSON.stringify(f)).join('\n')}`:(scenario==='MOVING_RECEPTION'?`RECEIVE t=${row.simTime.toFixed(2)}s · ball=${row.ball.mode} · H-ST speed=${recvSpeed.toFixed(2)} · action=${recv?.responsibility?.action||''}`:`FIXED t=${row.simTime.toFixed(2)}s`);
          items.push({file,label,tick:i,time:row.simTime,flags});
          if(anomaly){lastShotTick=i;shotNo++;anomalies.push({tick:i,time:row.simTime,flags});}
        }
      }
      const gz=path.join(outDir,`${seed}_ticks.json.gz`);
      fs.writeFileSync(gz,zlib.gzipSync(Buffer.from(JSON.stringify({seed,ticks}))));
      const sheet=path.join(outDir,`${seed}_sheet.html`);fs.writeFileSync(sheet,cardHtml(items,seed));
      await page.goto('file://'+sheet,{waitUntil:'load'});
      await page.screenshot({path:path.join(outDir,`${seed}_contact.png`),fullPage:true});
      for(const x of items)fs.rmSync(path.join(outDir,x.file),{force:true});
      fs.rmSync(sheet,{force:true});
      const reception=scenario==='MOVING_RECEPTION'?receptionContinuitySummary(ticks):null;
      const exactFollowup=scenario==='FOLLOWUP_EXACT'?exactUserWindowSummary(seed,ticks):null;
      const finalThirdDiagnostic=scenario==='FINAL_THIRD_DIAG'?finalThirdDiagnosticSummary(ticks):null;
      manifest.seeds.push({seed,tickCount:ticks.length,anomalies,contact:`${seed}_contact.png`,tickData:path.basename(gz),reception,exactFollowup,finalThirdDiagnostic});
    }
    fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    console.log(JSON.stringify({status:'CAPTURE_OK',outDir,contacts:manifest.seeds.map(s=>s.contact),tickFiles:manifest.seeds.map(s=>s.tickData),anomalyCounts:manifest.seeds.map(s=>[s.seed,s.anomalies.length]),receptionSummaries:manifest.seeds.map(s=>[s.seed,s.reception]),exactFollowup:manifest.seeds.map(s=>[s.seed,s.exactFollowup]),finalThirdDiagnostic:manifest.seeds.map(s=>[s.seed,s.finalThirdDiagnostic])},null,2));
  }finally{
    if(browser)await browser.close().catch(()=>{});
    server.kill('SIGTERM');
  }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
