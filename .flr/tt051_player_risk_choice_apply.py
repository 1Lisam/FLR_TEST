#!/usr/bin/env python3
from pathlib import Path

ROOT=Path('.')

def replace_once(path,old,new):
    p=ROOT/path
    s=p.read_text(encoding='utf-8')
    if old not in s:
        raise SystemExit(f'MISSING_PATTERN: {path}: {old[:120]!r}')
    if s.count(old)!=1:
        raise SystemExit(f'NON_UNIQUE_PATTERN: {path}: count={s.count(old)}')
    p.write_text(s.replace(old,new,1),encoding='utf-8')

replace_once(Path('runtime/continuous_match_core.js'),
"function passOptions(m,owner,allowMarginalOffside=false){",
"function passOptions(m,owner,offsideMode=false){")
replace_once(Path('runtime/continuous_match_core.js'),
"""    let marginalTimingError=false;
    if(offsideMargin>0){
      if(!allowMarginalOffside||!running||offsideMargin>0.85)continue;
      if(p.tacticalTask==='ST_RELEASE_RUN')marginalTimingError=true;
      else{
        const timingSkill=(abilityValue(m,owner,'vision')+abilityValue(m,p,'off_ball'))/2,mistakeP=clamp(0.13-(timingSkill-60)*0.0012,0.045,0.20),roll=(hash32(`${m.seed}|OFFSIDE_TIMING|${Math.floor(m.time*5)}|${owner.id}|${p.id}`)%10000)/10000;
        if(roll>mistakeP)continue;marginalTimingError=true;
      }
    }
""",
"""    let marginalTimingError=false;
    if(offsideMargin>0){
      const playerChoice=offsideMode==='PLAYER';
      if(playerChoice){
        // The player, not candidate filtering, judges a close offside line. A moving runner may
        // be a little farther over the shoulder than a stationary receiver; clearly detached
        // attackers are still removed so the menu does not fill with physically absurd passes.
        const playerMargin=running?1.75:1.15,roleEligible=['ST','WF','CM','FB'].includes(p.role);
        if(!roleEligible||offsideMargin>playerMargin)continue;
        marginalTimingError=true;
      }else{
        if(!offsideMode||!running||offsideMargin>0.85)continue;
        if(p.tacticalTask==='ST_RELEASE_RUN')marginalTimingError=true;
        else{
          const timingSkill=(abilityValue(m,owner,'vision')+abilityValue(m,p,'off_ball'))/2,mistakeP=clamp(0.13-(timingSkill-60)*0.0012,0.045,0.20),roll=(hash32(`${m.seed}|OFFSIDE_TIMING|${Math.floor(m.time*5)}|${owner.id}|${p.id}`)%10000)/10000;
          if(roll>mistakeP)continue;marginalTimingError=true;
        }
      }
    }
""")
replace_once(Path('runtime/continuous_match_core.js'),
"const local=worldToLocal(owner.team,owner.x,owner.y),pressure=ballCarrierPressureDistance(m,owner),space=forwardSpace(m,owner,13),shot=shotAssessment(m,owner),opts=passOptions(m,owner,true),held=Math.max(0,m.time-(owner.controlledSince||m.time)),deep=finalThirdDelivery(m,owner),early=earlyCrossDelivery(m,owner),takeOn=takeOnOpportunity(m,owner,shot,held),ctx=candidateContext(m,owner,shot,opts,pressure,space,held,deep,early,takeOn),ranked=candidateRank(m,owner,ctx);",
"const local=worldToLocal(owner.team,owner.x,owner.y),pressure=ballCarrierPressureDistance(m,owner),space=forwardSpace(m,owner,13),shot=shotAssessment(m,owner),opts=passOptions(m,owner,'PLAYER'),held=Math.max(0,m.time-(owner.controlledSince||m.time)),deep=finalThirdDelivery(m,owner),early=earlyCrossDelivery(m,owner),takeOn=takeOnOpportunity(m,owner,shot,held),ctx=candidateContext(m,owner,shot,opts,pressure,space,held,deep,early,takeOn),ranked=candidateRank(m,owner,ctx);")
replace_once(Path('runtime/continuous_match_core.js'),
"""    const physicalPasses=opts.filter(o=>o.block===0&&!represented.has(o.p.id)&&o.d<=38&&o.forward>-2.0&&o.open>=0.72&&['ST','WF','CM','FB'].includes(o.p.role)).sort((a,b)=>{const aw=['ST','WF'].includes(a.p.role)?1:0,bw=['ST','WF'].includes(b.p.role)?1:0;return bw-aw||(b.forward-a.forward)||(b.score-a.score)}).slice(0,3).map(o=>({id:'AVAILABLE_PASS',score:Number((o.score-0.45).toFixed(3)),reason:'physically_available_receiver',meta:{targetId:o.p.id,targetSlot:o.p.slot,forward:o.forward,d:o.d,receiverPressure:o.open,contested:o.open<1.8}}));
""",
"""    // PLAYER choice floor: low expected success does not erase a physically plausible pass.
    const oRisk=o=>(o.offsideRisk?3:0)+(o.running?1.5:0)+(['ST','WF'].includes(o.p.role)?1:0)+(o.block>0?0.5:0);
    const physicalPasses=opts.filter(o=>o.block<=1&&!represented.has(o.p.id)&&o.d<=42&&o.forward>-6.0&&o.open>=0.35&&['ST','WF','CM','FB'].includes(o.p.role)).sort((a,b)=>{const ar=oRisk(a),br=oRisk(b);return br-ar||(b.forward-a.forward)||(b.score-a.score)}).slice(0,3).map(o=>({id:'AVAILABLE_PASS',score:Number((o.score-0.45).toFixed(3)),reason:'physically_available_receiver',meta:{targetId:o.p.id,targetSlot:o.p.slot,forward:o.forward,d:o.d,receiverPressure:o.open,contested:o.open<1.8||o.block>0,laneBlockers:o.block,offsideRisk:!!o.offsideRisk,offsideMargin:Number(o.offsideMargin||0)}}));
""")
replace_once(Path('runtime/continuous_match_core.js'),
"if(c.id==='AVAILABLE_PASS'){const o=optionById(opts,c.meta?.targetId);if(o&&o.block===0)return{type:'PASS',target:o.p,kind:o.d>31?'LONG_PASS':'PASS',option:o,reason:'USER_AVAILABLE_PASS'};}",
"if(c.id==='AVAILABLE_PASS'){const o=optionById(opts,c.meta?.targetId);if(o&&o.block<=1)return{type:'PASS',target:o.p,kind:o.d>31?'LONG_PASS':'PASS',option:o,reason:'USER_AVAILABLE_PASS'};}")

