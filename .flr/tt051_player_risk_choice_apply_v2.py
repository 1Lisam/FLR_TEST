#!/usr/bin/env python3
import re,sys
from pathlib import Path

if len(sys.argv)<2: raise SystemExit('WORKDIR_REQUIRED')
root=Path(sys.argv[1]).resolve()

def edit(rel,fn):
 p=root/rel;s=p.read_text(encoding='utf-8');n=fn(s)
 if n==s: raise SystemExit(f'NO_CHANGE:{rel}')
 p.write_text(n,encoding='utf-8')

def one(s,old,new,label):
 if s.count(old)!=1: raise SystemExit(f'{label}:count={s.count(old)}')
 return s.replace(old,new,1)

def core_patch(s):
 s=one(s,'function passOptions(m,owner,allowMarginalOffside=false){','function passOptions(m,owner,offsideMode=false){','passOptions signature')
 old="""    let marginalTimingError=false;
    if(offsideMargin>0){
      if(!allowMarginalOffside||!running||offsideMargin>0.85)continue;
      if(p.tacticalTask==='ST_RELEASE_RUN')marginalTimingError=true;
      else{
        const timingSkill=(abilityValue(m,owner,'vision')+abilityValue(m,p,'off_ball'))/2,mistakeP=clamp(0.13-(timingSkill-60)*0.0012,0.045,0.20),roll=(hash32(`${m.seed}|OFFSIDE_TIMING|${Math.floor(m.time*5)}|${owner.id}|${p.id}`)%10000)/10000;
        if(roll>mistakeP)continue;marginalTimingError=true;
      }
    }
"""
 new="""    let marginalTimingError=false;
    if(offsideMargin>0){
      const playerChoice=offsideMode==='PLAYER';
      if(playerChoice){
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
"""
 s=one(s,old,new,'offside player mode')
 # Only player inspection changes to deterministic PLAYER mode. NPC chooseOwnerAction keeps true/RNG.
 marker='function inspectChoiceState(m,playerId)';i=s.index(marker);j=s.index('\n  }\n  const ballOwner=',i);seg=s[i:j]
 if seg.count('passOptions(m,owner,true)')!=1: raise SystemExit('inspect passOptions mismatch')
 seg=seg.replace('passOptions(m,owner,true)',"passOptions(m,owner,'PLAYER')",1);s=s[:i]+seg+s[j:]
 oldline="const runTasks=new Set(['CHASE_THROUGH','MOVE_TO_RECEIVE','OVERLAP','UNDERLAP','BALANCED_OVERLAP','THIRD_MAN_RUN','FAR_SIDE_RUN','PIN_AND_RUN','INSIDE_CHANNEL','BOX_EDGE_ARRIVAL','BOX_CHANNEL_RUN','LATE_BOX_ARRIVAL','PENALTY_SPOT_RUN','ATTACK_NEAR_POST','ATTACK_BACK_POST','ATTACK_OPEN_CHANNEL','FB_OVERLAP_SURGE','FB_UNDERLAP_SURGE','ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','ST_WALL_SUPPORT','POST_PASS_CONTINUE_RUN']);"
 newline=oldline.replace("'FAR_SIDE_RUN','PIN_AND_RUN'","'FAR_SIDE_RUN','FAR_SIDE_SHOULDER','PIN_AND_RUN'")
 s=one(s,oldline,newline,'pass runTasks')
 pat=re.compile(r"    const physicalPasses=opts\.filter\(o=>o\.block===0&&!represented\.has\(o\.p\.id\).*?\);\n")
 m=pat.search(s)
 if not m: raise SystemExit('physicalPasses not found')
 repl="""    const oRisk=o=>(o.offsideRisk?3:0)+(o.running?1.5:0)+(['ST','WF'].includes(o.p.role)?1:0)+(o.block>0?0.5:0);
    const physicalPasses=opts.filter(o=>o.block<=1&&!represented.has(o.p.id)&&o.d<=42&&o.forward>-6.0&&o.open>=0.35&&['ST','WF','CM','FB'].includes(o.p.role)).sort((a,b)=>{const ar=oRisk(a),br=oRisk(b);return br-ar||(b.forward-a.forward)||(b.score-a.score)}).slice(0,3).map(o=>({id:'AVAILABLE_PASS',score:Number((o.score-0.45).toFixed(3)),reason:'physically_available_receiver',meta:{targetId:o.p.id,targetSlot:o.p.slot,forward:o.forward,d:o.d,receiverPressure:o.open,contested:o.open<1.8||o.block>0,laneBlockers:o.block,offsideRisk:!!o.offsideRisk,offsideMargin:Number(o.offsideMargin||0)}}));
"""
 s=s[:m.start()]+repl+s[m.end():]
 s=one(s,"if(c.id==='AVAILABLE_PASS'){const o=optionById(opts,c.meta?.targetId);if(o&&o.block===0)return{type:'PASS',target:o.p,kind:o.d>31?'LONG_PASS':'PASS',option:o,reason:'USER_AVAILABLE_PASS'};}","if(c.id==='AVAILABLE_PASS'){const o=optionById(opts,c.meta?.targetId);if(o&&o.block<=1)return{type:'PASS',target:o.p,kind:o.d>31?'LONG_PASS':'PASS',option:o,reason:'USER_AVAILABLE_PASS'};}",'available pass execution')
 return s

