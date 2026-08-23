#!/usr/bin/env python3
import json, math, pathlib, sys

META = pathlib.Path(sys.argv[1])
REPORT_DIR = pathlib.Path(sys.argv[2])
OUT = pathlib.Path(sys.argv[3])
q = json.loads(META.read_text(encoding='utf-8'))
rows = ((q.get('result') or [{}])[0].get('results') or [])
rows = [r for r in rows if r.get('build') == 'USER-MATCH-TEST-V0.4']

def n(v, default=None):
    try: return float(v)
    except: return default

def angdiff(a,b):
    d=(b-a)%(math.pi*2)
    if d>math.pi: d-=math.pi*2
    return d

def frames_of(s):
    if not isinstance(s,dict): return []
    hr=s.get('highResolution') or {}
    for k in ('episodeFrames','postActionFrames','preActionFrames'):
        f=hr.get(k)
        if isinstance(f,list) and len(f)>=2: return f
    return []

def event_list(s):
    if not isinstance(s,dict): return []
    hr=s.get('highResolution') or {}
    e=hr.get('actualEvents')
    return e if isinstance(e,list) else []

def nearest_frame(frames,t):
    if not frames or t is None: return None
    return min(frames,key=lambda f:abs((n(f.get('time'),0) or 0)-t))

def player(frame,pid):
    if not isinstance(frame,dict): return None
    return next((p for p in (frame.get('players') or []) if p.get('id')==pid),None)