replace_once(Path('runtime/tactical_movement.js'),
"['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','FAR_SIDE_RUN','FAR_SIDE_HOLD','FAR_SIDE_RECOVER']",
"['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','FAR_SIDE_RUN','FAR_SIDE_HOLD','FAR_SIDE_SHOULDER','FAR_SIDE_RECOVER']")
replace_once(Path('runtime/tactical_movement.js'),
"""const wanted=clamp(progress+8,82,91.5),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*16.0,runAlive=x>local.x+.85,recover=local.x>safeX+.18;
      return{lx:runAlive?x:recover?safeX:Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':'FAR_SIDE_HOLD',sprint:runAlive||recover};""",
"""const wanted=clamp(progress+8,82,91.5),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*16.0,runAlive=x>local.x+.85,over=local.x-safeX,marginalShoulder=over>.18&&over<=1.55,recover=over>1.55;
      return{lx:runAlive?x:recover?safeX:marginalShoulder?Math.min(local.x,safeX+1.35):Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':marginalShoulder?'FAR_SIDE_SHOULDER':'FAR_SIDE_HOLD',sprint:runAlive||recover};""")
replace_once(Path('runtime/tactical_movement.js'),
"""if(!ss&&progress>48){const wanted=Math.max(front+5,progress+8),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*(18.5*pr.wingerWidth),runAlive=x>local.x+.85,recover=local.x>safeX+.18;return{lx:runAlive?x:recover?safeX:Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':'FAR_SIDE_HOLD',sprint:runAlive||recover};}""",
"""if(!ss&&progress>48){const wanted=Math.max(front+5,progress+8),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*(18.5*pr.wingerWidth),runAlive=x>local.x+.85,over=local.x-safeX,marginalShoulder=over>.18&&over<=1.55,recover=over>1.55;return{lx:runAlive?x:recover?safeX:marginalShoulder?Math.min(local.x,safeX+1.35):Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':marginalShoulder?'FAR_SIDE_SHOULDER':'FAR_SIDE_HOLD',sprint:runAlive||recover};}""")
replace_once(Path('runtime/continuous_match_core.js'),
"'THIRD_MAN_RUN','FAR_SIDE_RUN','PIN_AND_RUN'",
"'THIRD_MAN_RUN','FAR_SIDE_RUN','FAR_SIDE_SHOULDER','PIN_AND_RUN'")

replace_once(Path('runtime/protagonist_match_controller.js'),
"if(c.id==='THROUGH_PASS')return c.meta?.offsideRisk?'높음':'보통';",
"if(c.id==='THROUGH_PASS')return'보통';")
replace_once(Path('runtime/protagonist_match_controller.js'),
"loss=c.meta?.offsideRisk?'침투 타이밍이 경계선에 있어 실제 패스 순간 오프사이드가 될 위험이 큼':'패스가 너무 길거나 타이밍이 어긋나면 차단·오프사이드 위험이 생길 수 있음';",
"loss='패스가 너무 길거나 타이밍이 어긋나면 차단되거나 오프사이드가 선언될 수 있음';")
needle="""  // A real, unblocked pass option must not disappear merely because the NPC score
  // strongly prefers shooting/carrying. Player choice availability != NPC preference.
"""
insert="""  // PLAYER risk floor: preserve a marginal-offside / contested attacking pass when the
  // geometry is still executable. Do not display an offside badge or probability: the player
  // reads the line from the scene and the actual law is resolved at ball release.
  const riskyPhysical=ranked.filter(c=>(c.id==='AVAILABLE_PASS'||(c.id==='THROUGH_PASS'&&c.meta?.offsideRisk))&&(c.meta?.offsideRisk||c.meta?.laneBlockers>0||c.meta?.contested)&&Number(c.meta?.forward??c.meta?.leadForward??-99)>0).sort((a,b)=>(Number(b.meta?.offsideRisk)-Number(a.meta?.offsideRisk))+(Number(b.meta?.forward??b.meta?.leadForward??0)-Number(a.meta?.forward??a.meta?.leadForward??0))*.03).slice(0,2);
  for(const risky of riskyPhysical){
    if(out.some(o=>o.family==='패스'&&o.targetId===risky.targetId))continue;
    if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='RECYCLE'||o.id==='CARRY');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const row={id:risky.id,targetId:risky.targetId||null,targetName:risky.targetName||null,family:'패스',label:labelFor(risky),meta:risky.meta?deep(risky.meta):null};row.hint=tooltipFor(risky,frame);row.tooltip=row.hint;out.push(row);}
  }
"""
replace_once(Path('runtime/protagonist_match_controller.js'),needle,insert+needle)

print('TT-0.51 player-risk choice patch applied')