def tactics_patch(s):
 s=one(s,"['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','FAR_SIDE_RUN','FAR_SIDE_HOLD','FAR_SIDE_RECOVER']","['ST_RELEASE_RUN','WIDE_RELEASE_OUTLET','FAR_SIDE_RUN','FAR_SIDE_HOLD','FAR_SIDE_SHOULDER','FAR_SIDE_RECOVER']",'release stable tasks')
 old="const wanted=clamp(progress+8,82,91.5),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*16.0,runAlive=x>local.x+.85,recover=local.x>safeX+.18;\n      return{lx:runAlive?x:recover?safeX:Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':'FAR_SIDE_HOLD',sprint:runAlive||recover};"
 new="const wanted=clamp(progress+8,82,91.5),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*16.0,runAlive=x>local.x+.85,over=local.x-safeX,marginalShoulder=over>.18&&over<=1.55,recover=over>1.55;\n      return{lx:runAlive?x:recover?safeX:marginalShoulder?Math.min(local.x,safeX+1.35):Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':marginalShoulder?'FAR_SIDE_SHOULDER':'FAR_SIDE_HOLD',sprint:runAlive||recover};"
 s=one(s,old,new,'final third shoulder')
 old="if(!ss&&progress>48){const wanted=Math.max(front+5,progress+8),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*(18.5*pr.wingerWidth),runAlive=x>local.x+.85,recover=local.x>safeX+.18;return{lx:runAlive?x:recover?safeX:Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':'FAR_SIDE_HOLD',sprint:runAlive||recover};}"
 new="if(!ss&&progress>48){const wanted=Math.max(front+5,progress+8),safeX=safeForwardLocal(m,p,wanted),x=releaseForwardLocal(m,p,wanted),y=34+sg*(18.5*pr.wingerWidth),runAlive=x>local.x+.85,over=local.x-safeX,marginalShoulder=over>.18&&over<=1.55,recover=over>1.55;return{lx:runAlive?x:recover?safeX:marginalShoulder?Math.min(local.x,safeX+1.35):Math.max(local.x,x),ly:y,task:runAlive?'FAR_SIDE_RUN':recover?'FAR_SIDE_RECOVER':marginalShoulder?'FAR_SIDE_SHOULDER':'FAR_SIDE_HOLD',sprint:runAlive||recover};}"
 return one(s,old,new,'general shoulder')

def ctl_patch(s):
 s=one(s,"if(c.id==='THROUGH_PASS')return c.meta?.offsideRisk?'높음':'보통';","if(c.id==='THROUGH_PASS')return'보통';",'through risk')
 s=one(s,"loss=c.meta?.offsideRisk?'침투 타이밍이 경계선에 있어 실제 패스 순간 오프사이드가 될 위험이 큼':'패스가 너무 길거나 타이밍이 어긋나면 차단·오프사이드 위험이 생길 수 있음';","loss='패스가 너무 길거나 타이밍이 어긋나면 차단되거나 오프사이드가 선언될 수 있음';",'through tooltip')
 needle="""  // A real, unblocked pass option must not disappear merely because the NPC score
  // strongly prefers shooting/carrying. Player choice availability != NPC preference.
"""
 insert="""  // PLAYER risk floor: preserve a marginal-offside / contested attacking pass when the geometry is executable.
  const riskyPhysical=ranked.filter(c=>(c.id==='AVAILABLE_PASS'||(c.id==='THROUGH_PASS'&&c.meta?.offsideRisk))&&(c.meta?.offsideRisk||c.meta?.laneBlockers>0||c.meta?.contested)&&Number(c.meta?.forward??c.meta?.leadForward??-99)>0).sort((a,b)=>(Number(b.meta?.offsideRisk)-Number(a.meta?.offsideRisk))+(Number(b.meta?.forward??b.meta?.leadForward??0)-Number(a.meta?.forward??a.meta?.leadForward??0))*.03).slice(0,2);
  for(const risky of riskyPhysical){
    if(out.some(o=>o.family==='패스'&&o.targetId===risky.targetId))continue;
    if(out.length>=6){const ix=out.findIndex(o=>o.id==='HOLD'||o.id==='RECYCLE'||o.id==='CARRY');if(ix>=0)out.splice(ix,1);}
    if(out.length<6){const row={id:risky.id,targetId:risky.targetId||null,targetName:risky.targetName||null,family:'패스',label:labelFor(risky),meta:risky.meta?deep(risky.meta):null};row.hint=tooltipFor(risky,frame);row.tooltip=row.hint;out.push(row);}
  }
"""
 return one(s,needle,insert+needle,'risk floor insert')

edit('runtime/continuous_match_core.js',core_patch)
edit('runtime/tactical_movement.js',tactics_patch)
edit('runtime/protagonist_match_controller.js',ctl_patch)
print('TT-0.51 player-risk choice v2 applied')
