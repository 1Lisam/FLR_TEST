from pathlib import Path


def replace_exact(path, old, new, label):
    p=Path(path)
    s=p.read_text(encoding='utf-8')
    n=s.count(old)
    if n!=1:
        raise SystemExit(f'{label}: expected 1 match, got {n}')
    p.write_text(s.replace(old,new,1),encoding='utf-8')

# High-resolution tactical authority.
p='runtime/tactical_movement.js'
replace_exact(p,
"  const wideThreat=(owner.role==='WF'||Math.abs(ball.y-34)>14.5)&&ball.x<34;",
"  const wideThreat=(owner.role==='WF'||Math.abs(ball.y-34)>14.5)&&ball.x<50;",
'expand wide FB responsibility window')
replace_exact(p,
"    if(fb&&fbD<=10.8){",
"    if(fb&&fbD<=15.5){",
'allow same-side FB to accept wide press earlier')
replace_exact(p,
"    if(d.role==='CM'&&a.role==='ST'&&ball.x<28&&Math.abs(al.y-34)<13)return false;\n    return true;",
"    if(d.role==='CM'&&a.role==='ST'&&ball.x<28&&Math.abs(al.y-34)<13)return false;\n    if(d.role==='CM'&&a.role==='WF'&&ball.x<36&&Math.abs(al.y-34)>14){\n      const fbSlot=al.y<34?'LB':'RB';\n      // A settled midfield line screens the cutback/second ball. It only inherits a wide\n      // runner when the same-side full-back is genuinely absent in transition.\n      if(!activeTransitionWideVacancy(m,team,fbSlot))return false;\n    }\n    return true;",
'keep settled CMs out of fullback man-marking')
replace_exact(p,
"  return{press:nearest,cover:candidates.find(c=>c.p.id!==nearest?.id)?.p||null,mode:'GENERIC'};",
"  // Generic phases are still role-aware. Distance is evidence, not authority: a wide\n  // carrier belongs to the same-side full-back first, while a central carrier is normally\n  // screened by midfield until he reaches the centre-back line. This prevents nearest-player\n  // fallback from turning CM/FB/CB into one roaming ball pack.\n  const genericWide=owner.role==='WF'||Math.abs(ball.y-34)>14.5,side=ball.y<34?-1:1;\n  const ranked=candidates.filter(c=>{\n    if(c.p.role==='ST'&&ball.x<45)return false;\n    if(c.p.role==='WF'&&ball.x<34)return false;\n    return true;\n  }).map(c=>{\n    const p=c.p,pside=sideSign(p.slot);let score=c.d;\n    if(genericWide){\n      if(p.role==='FB')score+=pside===side?-4.6:7.5;\n      else if(p.role==='CM')score+=(ball.x<38?3.8:1.5)+(pside&&pside!==side?4.0:0);\n      else if(p.role==='CB')score+=ball.x<28?2.0:4.5;\n      else score+=5.5;\n    }else{\n      if(p.role==='CM')score+=ball.x<25?1.2:-2.0;\n      else if(p.role==='CB')score+=ball.x<28?-2.2:1.8;\n      else if(p.role==='FB')score+=3.0;\n      else score+=3.8;\n    }\n    return{p,d:c.d,score};\n  }).sort((a,b)=>a.score-b.score||a.d-b.d);\n  const genericPress=ranked[0]?.p||nearest;\n  let genericCover=null;\n  if(genericPress){\n    const cbCover=field.filter(p=>p.role==='CB'&&p.id!==genericPress.id).map(p=>({p,d:dist(p,owner)})).sort((a,b)=>a.d-b.d)[0]?.p||null;\n    genericCover=(ball.x<42?cbCover:null)||ranked.find(c=>c.p.id!==genericPress.id)?.p||null;\n  }\n  return{press:genericPress,cover:genericCover,mode:genericWide?'GENERIC_WIDE_ROLE_AWARE':'GENERIC_ROLE_AWARE'};",
'role-aware generic defensive ownership')
replace_exact(p,
"      const screenGap=ball.x<25?5.4:6.2;\n      tx=Math.max(tx,backLineTargetX+screenGap);\n      // Do not launch the midfield beyond the live carrier; this is a layer guard, not a press.\n      tx=Math.min(tx,ball.x+5.0);",
"      const screenGap=ball.x<25?6.8:6.4,screenFloor=backLineTargetX+screenGap;\n      tx=Math.max(tx,screenFloor);\n      // Keep the midfield in front of the back four even when the carrier is already deeper\n      // than that layer. The previous Math.min could undo screenFloor and pull an 8 onto the CB line.\n      tx=Math.min(tx,Math.max(screenFloor,ball.x+5.0));",
'preserve midfield floor ahead of back line')
replace_exact(p,
"        const live=ws?.wide?liveSupportOffset(m,p,0.58,0.42):{x:0,y:0},x=clamp(progress-8+live.x,60,72),y=clamp(34+sg*(ws?.wide?8.5:10.0)+live.y,4,64);return{lx:x,ly:y,task:recover?'RECOVER_MIDFIELD_8':ws?.wide?'HALFSPACE_SECOND_WAVE':'SECOND_WAVE_8',sprint:Math.abs(local.x-x)>3.5||Math.abs(local.y-y)>4.5};",
"        const live=ws?.wide?liveSupportOffset(m,p,0.58,0.42):{x:0,y:0},x=clamp(progress-6+live.x,64,76),y=clamp(34+sg*(ws?.wide?8.5:10.0)+live.y,4,64);return{lx:x,ly:y,task:recover?'RECOVER_MIDFIELD_8':ws?.wide?'HALFSPACE_SECOND_WAVE':'SECOND_WAVE_8',sprint:Math.abs(local.x-x)>3.5||Math.abs(local.y-y)>4.5};",
'advance primary 8 second wave')
replace_exact(p,
"      const live=liveSupportOffset(m,p,0.54,0.40),x=clamp(progress-13+live.x,66,76),y=clamp(34+sg*9.5+live.y,4,64);return{lx:x,ly:y,task:recover?'RECOVER_MIDFIELD_8':'BOX_EDGE_SUPPORT',sprint:Math.abs(local.x-x)>3.2};",
"      const live=liveSupportOffset(m,p,0.54,0.40),x=clamp(progress-10+live.x,70,80),y=clamp(34+sg*9.5+live.y,4,64);return{lx:x,ly:y,task:recover?'RECOVER_MIDFIELD_8':'BOX_EDGE_SUPPORT',sprint:Math.abs(local.x-x)>3.2};",
'advance primary 8 box-edge support')
replace_exact(p,
"      const ws=sameSideWingerState(m,p.team,p.slot),live=ws?.wide?liveSupportOffset(m,p,0.52,0.38):{x:0,y:0},x=clamp(progress-9+live.x,58,70),y=clamp(34+sg*(ws?.wide?8.8:10.5)+live.y,4,64);return{lx:x,ly:y,task:recover?'RECONNECT_8':ws?.wide?'HALFSPACE_SECOND_LINE':'SECOND_LINE_SUPPORT',sprint:Math.abs(local.x-x)>4.0||Math.abs(local.y-y)>4.5};",
"      const ws=sameSideWingerState(m,p.team,p.slot),live=ws?.wide?liveSupportOffset(m,p,0.52,0.38):{x:0,y:0},x=clamp(progress-7+live.x,62,74),y=clamp(34+sg*(ws?.wide?8.8:10.5)+live.y,4,64);return{lx:x,ly:y,task:recover?'RECONNECT_8':ws?.wide?'HALFSPACE_SECOND_LINE':'SECOND_LINE_SUPPORT',sprint:Math.abs(local.x-x)>4.0||Math.abs(local.y-y)>4.5};",
'advance secondary 8 second line')
replace_exact(p,
"    const live=liveSupportOffset(m,p,0.48,0.36),x=clamp(progress-14+live.x,64,74),y=clamp(34+sg*9.0+live.y,4,64);return{lx:x,ly:y,task:recover?'RECONNECT_8':'CUTBACK_EDGE',sprint:Math.abs(local.x-x)>3.8};",
"    const live=liveSupportOffset(m,p,0.48,0.36),x=clamp(progress-11+live.x,68,78),y=clamp(34+sg*9.0+live.y,4,64);return{lx:x,ly:y,task:recover?'RECONNECT_8':'CUTBACK_EDGE',sprint:Math.abs(local.x-x)>3.8};",
'advance secondary 8 cutback/second-ball edge')

