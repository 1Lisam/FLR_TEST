import json, math, sys
from pathlib import Path

def load(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def norm(v): return ''.join(c for c in str(v or '').upper() if c.isalnum())
def pid(p): return p.get('id') or p.get('playerId') or p.get('uid') if isinstance(p,dict) else None
def xy(p):
    if not isinstance(p,dict): return None
    q=p.get('pos') if isinstance(p.get('pos'),dict) else p
    try:return float(q['x']),float(q['y'])
    except:return None
def findp(ps,w):
    n=norm(w)
    return next((p for p in ps if norm(pid(p))==n),None)
def metrics(frames,w):
    rows=[]
    for fr in frames:
        p=findp(fr.get('players') or [],w); z=xy(p) if p else None
        if z: rows.append((float(fr.get('time',fr.get('t',0))),z[0],z[1],p.get('action'),p.get('markTargetId'),pid(p)))
    if len(rows)<2:return {'samples':len(rows)}
    path=0.; xr=yr=0; pdx=pdy=None
    for a,b in zip(rows,rows[1:]):
        dx=b[1]-a[1];dy=b[2]-a[2];path+=math.hypot(dx,dy)
        if pdx is not None and abs(pdx)>.01 and abs(dx)>.01 and pdx*dx<0:xr+=1
        if pdy is not None and abs(pdy)>.01 and abs(dy)>.01 and pdy*dy<0:yr+=1
        pdx,pdy=dx,dy
    net=math.hypot(rows[-1][1]-rows[0][1],rows[-1][2]-rows[0][2])
    acts=[]
    for r in rows:
        if r[3] and (not acts or acts[-1]!=r[3]):acts.append(r[3])
    return {'id':rows[0][5],'samples':len(rows),'t0':rows[0][0],'t1':rows[-1][0],'start':[round(rows[0][1],2),round(rows[0][2],2)],'end':[round(rows[-1][1],2),round(rows[-1][2],2)],'path':round(path,2),'net':round(net,2),'pathToNet':round(path/max(net,.05),2),'xReversals':xr,'yReversals':yr,'actions':acts[:12],'lastMarkTargetId':rows[-1][4]}
def preframes(bundle): return (((bundle.get('currentSituation') or {}).get('highResolution') or {}).get('preActionFrames') or [])
def nearest_opponents(frames,hero_id='H-ST',n=4):
    if not frames:return []
    fr=frames[-1];ps=fr.get('players') or [];h=findp(ps,hero_id);hz=xy(h) if h else None
    if not hz:return []
    out=[]
    for p in ps:
        if p.get('team')=='HOME':continue
        z=xy(p)
        if z:out.append({'id':pid(p),'distance':round(math.hypot(z[0]-hz[0],z[1]-hz[1]),2),'x':round(z[0],2),'y':round(z[1],2),'action':p.get('action'),'markTargetId':p.get('markTargetId')})
    return sorted(out,key=lambda x:x['distance'])[:n]
def compact_option(o):
    if not isinstance(o,dict):return o
    return {k:o.get(k) for k in ('id','choiceId','targetId','label','family','action_family','hint','tooltip','reason','filterReason') if k in o}
def decision(bundle):
    hr=((bundle.get('currentSituation') or {}).get('highResolution') or {})
    d=hr.get('decision') or {}
    return {'kind':d.get('kind'),'prompt':d.get('prompt'),'frame':{k:(d.get('frame') or {}).get(k) for k in ('kind','localX','localY','pressure','distance') if k in (d.get('frame') or {})},'options':[compact_option(o) for o in (d.get('options') or [])],'selectedChoice':compact_option(hr.get('selectedChoice') or {})}
def focus_snapshot(bundle):
    fs=preframes(bundle)
    if not fs:return {}
    fr=fs[-1];ps=fr.get('players') or []
    ids=['H-ST','H-LW','H-RW','H-LCM','H-RCM']
    out={'time':fr.get('time',fr.get('t')),'ball':fr.get('ball'),'players':{}}
    for w in ids:
        p=findp(ps,w)
        if p:
            z=xy(p);out['players'][w]={'actualId':pid(p),'x':round(z[0],2),'y':round(z[1],2),'action':p.get('action'),'vx':p.get('vx'),'vy':p.get('vy')}
    return out
def main():
    old,new=load(sys.argv[1]),load(sys.argv[2]);of=preframes(old);nf=preframes(new)
    nearest=nearest_opponents(of);nearest_ids=[x['id'] for x in nearest]
    result={'schemaVersion':'FLR_FEEDBACK_FOCUS_1.0','oldJitter':{'context':old.get('bugReportContext'),'preActionFrameCount':len(of),'hero':metrics(of,'H-ST'),'nearestOpponents':nearest,'nearestMetrics':{x:metrics(of,x) for x in nearest_ids}},'newMissingChoice':{'context':new.get('bugReportContext'),'preActionFrameCount':len(nf),'snapshot':focus_snapshot(new),'decision':decision(new),'nearestOpponents':nearest_opponents(nf)}}
    Path(sys.argv[3]).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
