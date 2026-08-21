#!/usr/bin/env python3
import json, gzip, hashlib, copy, sys
from pathlib import Path

def raw_bytes(obj): return json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode('utf-8')
def size(obj): return len(raw_bytes(obj))
def gzsize(obj): return len(gzip.compress(raw_bytes(obj),compresslevel=6))
def walk(o,path='root'):
    yield path,o
    if isinstance(o,dict):
        for k,v in o.items(): yield from walk(v,f'{path}.{k}')
    elif isinstance(o,list):
        for i,v in enumerate(o): yield from walk(v,f'{path}[{i}]')
def frame_arrays(o):
    out=[]
    for p,v in walk(o):
        if isinstance(v,list) and v and isinstance(v[0],dict) and p.rsplit('.',1)[-1] in {'preActionFrames','postActionFrames','episodeFrames','frames'}:
            out.append((p,v))
    return out
def compact_frame(fr):
    if not isinstance(fr,dict): return fr
    out={}
    for k in ('time','score','phase','possession'):
        if k in fr: out[k]=fr[k]
    b=fr.get('ball')
    if isinstance(b,dict): out['ball']={k:b.get(k) for k in ('mode','x','y','z','vx','vy','vz','ownerId','intendedReceiverId','kind','lastTouchTeam','lastTouchPlayer','strikeStyle') if k in b}
    ps=[]
    for p in fr.get('players') or []:
        if isinstance(p,dict): ps.append({k:p.get(k) for k in ('id','team','role','slot','x','y','vx','vy','tx','ty','action','tacticalTask','markTargetId','hasBall','bodyAngle','faceTargetAngle') if k in p})
    if ps: out['players']=ps
    if fr.get('lastEvent') is not None: out['lastEvent']=fr.get('lastEvent')
    return out
def compact_frames_copy(obj):
    o=copy.deepcopy(obj)
    def rec(v):
        if isinstance(v,dict):
            for k in list(v):
                if k in {'preActionFrames','postActionFrames','episodeFrames','frames'} and isinstance(v[k],list): v[k]=[compact_frame(x) for x in v[k]]
                else: rec(v[k])
        elif isinstance(v,list):
            for x in v: rec(x)
    rec(o); return o
def safe_episode_dedup(obj):
    o=copy.deepcopy(obj); removed=[]
    def rec(v,path='root'):
        if isinstance(v,dict):
            ep=v.get('episodeFrames'); pre=v.get('preActionFrames'); post=v.get('postActionFrames')
            if isinstance(ep,list) and ep:
                parts=[]
                if isinstance(pre,list) and pre: parts.extend(pre)
                if isinstance(post,list) and post: parts.extend(post)
                if parts and ep==parts:
                    removed.append({'path':path+'.episodeFrames','count':len(ep),'bytes':size(ep)})
                    v['episodeFramesRef']='preActionFrames+postActionFrames'; v.pop('episodeFrames',None)
            for k,x in list(v.items()): rec(x,f'{path}.{k}')
        elif isinstance(v,list):
            for i,x in enumerate(v): rec(x,f'{path}[{i}]')
    rec(o); return o,removed
def subtree_dups(obj):
    seen={}; dups=[]
    for p,v in walk(obj):
        if not isinstance(v,(dict,list)): continue
        try: b=raw_bytes(v)
        except: continue
        if len(b)<4096: continue
        h=hashlib.sha256(b).hexdigest()
        if h in seen: dups.append({'path':p,'sameAs':seen[h][0],'bytes':len(b)})
        else: seen[h]=(p,len(b))
    return sorted(dups,key=lambda x:-x['bytes'])[:20]
def analyze(path,label):
    obj=json.loads(Path(path).read_text(encoding='utf-8'))
    compact=compact_frames_copy(obj); dedup,removed=safe_episode_dedup(obj); combo=compact_frames_copy(dedup)
    fas=frame_arrays(obj)
    return {'label':label,'rawBytes':size(obj),'gzipBytes':gzsize(obj),'gzipRatio':round(gzsize(obj)/max(1,size(obj)),4),'compactFramesBytes':size(compact),'compactFramesGzipBytes':gzsize(compact),'safeDedupBytes':size(dedup),'safeDedupGzipBytes':gzsize(dedup),'compactSafeDedupBytes':size(combo),'compactSafeDedupGzipBytes':gzsize(combo),'safeDedupRemoved':removed,'frameArrays':[{'path':p,'count':len(v),'bytes':size(v)} for p,v in fas],'largestDuplicateSubtrees':subtree_dups(obj)}
def main():
    args=sys.argv[1:]; out=[]
    for i in range(0,len(args)-1,2): out.append(analyze(args[i],args[i+1]))
    keys=('rawBytes','gzipBytes','compactFramesBytes','compactFramesGzipBytes','safeDedupBytes','safeDedupGzipBytes','compactSafeDedupBytes','compactSafeDedupGzipBytes')
    agg={k:sum(r[k] for r in out) for k in keys}
    for k in keys:
        if k!='rawBytes': agg[k+'VsRaw']=round(agg[k]/max(1,agg['rawBytes']),4)
    print(json.dumps({'schemaVersion':'FLR_JSON_STORAGE_ANALYSIS_1.1','reports':out,'aggregate':agg},ensure_ascii=False,indent=2))
if __name__=='__main__': main()
