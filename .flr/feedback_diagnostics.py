import json, math, sys
from pathlib import Path


def load(path): return json.loads(Path(path).read_text(encoding='utf-8'))

def walk(obj, path='root'):
    yield path,obj
    if isinstance(obj,dict):
        for k,v in obj.items(): yield from walk(v,f'{path}.{k}')
    elif isinstance(obj,list):
        for i,v in enumerate(obj): yield from walk(v,f'{path}[{i}]')

def t_of(fr):
    if not isinstance(fr,dict): return None
    for k in ('t','time','second','atSecond','matchSecond'):
        if isinstance(fr.get(k),(int,float)): return float(fr[k])
    return None

def players_of(fr):
    if not isinstance(fr,dict): return None
    if isinstance(fr.get('players'),list): return fr['players']
    s=fr.get('state')
    return s.get('players') if isinstance(s,dict) and isinstance(s.get('players'),list) else None

def pid(p):
    if not isinstance(p,dict): return None
    return p.get('id') or p.get('playerId') or p.get('uid')

def norm_id(v): return ''.join(ch for ch in str(v or '').upper() if ch.isalnum())

def xyv(p):
    if not isinstance(p,dict): return None
    pos=p.get('pos') if isinstance(p.get('pos'),dict) else p
    vel=p.get('vel') if isinstance(p.get('vel'),dict) else p
    try: x=float(pos.get('x')); y=float(pos.get('y'))
    except Exception: return None
    def f(d,k):
        v=d.get(k); return float(v) if isinstance(v,(int,float)) else None
    return {'x':x,'y':y,'vx':f(vel,'vx'),'vy':f(vel,'vy')}

def player_extra(p):
    if not isinstance(p,dict): return {}
    keep=('action','task','role','position','team','side','markTargetId','targetId','intent','state')
    return {k:p.get(k) for k in keep if k in p and not isinstance(p.get(k),(dict,list))}

def named_frame_arrays(obj):
    out={}
    for path,v in walk(obj):
        if isinstance(v,list) and v and isinstance(v[0],dict) and path.rsplit('.',1)[-1] in {'preActionFrames','postActionFrames','episodeFrames','frames'}:
            good=[fr for fr in v if t_of(fr) is not None and players_of(fr)]
            if good: out[path]=good
    return out

def find_player(ps,wanted):
    n=norm_id(wanted)
    for p in ps:
        if norm_id(pid(p))==n: return p
    return None

def player_series(frames,wanted):
    s=[]
    for fr in frames:
        p=find_player(players_of(fr) or [],wanted)
        z=xyv(p) if p else None
        if z: s.append({'t':t_of(fr),'actualId':pid(p),**z,**player_extra(p)})
    d={round(r['t'],4):r for r in s}
    return [d[k] for k in sorted(d)]

def series_metrics(s):
    if len(s)<2: return {'samples':len(s)}
    path=0.; revx=revy=0; prev_dx=prev_dy=None; speeds=[]; steps=[]
    for a,b in zip(s,s[1:]):
        dx=b['x']-a['x']; dy=b['y']-a['y']; dist=math.hypot(dx,dy); path+=dist; steps.append(dist)
        if prev_dx is not None and abs(prev_dx)>0.01 and abs(dx)>0.01 and prev_dx*dx<0: revx+=1
        if prev_dy is not None and abs(prev_dy)>0.01 and abs(dy)>0.01 and prev_dy*dy<0: revy+=1
        prev_dx,prev_dy=dx,dy
    for r in s:
        if r.get('vx') is not None and r.get('vy') is not None: speeds.append(math.hypot(r['vx'],r['vy']))
    net=math.hypot(s[-1]['x']-s[0]['x'],s[-1]['y']-s[0]['y'])
    return {'samples':len(s),'actualId':s[0].get('actualId'),'t0':s[0]['t'],'t1':s[-1]['t'],'start':[round(s[0]['x'],3),round(s[0]['y'],3)],'end':[round(s[-1]['x'],3),round(s[-1]['y'],3)],'path':round(path,3),'net':round(net,3),'pathToNet':round(path/max(net,.05),2),'xReversals':revx,'yReversals':revy,'meanStep':round(sum(steps)/len(steps),4),'maxStep':round(max(steps),4),'meanSpeed':round(sum(speeds)/len(speeds),3) if speeds else None,'maxSpeed':round(max(speeds),3) if speeds else None}

