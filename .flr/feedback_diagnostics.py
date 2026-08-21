import json, math, sys
from pathlib import Path


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def walk(obj, path='root'):
    yield path, obj
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk(v, f'{path}.{k}')
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, f'{path}[{i}]')


def t_of(frame):
    if not isinstance(frame, dict): return None
    for k in ('t','time','second','atSecond','matchSecond'):
        v=frame.get(k)
        if isinstance(v,(int,float)): return float(v)
    return None


def players_of(frame):
    if not isinstance(frame,dict): return None
    p=frame.get('players')
    if isinstance(p,list): return p
    s=frame.get('state')
    if isinstance(s,dict) and isinstance(s.get('players'),list): return s['players']
    return None


def pid(p):
    if not isinstance(p,dict): return None
    return p.get('id') or p.get('playerId') or p.get('uid')


def xyv(p):
    if not isinstance(p,dict): return None
    pos=p.get('pos') if isinstance(p.get('pos'),dict) else p
    vel=p.get('vel') if isinstance(p.get('vel'),dict) else p
    try:
        x=float(pos.get('x')); y=float(pos.get('y'))
    except Exception: return None
    def f(d,k):
        v=d.get(k)
        return float(v) if isinstance(v,(int,float)) else None
    return {'x':x,'y':y,'vx':f(vel,'vx'),'vy':f(vel,'vy')}


def named_frame_arrays(obj):
    out={}
    for path,v in walk(obj):
        if isinstance(v,list) and v and isinstance(v[0],dict):
            key=path.rsplit('.',1)[-1]
            if key in {'preActionFrames','postActionFrames','episodeFrames','frames'}:
                good=[]
                for fr in v:
                    if t_of(fr) is not None and players_of(fr): good.append(fr)
                if good: out[path]=good
    return out


def player_series(frames, player_id):
    s=[]
    for fr in frames:
        t=t_of(fr); ps=players_of(fr) or []
        for p in ps:
            if pid(p)==player_id:
                z=xyv(p)
                if z: s.append({'t':t,**z})
                break
    # dedupe by t, keep last
    d={round(r['t'],4):r for r in s}
    return [d[k] for k in sorted(d)]


def series_metrics(s):
    if len(s)<2: return {'samples':len(s)}
    path=0.0; revx=revy=0; prev_dx=prev_dy=None
    speeds=[]; steps=[]
    for a,b in zip(s,s[1:]):
        dx=b['x']-a['x']; dy=b['y']-a['y']; dist=math.hypot(dx,dy)
        path+=dist; steps.append(dist)
        if prev_dx is not None and abs(prev_dx)>0.01 and abs(dx)>0.01 and prev_dx*dx<0: revx+=1
        if prev_dy is not None and abs(prev_dy)>0.01 and abs(dy)>0.01 and prev_dy*dy<0: revy+=1
        prev_dx,prev_dy=dx,dy
    for r in s:
        if r.get('vx') is not None and r.get('vy') is not None: speeds.append(math.hypot(r['vx'],r['vy']))
    net=math.hypot(s[-1]['x']-s[0]['x'],s[-1]['y']-s[0]['y'])
    return {
      'samples':len(s),'t0':s[0]['t'],'t1':s[-1]['t'],
      'start':[round(s[0]['x'],3),round(s[0]['y'],3)],'end':[round(s[-1]['x'],3),round(s[-1]['y'],3)],
      'path':round(path,3),'net':round(net,3),'pathToNet':round(path/max(net,0.05),2),
      'xReversals':revx,'yReversals':revy,
      'meanStep':round(sum(steps)/len(steps),4),'maxStep':round(max(steps),4),
      'meanSpeed':round(sum(speeds)/len(speeds),3) if speeds else None,
      'maxSpeed':round(max(speeds),3) if speeds else None,
    }


def compact_choice_nodes(obj, max_items=60):
    hits=[]
    interesting_keys={'choiceId','targetId','actionId','action','label','reason','filterReason','kind','type','family','action_family','selectedChoice','choices','options','availableChoices','choiceOptions','targets','sceneCandidates'}
    for path,v in walk(obj):
        if len(hits)>=max_items: break
        if isinstance(v,dict):
            keys=set(v)
            if keys & interesting_keys and not ('players' in keys and len(keys)>10):
                c={}
                for k in interesting_keys:
                    if k in v and not isinstance(v[k],(dict,list)):
                        c[k]=v[k]
                if c: hits.append({'path':path,'data':c})
        elif isinstance(v,list) and path.rsplit('.',1)[-1] in {'choices','options','availableChoices','choiceOptions','targets','sceneCandidates'}:
            sample=[]
            for x in v[:12]:
                if isinstance(x,dict):
                    sample.append({k:x.get(k) for k in ('choiceId','targetId','id','actionId','label','kind','type','reason','filterReason','family','action_family') if k in x})
                else: sample.append(x)
            hits.append({'path':path,'count':len(v),'sample':sample})
    return hits


def situation_summary(bundle, focus_ids):
    cur=bundle.get('currentSituation') or {}
    arrays=named_frame_arrays(cur)
    out={'arrayPaths':{p:len(v) for p,v in arrays.items()},'players':{},'choiceNodes':compact_choice_nodes(cur)}
    # Prefer preActionFrames, then episodeFrames, then any frames.
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
    # snapshot distances from last frame of best array
    if preferred:
        frames=preferred[0][2]
        fr=frames[-1]; ps={pid(p):xyv(p) for p in players_of(fr) or []}
        out['bestSnapshot']={'path':preferred[0][1],'t':t_of(fr),'players':{k:ps.get(k) for k in focus_ids if ps.get(k)}}
        hero=ps.get('H_ST')
        if hero:
            out['bestSnapshot']['distanceFromH_ST']={k:round(math.hypot(ps[k]['x']-hero['x'],ps[k]['y']-hero['y']),3) for k in focus_ids if k in ps and k!='H_ST'}
    return out


def main():
    old=load(sys.argv[1]); new=load(sys.argv[2])
    result={
      'schemaVersion':'FLR_FEEDBACK_DIAGNOSTICS_1.0',
      'oldJitter':{
        'context':old.get('bugReportContext'),
        'summary':situation_summary(old,['H_ST','A_CB_R','A_RCB','H_LW','H_RW'])
      },
      'newMissingChoice':{
        'context':new.get('bugReportContext'),
        'scope':new.get('scope'),
        'summary':situation_summary(new,['H_ST','H_LW','H_RW','H_LCM','H_RCM','A_CB_L','A_CB_R','A_LB','A_RB'])
      }
    }
    Path(sys.argv[3]).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__': main()