# Low-resolution Hybrid continuity: use the same responsibility idea before a 2D scene opens.
p='runtime/hybrid_spatial_intent_v2.js'
replace_exact(p,
"function pressLeash(role){return({ST:10.5,WF:12.5,CM:13.5,FB:14.5})[role]||12;}",
"function pressLeash(role){return({ST:10.5,WF:11.5,CM:10.8,FB:14.5})[role]||12;}",
'limit CM roaming press leash')
old="""  if(owner&&owner.team===opp){
    const ownerLocalX=team==='HOME'?owner.x:105-owner.x;
    const press=nearest(players,owner,p=>{
      if(p.team!==team||p.role==='GK'||!['CM','FB','WF','ST'].includes(p.role))return false;
      // The striker may lead a press high up the pitch, but must not be dragged into his
      // own defensive third simply because he became the nearest player after a transition.
      if(p.role==='ST'&&ownerLocalX<45)return false;
      if(p.role==='WF'&&ownerLocalX<30)return false;
      // A player who is already far outside his structural lane should recover rather than
      // earn a fresh licence to chase the ball even farther away.
      const base=shapeBase(state,p.id),anchorDist=dist(p,base);
      return anchorDist<=pressLeash(p.role)+4;
    });
    if(press&&press.d<=16)out.press=press.p.id;
  }
"""
new="""  if(owner&&owner.team===opp){
    const ol=local(team,owner.x,owner.y),wide=Math.abs(ol.y-34)>14.5,side=ol.y<34?-1:1;
    const ranked=teamPs.filter(p=>['CM','FB','WF','ST'].includes(p.role)).map(p=>{
      const base=shapeBase(state,p.id),anchorDist=dist(p,base),pside=['LB','LCM','LW'].includes(p.slot)?-1:['RB','RCM','RW'].includes(p.slot)?1:0;
      if(anchorDist>pressLeash(p.role)+4)return null;
      if(p.role==='ST'&&ol.x<45)return null;if(p.role==='WF'&&ol.x<30)return null;
      let score=dist(p,owner);
      if(wide){if(p.role==='FB')score+=pside===side?-4.2:7.0;else if(p.role==='CM')score+=(ol.x<38?3.5:1.4)+(pside&&pside!==side?4.0:0);else score+=5.0;}
      else{if(p.role==='CM')score-=1.8;else if(p.role==='FB')score+=2.5;else score+=2.8;}
      return{p,d:dist(p,owner),score};
    }).filter(Boolean).sort((a,b)=>a.score-b.score||a.d-b.d);
    const press=ranked[0];if(press&&press.d<=17)out.press=press.p.id;
  }
"""
replace_exact(p,old,new,'role-aware hybrid press selection')
replace_exact(p,
"      return{kind:'SUPPORT',target:capAround(base,blend(base,relation,.44),10),targetId:owner?.id||null,score:.78};",
"      return{kind:'SUPPORT',target:capAround(base,blend(base,relation,.60),13),targetId:owner?.id||null,score:.78};",
'raise ball-side hybrid 8 support')
replace_exact(p,
"    return{kind:'SUPPORT',target:capAround(base,blend(base,w,.36),10),targetId:null,score:.73};",
"    return{kind:'SUPPORT',target:capAround(base,blend(base,w,.50),13),targetId:null,score:.73};",
'raise far-side hybrid 8 support')

