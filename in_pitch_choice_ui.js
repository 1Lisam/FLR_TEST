(function(root){'use strict';
const API_VERSION='STEP78-IN-PITCH-CHOICE-0.4-RUN-ARROW-EXPLICIT-INPUT';
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function resolveAnchorId(option,heroId,playerIds){
  if(option&&option.targetId&&playerIds.has(option.targetId)) return option.targetId;
  return heroId;
}
function groupOptions(options,heroId,players){
  const ids=new Set((players||[]).map(p=>p.id));
  const by=new Map();
  for(const o of options||[]){
    const anchorId=resolveAnchorId(o,heroId,ids);if(!anchorId)continue;
    if(!by.has(anchorId))by.set(anchorId,[]);by.get(anchorId).push(o);
  }
  return [...by.entries()].map(([anchorId,opts])=>({anchorId,options:opts}));
}
function rectOverlap(a,b,pad=0){return !(a.right+pad<=b.left||a.left>=b.right+pad||a.bottom+pad<=b.top||a.top>=b.bottom+pad)}
function pointRectDistance(x,y,r){const dx=x<r.left?r.left-x:x>r.right?x-r.right:0,dy=y<r.top?r.top-y:y>r.bottom?y-r.bottom:0;return Math.hypot(dx,dy)}
function segmentRectDistance(seg,rect){
  const steps=14;let best=Infinity;
  for(let i=0;i<=steps;i++){const t=i/steps,x=seg.x1+(seg.x2-seg.x1)*t,y=seg.y1+(seg.y2-seg.y1)*t;best=Math.min(best,pointRectDistance(x,y,rect));}
  return best;
}
function placementScore(rect,bounds,blockers,avoidSegments=[]){
  let score=0;
  if(rect.left<bounds.left)score+=(bounds.left-rect.left)*12;
  if(rect.top<bounds.top)score+=(bounds.top-rect.top)*12;
  if(rect.right>bounds.right)score+=(rect.right-bounds.right)*12;
  if(rect.bottom>bounds.bottom)score+=(rect.bottom-bounds.bottom)*12;
  for(const b of blockers||[])if(rectOverlap(rect,b,4))score+=2000+Math.max(0,Math.min(rect.right,b.right)-Math.max(rect.left,b.left))*Math.max(0,Math.min(rect.bottom,b.bottom)-Math.max(rect.top,b.top));
  for(const s of avoidSegments||[]){const d=segmentRectDistance(s,rect),pad=Number(s.pad)||22,weight=Number(s.weight)||1450;if(d<pad)score+=weight+(pad-d)*55;}
  return score;
}
function choosePlacement(anchor,size,bounds,blockers,avoidSegments=[]){
  const gap=20,w=size.width,h=size.height;
  const candidates=[
    {name:'RIGHT',left:anchor.x+gap,top:anchor.y-h/2},
    {name:'LEFT',left:anchor.x-gap-w,top:anchor.y-h/2},
    {name:'BOTTOM',left:anchor.x-w/2,top:anchor.y+gap},
    {name:'TOP',left:anchor.x-w/2,top:anchor.y-gap-h}
  ].map(c=>({...c,right:c.left+w,bottom:c.top+h}));
  candidates.sort((a,b)=>placementScore(a,bounds,blockers,avoidSegments)-placementScore(b,bounds,blockers,avoidSegments));
  const best=candidates[0];
  return {...best,left:clamp(best.left,bounds.left,bounds.right-w),top:clamp(best.top,bounds.top,bounds.bottom-h)};
}
function make(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e}
function oNum(v,fallback){const n=Number(v);return Number.isFinite(n)?n:fallback}
function createController(cfg){
  const stage=cfg.stageElement,canvas=cfg.canvas;if(!stage||!canvas)throw new Error('in-pitch choice UI requires stageElement and canvas');
  const rootEl=make('div','in-pitch-choice-layer');rootEl.hidden=true;
  const runArrows=make('div','in-pitch-run-layer');
  const targets=make('div','in-pitch-target-layer');
  const leader=make('div','in-pitch-choice-leader');leader.hidden=true;
  const menu=make('div','in-pitch-choice-menu');menu.hidden=true;menu.setAttribute('role','menu');
  const tooltip=make('div','in-pitch-choice-tooltip');tooltip.hidden=true;tooltip.setAttribute('role','tooltip');
  rootEl.append(runArrows,targets,leader,menu,tooltip);stage.appendChild(rootEl);
  let pending=null,snapshot=null,selectedId=null,switchToken=0,locked=false,menuGeneration=0,menuArmAt=0,pointerCommit=null;
  function heroId(){return typeof cfg.getHeroId==='function'?cfg.getHeroId():cfg.heroId}
  function project(p){return cfg.projectPlayer(p)}
  function getGroups(){return groupOptions(pending?.options||[],heroId(),snapshot?.players||[])}
  function hideTooltip(){tooltip.hidden=true;tooltip.textContent=''}
  function resetPointerCommit(){pointerCommit=null}
  function hideMenu(immediate=false){
    hideTooltip();resetPointerCommit();switchToken++;selectedId=null;targets.querySelectorAll('.in-pitch-target.selected').forEach(e=>e.classList.remove('selected'));leader.hidden=true;
    if(immediate){menu.hidden=true;menu.classList.remove('open','closing');menu.innerHTML='';return}
    if(menu.hidden)return;menu.classList.remove('open');menu.classList.add('closing');
    const token=switchToken;setTimeout(()=>{if(token===switchToken){menu.hidden=true;menu.classList.remove('closing');menu.innerHTML=''}},90);
  }
  function shortLabel(o){const raw=String(o?.label||o?.id||'선택');return raw.split('→')[0].trim()||raw}
  function showTooltipFor(button,text){
    if(!text||matchMedia('(hover: none)').matches)return;tooltip.textContent=text;tooltip.hidden=false;
    const br=button.getBoundingClientRect(),sr=stage.getBoundingClientRect(),tw=Math.min(300,Math.max(180,tooltip.offsetWidth||240)),th=tooltip.offsetHeight||70;
    let left=br.left-sr.left+(br.width-tw)/2,top=br.top-sr.top-th-8;left=clamp(left,8,Math.max(8,sr.width-tw-8));if(top<8)top=clamp(br.bottom-sr.top+8,8,Math.max(8,sr.height-th-8));
    tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
  }
  function commitChoice(o,anchorId,generation,inputKind){
    if(locked||generation!==menuGeneration||performance.now()<menuArmAt)return;
    const gestureId=`IP-${generation}-${Math.round(performance.now()*1000)}`;
    cfg.onChoose(o.id,o.targetId,{source:'USER_UI_CLICK_IN_PITCH',anchorPlayerId:anchorId,confirmedAction:true,actionGestureId:gestureId,inputKind});
  }
  function buildMenu(anchorId,options){
    menu.innerHTML='';menuGeneration++;const generation=menuGeneration;menuArmAt=performance.now()+130;resetPointerCommit();
    const player=(snapshot?.players||[]).find(p=>p.id===anchorId),hero=(snapshot?.players||[]).find(p=>p.id===heroId());
    const title=make('div','in-pitch-choice-title');title.textContent=player?(player.id===heroId()?`내 선수 · ${player.slot||player.role}`:(hero&&player.team===hero.team?`같은 팀 ${player.slot||player.role}`:`상대 ${player.slot||player.role}`)):'선택';menu.appendChild(title);
    const grid=make('div','in-pitch-choice-grid');
    for(const o of options){
      const b=make('button','in-pitch-choice-option');b.type='button';b.setAttribute('role','menuitem');const offsideRisk=!!o.meta?.offsideRisk,baseTip=o.tooltip||o.hint||'',tip=o.recommended?`추천 행동\n${baseTip}`:baseTip;
      b.dataset.choiceId=o.id||'';b.dataset.targetId=o.targetId||'';b.dataset.tooltip=tip;b.dataset.recommended=o.recommended?'true':'false';b.dataset.offsideRisk=offsideRisk?'true':'false';b.classList.toggle('recommended',!!o.recommended);b.setAttribute('aria-label',`${shortLabel(o)}${o.recommended?' · 추천 행동':''}`);b.textContent=shortLabel(o);
      b.addEventListener('mouseenter',()=>showTooltipFor(b,tip));b.addEventListener('mouseleave',hideTooltip);b.addEventListener('focus',()=>showTooltipFor(b,tip));b.addEventListener('blur',hideTooltip);
      b.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();if(locked||generation!==menuGeneration||performance.now()<menuArmAt){resetPointerCommit();return;}pointerCommit={pointerId:ev.pointerId,generation,choiceId:o.id,targetId:o.targetId||null,button:b};});
      b.addEventListener('pointerup',ev=>{ev.preventDefault();ev.stopPropagation();const c=pointerCommit;resetPointerCommit();if(!c||c.pointerId!==ev.pointerId||c.generation!==generation||c.button!==b)return;commitChoice(o,anchorId,generation,ev.pointerType||'pointer');});
      b.addEventListener('pointercancel',resetPointerCommit);
      b.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();});
      b.addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&!locked){ev.preventDefault();ev.stopPropagation();commitChoice(o,anchorId,generation,'keyboard');}});
      grid.appendChild(b);
    }
    menu.appendChild(grid);
  }
  function avoidanceSegments(anchorId,options){
    if(!snapshot)return[];const players=snapshot.players||[],hero=players.find(p=>p.id===heroId()),anchor=players.find(p=>p.id===anchorId);if(!hero||!anchor)return[];
    const hp=project(hero),ap=project(anchor),segments=[];
    if(anchorId!==hero.id){
      segments.push({x1:hp.x,y1:hp.y,x2:ap.x,y2:ap.y,pad:26,weight:2200});
      const runOpt=(options||[]).find(o=>o.id==='THROUGH_PASS'&&Number.isFinite(o.meta?.leadX)&&Number.isFinite(o.meta?.leadY));
      const attackingDir=hero.team==='HOME'?1:-1,leadWorld=runOpt?{x:oNum(runOpt.meta.leadX,anchor.x),y:oNum(runOpt.meta.leadY,anchor.y)}:{...anchor,x:clamp(anchor.x+attackingDir*12,1,104),y:anchor.y},lp=project(leadWorld);
      if((options||[]).some(o=>['THROUGH_PASS','AVAILABLE_PASS','PROGRESSIVE_PASS','SWITCH_PASS'].includes(o.id)))segments.push({x1:ap.x,y1:ap.y,x2:lp.x,y2:lp.y,pad:23,weight:1600});
    }else if((options||[]).some(o=>['SHOT','CARRY','TAKE_ON'].includes(o.id))){
      const goalWorld={...hero,x:hero.team==='HOME'?104:1,y:34},gp=project(goalWorld);segments.push({x1:hp.x,y1:hp.y,x2:gp.x,y2:gp.y,pad:34,weight:2500});
    }
    return segments;
  }
  function positionMenu(anchorId){
    if(menu.hidden||!snapshot)return;const p=(snapshot.players||[]).find(x=>x.id===anchorId);if(!p)return;
    const g=getGroups().find(x=>x.anchorId===anchorId),pt=project(p),stageRect=stage.getBoundingClientRect(),bounds={left:8,top:8,right:stageRect.width-8,bottom:stageRect.height-8},size={width:menu.offsetWidth||180,height:menu.offsetHeight||80};
    const blockers=[...targets.querySelectorAll('.in-pitch-target')].filter(e=>e.dataset.playerId!==anchorId).map(e=>{const r=e.getBoundingClientRect();return{left:r.left-stageRect.left,top:r.top-stageRect.top,right:r.right-stageRect.left,bottom:r.bottom-stageRect.top};});
    const place=choosePlacement(pt,size,bounds,blockers,avoidanceSegments(anchorId,g?.options||[]));menu.style.left=`${place.left}px`;menu.style.top=`${place.top}px`;
    const menuCenter={x:place.left+size.width/2,y:place.top+size.height/2},dx=menuCenter.x-pt.x,dy=menuCenter.y-pt.y,dist=Math.hypot(dx,dy),preferredLeft=pt.x+20,preferredTop=pt.y-size.height/2;
    const displaced=place.name!=='RIGHT'||Math.abs(place.left-preferredLeft)>3||Math.abs(place.top-preferredTop)>3;
    if(displaced&&dist>38){leader.hidden=false;leader.style.left=`${pt.x}px`;leader.style.top=`${pt.y}px`;leader.style.width=`${Math.max(8,dist-18)}px`;leader.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;}else leader.hidden=true;
  }
  function selectTarget(anchorId){
    hideTooltip();if(locked||!pending||!snapshot)return;const g=getGroups().find(x=>x.anchorId===anchorId);if(!g)return;const token=++switchToken;
    targets.querySelectorAll('.in-pitch-target').forEach(e=>e.classList.toggle('selected',e.dataset.playerId===anchorId));
    const swap=()=>{if(token!==switchToken)return;selectedId=anchorId;buildMenu(anchorId,g.options);menu.hidden=false;menu.classList.remove('closing','open');requestAnimationFrame(()=>{if(token!==switchToken)return;positionMenu(anchorId);menu.classList.add('open')});};
    if(!menu.hidden&&selectedId&&selectedId!==anchorId){menu.classList.remove('open');menu.classList.add('closing');leader.hidden=true;setTimeout(swap,90)}else swap();
  }
  function renderRunArrows(){
    runArrows.innerHTML='';if(!pending||!snapshot)return;const players=new Map((snapshot.players||[]).map(p=>[p.id,p])),seen=new Set();
    for(const o of pending.options||[]){
      if(o.id!=='THROUGH_PASS'||!o.targetId||seen.has(o.targetId)||!Number.isFinite(o.meta?.leadX)||!Number.isFinite(o.meta?.leadY))continue;
      const p=players.get(o.targetId);if(!p)continue;const a=project(p),b=project({x:Number(o.meta.leadX),y:Number(o.meta.leadY)}),dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy);if(dist<14)continue;seen.add(o.targetId);
      const line=make('div','in-pitch-run-arrow');line.dataset.playerId=o.targetId;line.style.left=`${a.x}px`;line.style.top=`${a.y}px`;line.style.width=`${dist}px`;line.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;runArrows.appendChild(line);
    }
  }
  function renderTargets(){
    targets.innerHTML='';if(!pending||!snapshot)return;const players=new Map((snapshot.players||[]).map(p=>[p.id,p]));
    for(const g of getGroups()){
      const p=players.get(g.anchorId);if(!p)continue;const pt=project(p),b=make('button','in-pitch-target'),hasOffsideRisk=(g.options||[]).some(o=>o.meta?.offsideRisk);b.type='button';b.dataset.playerId=p.id;b.dataset.offsideRisk=hasOffsideRisk?'true':'false';b.setAttribute('aria-label',`${p.slot||p.role} 선택지 보기`);b.title='선택지 보기';b.style.left=`${pt.x}px`;b.style.top=`${pt.y}px`;
      const ring=make('span','in-pitch-target-ring');b.append(ring);
      b.addEventListener('pointerup',ev=>{ev.preventDefault();ev.stopPropagation();if(locked)return;selectTarget(p.id)});b.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();});targets.appendChild(b);
    }
  }
  function update(nextSnapshot){snapshot=nextSnapshot||snapshot;if(rootEl.hidden||!pending||!snapshot)return;renderRunArrows();renderTargets();if(selectedId){const exists=getGroups().some(g=>g.anchorId===selectedId);if(exists){[...targets.querySelectorAll('.in-pitch-target')].find(e=>e.dataset.playerId===selectedId)?.classList.add('selected');positionMenu(selectedId)}else hideMenu(true)}}
  function show(nextPending,nextSnapshot){pending=nextPending;snapshot=nextSnapshot;selectedId=null;locked=false;rootEl.hidden=false;menu.hidden=true;menu.innerHTML='';leader.hidden=true;resetPointerCommit();renderRunArrows();renderTargets();
    // R19 severe UX guard: if the live decision contains SHOT, the on-ball hero must not
    // require a second discovery step before the user can even see that shooting is available.
    // Open the hero's self-action menu, but never commit or preselect an action. Other target
    // rings remain available and exact choiceId/targetId authority is unchanged.
    const hg=getGroups().find(g=>g.anchorId===heroId());
    if(hg?.options?.some(o=>o.id==='SHOT'))requestAnimationFrame(()=>{if(pending&&!locked)selectTarget(heroId())});
  }
  function hide(){pending=null;snapshot=null;selectedId=null;locked=false;rootEl.hidden=true;runArrows.innerHTML='';targets.innerHTML='';hideMenu(true)}
  function setLocked(v){locked=!!v;rootEl.classList.toggle('locked',locked);if(locked)resetPointerCommit()}
  function state(){return{version:API_VERSION,visible:!rootEl.hidden,selectedId,locked,menuGeneration,groups:getGroups().map(g=>({anchorId:g.anchorId,options:g.options.map(o=>({id:o.id,targetId:o.targetId,label:o.label,recommended:!!o.recommended}))}))}}
  stage.addEventListener('pointerdown',ev=>{if(rootEl.hidden||locked||menu.hidden)return;if(ev.target.closest?.('.in-pitch-target,.in-pitch-choice-menu,.in-pitch-choice-tooltip'))return;hideMenu(false);});
  window.addEventListener('resize',()=>{if(!rootEl.hidden&&snapshot)update(snapshot)});
  return{show,hide,update,selectTarget,setLocked,state};
}
const api={version:API_VERSION,resolveAnchorId,groupOptions,choosePlacement,createController};root.FLRPG_IN_PITCH_CHOICE_UI=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