def situation_summary(s):
    if not isinstance(s,dict): return None
    hb=s.get('hybridBefore') or {}; bd=hb.get('boundary') or {}
    hr=s.get('highResolution') or {}; entry=hr.get('entrySnapshot') or {}
    frames=frames_of(s); events=event_list(s)
    selected=hr.get('selectedChoice') or ((hr.get('decision') or {}).get('selectedChoice'))
    result=hr.get('actualResult') or hr.get('result')
    hero=bd.get('heroPlayerId') or hb.get('heroPlayerId') or 'H-ST'
    first=frames[0] if frames else entry
    last=frames[-1] if frames else entry
    hp0=player(first,hero); home=[p for p in (first.get('players') or []) if p.get('team')=='HOME']
    role=hp0.get('role') if hp0 else None; slot=hp0.get('slot') if hp0 else None
    if not role and hero=='H-ST': role='ST'
    motion=[]; turn_rates=[]; turn_signs=[]; top_speed_by={}
    prevp={}
    for f in frames:
        t=n(f.get('time'))
        for p in f.get('players') or []:
            pid=p.get('id'); vx=n(p.get('vx'),0) or 0; vy=n(p.get('vy'),0) or 0
            sp=math.hypot(vx,vy); top_speed_by[pid]=max(top_speed_by.get(pid,0),sp)
            if pid==hero:
                old=prevp.get(pid)
                if old and t is not None and old[0] is not None and t>old[0]:
                    dt=t-old[0]; dx=(n(p.get('x'),0) or 0)-old[1]; dy=(n(p.get('y'),0) or 0)-old[2]
                    motion.append(math.hypot(dx,dy)/dt)
                    a0=old[3]; a1=n(p.get('bodyAngle'))
                    if a0 is not None and a1 is not None:
                        av=angdiff(a0,a1)/dt; turn_rates.append(abs(av)); turn_signs.append(1 if av>.2 else -1 if av<-.2 else 0)
                prevp[pid]=(t,n(p.get('x'),0) or 0,n(p.get('y'),0) or 0,n(p.get('bodyAngle')))
    reversals=0; nz=[x for x in turn_signs if x]
    for a,b in zip(nz,nz[1:]):
        if a!=b: reversals+=1
    shots=[]
    for e in events:
        typ=str(e.get('type') or '')
        if typ not in ('SHOT','HEADER_SHOT'): continue
        t=n(e.get('t')); actor=e.get('actorId'); f=nearest_frame(frames,t); ap=player(f,actor) if actor else None; ball=(f or {}).get('ball') or {}
        dist=None
        if ap:
            dist=math.hypot((n(ap.get('x'),0) or 0)-(n(ball.get('x'),0) or 0),(n(ap.get('y'),0) or 0)-(n(ball.get('y'),0) or 0))
        shots.append({'t':t,'type':typ,'actorId':actor,'ballOwnerId':ball.get('ownerId'),'actorBallDistance':round(dist,3) if dist is not None else None,'actorPos':[n(ap.get('x')) if ap else None,n(ap.get('y')) if ap else None],'ballPos':[n(ball.get('x')),n(ball.get('y'))]})
    goals=[e for e in events if e.get('type')=='GOAL']
    celebration_frames=0
    for f in frames:
        txt=' '.join([str(f.get('phase') or ''),str((f.get('presentation') or {}).get('kind') or '')])
        txt+=' '+' '.join(str(p.get('action') or '')+' '+str(p.get('tacticalTask') or '') for p in (f.get('players') or []))
        if 'CELEBR' in txt.upper(): celebration_frames+=1
    goal_to_end=None
    if goals and frames:
        gt=max(n(e.get('t'),-1) or -1 for e in goals); goal_to_end=(n(frames[-1].get('time'),gt) or gt)-gt
    loss_types={'INTERCEPT','TACKLE','PASS_MISCONTROL','TAKE_ON_TACKLED','TAKE_ON_LOOSE','LOOSE','DUEL_BREAK'}
    losses=[e for e in events if str(e.get('type')) in loss_types]
    loss_to_end=None
    if losses and frames:
        lt=max(n(e.get('t'),-1) or -1 for e in losses); loss_to_end=(n(frames[-1].get('time'),lt) or lt)-lt
    corners=[e for e in events if 'CORNER' in str(e.get('type') or '')]
    rcode=(result or {}).get('code') if isinstance(result,dict) else None
    rhead=(result or {}).get('headline') if isinstance(result,dict) else str(result) if result else None
    goal_result_mismatch=bool(goals) and not ('GOAL' in str(rcode or '').upper() or any(k in str(rhead or '') for k in ('득점','골','GOAL')))
    home_x=sorted([n(p.get('x')) for p in home if n(p.get('x')) is not None])
    hero_x=n(hp0.get('x')) if hp0 else None
    st_deep=False
    if (role=='ST' or slot=='ST' or hero=='H-ST') and hero_x is not None:
        st_deep=hero_x<52.5 or (home_x and hero_x<=home_x[len(home_x)//3])
    return {
      'reportScope':s.get('reportScope'),'boundary':{'sceneId':bd.get('sceneId') or bd.get('id'),'type':bd.get('type'),'reason':bd.get('reason'),'atSecond':bd.get('atSecond'),'heroPlayerId':hero},
      'selectedChoice':selected,'actualResult':result,'entry':{'time':entry.get('time'),'phase':entry.get('phase'),'possession':entry.get('possession'),'score':entry.get('score'),'hero':{'id':hero,'role':role,'slot':slot,'x':hero_x,'y':n(hp0.get('y')) if hp0 else None},'homeXRange':[home_x[0],home_x[-1]] if home_x else None,'stDeepFlag':st_deep},
      'frameMetrics':{'count':len(frames),'start':frames[0].get('time') if frames else None,'end':frames[-1].get('time') if frames else None,'duration':round((n(frames[-1].get('time'),0) or 0)-(n(frames[0].get('time'),0) or 0),3) if frames else 0,'heroMaxVelocity':round(top_speed_by.get(hero,0),3),'heroMaxPositionSpeed':round(max(motion),3) if motion else 0,'heroMaxTurnRate':round(max(turn_rates),3) if turn_rates else 0,'heroTurnReversals':reversals,'topPlayerSpeeds':sorted(([pid,round(sp,3)] for pid,sp in top_speed_by.items()),key=lambda x:x[1],reverse=True)[:5]},
      'events':[{'t':e.get('t'),'type':e.get('type'),'actorId':e.get('actorId'),'targetId':e.get('targetId'),'team':e.get('team'),'text':e.get('text')} for e in events[-30:]],
      'shots':shots,'goals':len(goals),'goalToEpisodeEndSeconds':round(goal_to_end,3) if goal_to_end is not None else None,'celebrationFrames':celebration_frames,'goalResultMismatch':goal_result_mismatch,
      'lossToEpisodeEndSeconds':round(loss_to_end,3) if loss_to_end is not None else None,'corners':len(corners),
      'decisionOptions':[(o.get('id'),o.get('targetId'),o.get('label')) for o in ((hr.get('decision') or {}).get('options') or [])]
    }

out=[]
for r in rows:
    rid=r['report_id']; p=REPORT_DIR/(rid+'.json')
    try:
        d=json.loads(p.read_text(encoding='utf-8'))
        out.append({'meta':r,'context':d.get('bugReportContext'),'current':situation_summary(d.get('currentSituation')),'previous':situation_summary(d.get('previousSituation'))})
    except Exception as e:
        out.append({'meta':r,'error':repr(e)})
OUT.write_text(json.dumps({'schemaVersion':'FLR_V04_FEEDBACK_DEEP_AUDIT_1.0','count':len(out),'reports':out},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