# HF3 developer scenarios: correct AWAY left/right world coordinates.
p='live_hybrid_session_v02.js'
replace_exact(p,
"[['A-LB',77,13],['A-LCB',80,27],['A-RCB',80,42],['A-RB',77,55]]",
"[['A-LB',77,55],['A-LCB',80,41],['A-RCB',80,27],['A-RB',77,13]]",
'correct pass-flight AWAY back four')
replace_exact(p,
"[['A-LB',82,13],['A-LCB',82.5,27],['A-RCB',83.2,42],['A-RB',81.5,56],['A-GK',99,34]]",
"[['A-LB',82,55],['A-LCB',82.5,41],['A-RCB',83.2,27],['A-RB',81.5,13],['A-GK',99,34]]",
'correct offside AWAY back four')
replace_exact(p,
"[['H-ST',84,34],['H-LW',82,17],['H-RW',82,51],['A-LCB',81,27],['A-RCB',81,41],['A-LB',79,14],['A-RB',79,54],['A-CM',72,34]]",
"[['H-ST',84,34],['H-LW',82,17],['H-RW',82,51],['A-LCB',81,41],['A-RCB',81,27],['A-LB',79,54],['A-RB',79,14],['A-CM',72,34]]",
'correct mark-stability AWAY back four')
replace_exact(p,
"[['A-LCB',82,27],['A-RCB',82,41],['A-RB',79,55],['H-RCM',73,46]]",
"[['A-LCB',82,41],['A-RCB',82,27],['A-RB',79,13],['H-RCM',73,46]]",
'correct striker-lane AWAY defenders')
replace_exact(p,
"[['A-LCB',82.2,30],['A-RCB',82.5,39],['H-LW',78,14],['H-RW',78,54],['H-CM',70,34]]",
"[['A-LCB',82.2,39],['A-RCB',82.5,29],['H-LW',78,14],['H-RW',78,54],['H-CM',70,34]]",
'correct shield-flow AWAY centre-backs')

# The scenario key was renamed for HF3, but the 2D authority still looked for the old name.
p='live_v06_scene_authority_browser.js'
replace_exact(p,
"boundary.developerScenario?.key==='OFFSIDE_REVIEW'",
"boundary.developerScenario?.key==='OFFSIDE_INVOLVEMENT'",
'align developer offside fast-path key')

print('V054_DEFENCE_NORMALIZATION_APPLIED')
