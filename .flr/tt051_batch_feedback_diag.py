#!/usr/bin/env python3
import json,math,sys
from pathlib import Path

def load(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def d(a,b): return math.hypot((a.get('x',0)-b.get('x',0)),(a.get('y',0)-b.get('y',0)))
def metrics(frames,pid):
 rows=[]
 for f in frames or []:
  p=next((p for p in f.get('players',[]) if p.get('id')==pid),None)
  if p: rows.append((f.get('time'),p))
 if len(rows)<2:return {'samples':len(rows)}
 plen=0;xr=yr=0;pdx=pdy=None;acts=[]
 for i,(t,p) in enumerate(rows):
  a=p.get('tacticalTask') or p.get('action')
  if a and (not acts or acts[-1][1]!=a):acts.append([round(t,2) if isinstance(t,(int,float)) else t,a])
  if i:
   q=rows[i-1][1];dx=p.get('x',0)-q.get('x',0);dy=p.get('y',0)-q.get('y',0);plen+=math.hypot(dx,dy)
   if pdx is not None and abs(pdx)>.01 and abs(dx)>.01 and pdx*dx<0:xr+=1
   if pdy is not None and abs(pdy)>.01 and abs(dy)>.01 and pdy*dy<0:yr+=1
   pdx,pdy=dx,dy
 first,last=rows[0][1],rows[-1][1];net=d(first,last)
 return {'samples':len(rows),'start':[round(first.get('x',0),2),round(first.get('y',0),2)],'end':[round(last.get('x',0),2),round(last.get('y',0),2)],'path':round(plen,2),'net':round(net,2),'pathToNet':round(plen/max(net,.05),2),'xRev':xr,'yRev':yr,'actions':acts[:24]}
def opt(o):
 m=o.get('meta') or {};return {'id':o.get('id'),'targetId':o.get('targetId'),'label':o.get('label'),'targetSlot':m.get('targetSlot'),'forward':m.get('forward'),'d':m.get('d'),'receiverPressure':m.get('receiverPressure'),'eta':m.get('eta'),'contactZ':m.get('contactZ'),'flightKind':m.get('flightKind')}
def sit(s):
 if not isinstance(s,dict):return None
 hr=s.get('highResolution') or {};bd=(s.get('hybridBefore') or {}).get('boundary') or {};hero=bd.get('heroPlayerId') or 'H-ST'
 pre=hr.get('preActionFrames') or [];post=hr.get('postActionFrames') or [];ep=hr.get('episodeFrames') or [];frames=ep or pre or post
 last=(post or pre or ep or [hr.get('entrySnapshot') or {}])[-1];hp=next((p for p in last.get('players',[]) if p.get('id')==hero),None)
 opp=[]
 if hp:opp=sorted([{'id':p.get('id'),'d':round(d(hp,p),2),'x':round(p.get('x',0),2),'y':round(p.get('y',0),2),'task':p.get('tacticalTask') or p.get('action'),'mark':p.get('markTargetId')} for p in last.get('players',[]) if p.get('team')!=hp.get('team')],key=lambda x:x['d'])[:3]
 dec=hr.get('decision') or {};res=hr.get('actualResult') or hr.get('result') or {};ev=hr.get('actualEvents') or []
 keyev=[]
 for e in ev:
  if e.get('type')=='USER_CHOICE' or e.get('actorId')==hero or e.get('type') in {'GOAL','SHOT','SAVE','INTERCEPT','TACKLE','FOUL','LOOSE','PASS_MISCONTROL','OFFSIDE'}:
   keyev.append({k:e.get(k) for k in ('t','type','actorId','targetId','text')})
 mates=[]
 if hp:
  for p in last.get('players',[]):
   if p.get('team')==hp.get('team') and p.get('id')!=hero and p.get('role') in {'WF','ST','CM'}:
    mates.append({'id':p.get('id'),'slot':p.get('slot'),'x':round(p.get('x',0),2),'y':round(p.get('y',0),2),'vx':round(p.get('vx',0),2),'vy':round(p.get('vy',0),2),'task':p.get('tacticalTask') or p.get('action')})
 return {'boundary':{'at':bd.get('atSecond'),'reason':bd.get('reason'),'hero':hero},'frames':{'pre':len(pre),'post':len(post),'episode':len(ep)},'options':[opt(o) for o in dec.get('options',[])],'selected':opt(hr.get('selectedChoice') or {}),'result':{k:res.get(k) for k in ('code','headline','detail')},'keyEvents':keyev[-20:],'hero':metrics(frames,hero),'nearest':opp,'nearestMetrics':{o['id']:metrics(frames,o['id']) for o in opp},'last':{'time':last.get('time'),'phase':last.get('phase'),'possession':last.get('possession'),'ball':{k:(last.get('ball') or {}).get(k) for k in ('mode','x','y','ownerId','intendedReceiverId','kind')},'heroPos':{k:hp.get(k) for k in ('x','y','vx','vy','action','tacticalTask')} if hp else None,'mates':mates}}
def main():
 out={'schemaVersion':'FLR_TT051_BATCH_FEEDBACK_DIAG_1.1','reports':[]}
 for p in sys.argv[1:]:
  b=load(p);c=b.get('bugReportContext') or {};out['reports'].append({'id':c.get('reportId'),'description':c.get('description'),'category':c.get('category'),'reportedAt':c.get('reportedAt'),'current':sit(b.get('currentSituation')),'previous':sit(b.get('previousSituation'))})
 print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