def compact_entry(x):
    if not isinstance(x,dict): return x
    keys=('choiceId','targetId','id','actionId','action','label','kind','type','reason','filterReason','family','action_family','eligible','available','score','risk')
    return {k:x.get(k) for k in keys if k in x and not isinstance(x.get(k),(dict,list))}

def choice_diagnostics(obj):
    list_keys={'choices','options','availableChoices','choiceOptions','targets','sceneCandidates','candidateChoices','passTargets','targetOptions'}
    lists=[]; scalars=[]
    for path,v in walk(obj):
        low=path.lower()
        if '.players[' in low or '.ball' in low: continue
        last=path.rsplit('.',1)[-1]
        if isinstance(v,list) and (last in list_keys or any(w in last.lower() for w in ('choice','option','candidate','target'))):
            lists.append({'path':path,'count':len(v),'sample':[compact_entry(x) for x in v[:20]]})
        elif isinstance(v,dict) and any(k in v for k in ('choiceId','selectedChoice','filterReason')):
            c=compact_entry(v)
            if c: scalars.append({'path':path,'data':c})
    return {'lists':lists[:40],'scalars':scalars[:60]}

def snapshot(fr):
    rows=[]
    for p in players_of(fr) or []:
        z=xyv(p)
        if z: rows.append({'id':pid(p),**z,**player_extra(p)})
    return {'t':t_of(fr),'playerIds':[r['id'] for r in rows],'players':rows}

def situation_summary(bundle,focus_ids):
    cur=bundle.get('currentSituation') or {}
    arrays=named_frame_arrays(cur)
    out={'arrayPaths':{p:len(v) for p,v in arrays.items()},'players':{},'choiceDiagnostics':choice_diagnostics(cur)}
    preferred=[]
    for p,frames in arrays.items():
        rank=0 if p.endswith('preActionFrames') else 1 if p.endswith('episodeFrames') else 2
        preferred.append((rank,p,frames))
    preferred.sort(key=lambda x:(x[0],x[1]))
    for fid in focus_ids:
        variants=[]
        for _,p,frames in preferred[:8]:
            s=player_series(frames,fid)
            if s: variants.append({'path':p,'metrics':series_metrics(s),'first':s[0],'last':s[-1]})
        out['players'][fid]=variants[:4]
    if preferred:
        p,frames=preferred[0][1],preferred[0][2]
        first=snapshot(frames[0]); last=snapshot(frames[-1])
        out['bestArray']={'path':p,'first':first,'last':last}
        # compact focus snapshot with normalized id matching
        for snap_name,snap_obj in [('firstFocus',first),('lastFocus',last)]:
            fmap={norm_id(r['id']):r for r in snap_obj['players']}
            out['bestArray'][snap_name]={fid:fmap.get(norm_id(fid)) for fid in focus_ids if fmap.get(norm_id(fid))}
    return out

def main():
    old=load(sys.argv[1]); new=load(sys.argv[2])
    focus=['H-ST','H-LW','H-RW','H-LCM','H-RCM','A-CB-L','A-CB-R','A-LCB','A-RCB','A-LB','A-RB']
    result={'schemaVersion':'FLR_FEEDBACK_DIAGNOSTICS_1.1','oldJitter':{'context':old.get('bugReportContext'),'summary':situation_summary(old,focus)},'newMissingChoice':{'context':new.get('bugReportContext'),'scope':new.get('scope'),'summary':situation_summary(new,focus)}}
    Path(sys.argv[3]).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__': main()
