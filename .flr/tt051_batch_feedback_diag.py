#!/usr/bin/env python3
import json,math,sys
from pathlib import Path

def load(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def xy(p): return (float(p.get('x',0)),float(p.get('y',0)))
def dist(a,b): return math.hypot(a[0]-b[0],a[1]-b[1])
def metrics(frames,pid):
 rows=[]
 for f in frames or []:
  p=next((p for p in f.get('players',[]) if p.get('id')==pid),None)
  if p: rows.append((f.get('time'),p))
 if not rows:return None
 plen=0;xr=yr=0;pdx=pdy=None;acts=[]
 for i,(t,p) in enumerate(rows):
  act=p.get('tacticalTask') or p.get('action')
  if act and (not acts or acts[-1]['action']!=act): acts.append({'t':t,'action':act})
  if i:
   q=rows[i-1][1];dx=p.get('x',0)-q.get('x',0);dy=p.get('y',0)-q.get('y',0);plen+=math.hypot(dx,dy)
   if pdx is not None and abs(pdx)>.01 and abs(dx)>.01 and pdx*dx<0:xr+=1
   if pdy is not None and abs(pdy)>.01 and abs(dy)>.01 and pdy*dy<0:yr+=1
   pdx,pdy=dx,dy
 first,last=rows[0][1],rows[-1][1];net=dist(xy(first),xy(last))
 return {'samples':len(rows),'start':[round(first.get('x',0),2),round(first.get('y',0),2)],'end':[round(last.get('x',0),2),round(last.get('y',0),2)],'path':round(plen,2),'net':round(net,2),'pathToNet':round(plen/max(net,.05),2),'xRev':xr,'yRev':yr,'actions':acts[:30]}
def compact_option(o): return {k:o.get(k) for k in ('id','targetId','label','family','meta') if k in o}
def situation(s):
 if not isinstance(s,dict):return None
 hr=s.get('highResolution') or {};hb=s.get('hybridBefore') or {};bd=hb.get('boundary') or {}
 pre=hr.get('preActionFrames') or [];post=hr.get('postActionFrames') or [];ep=hr.get('episodeFrames') or []
 last=(post or pre or ep or [hr.get('entrySnapshot') or {}])[-1]
 hero=bd.get('heroPlayerId') or 'H-ST';hp=next((p for p in last.get('players',[]) if p.get('id')==hero),None)
 opp=[]
 if hp:
  opp=sorted([{'id':p.get('id'),'d':round(dist(xy(p),xy(hp)),2),'x':round(p.get('x',0),2),'y':round(p.get('y',0),2),'action':p.get('action'),'task':p.get('tacticalTask'),'markTargetId':p.get('markTargetId')} for p in last.get('players',[]) if p.get('team')!=hp.get('team')],key=lambda z:z['d'])[:4]
 dec=hr.get('decision') or {};res=hr.get('actualResult') or hr.get('result') or {}
 ev=hr.get('actualEvents') or []
 return {'boundary':{'id':bd.get('id') or bd.get('sceneId'),'atSecond':bd.get('atSecond'),'reason':bd.get('reason'),'heroPlayerId':hero,'heroRole':bd.get('heroRole')},'reportScope':s.get('reportScope'),'frames':{'pre':len(pre),'post':len(post),'episode':len(ep),'preSpan':round((pre[-1].get('time',0)-pre[0].get('time',0)),2) if len(pre)>1 else 0,'postSpan':round((post[-1].get('time',0)-post[0].get('time',0)),2) if len(post)>1 else 0},'decision':{'kind':dec.get('kind'),'importance':dec.get('importance'),'options':[compact_option(o) for o in dec.get('options',[])]},'selectedChoice':hr.get('selectedChoice'),'actualResult':{k:res.get(k) for k in ('code','headline','detail')},'actualEvents':[{k:e.get(k) for k in ('t','type','actorId','targetId','team','text')} for e in ev[-30:]],'heroMetrics':metrics(ep or pre or post,hero),'nearestOpponents':opp,'nearestMetrics':{o['id']:metrics(ep or pre or post,o['id']) for o in opp},'lastFrame':{'time':last.get('time'),'score':last.get('score'),'phase':last.get('phase'),'possession':last.get('possession'),'ball':last.get('ball'),'hero':hp,'teammates':[{k:p.get(k) for k in ('id','slot','role','x','y','vx','vy','action','tacticalTask')} for p in last.get('players',[]) if hp and p.get('team')==hp.get('team') and p.get('id')!=hero]}}
def main():
 out={'schemaVersion':'FLR_TT051_BATCH_FEEDBACK_DIAG_1.0','reports':[]}
 for p in sys.argv[1:]:
  b=load(p);out['reports'].append({'context':b.get('bugReportContext'),'scope':b.get('scope'),'current':situation(b.get('currentSituation')),'previous':situation(b.get('previousSituation'))})
 print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
