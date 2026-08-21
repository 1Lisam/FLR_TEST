#!/usr/bin/env python3
import json,math,sys
from pathlib import Path

def load(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def events(s):return ((s or {}).get('highResolution') or {}).get('actualEvents') or []
def frames(s):
 hr=((s or {}).get('highResolution') or {})
 return hr.get('episodeFrames') or hr.get('preActionFrames') or hr.get('postActionFrames') or []
def hero_id(s):return (((s or {}).get('hybridBefore') or {}).get('boundary') or {}).get('heroPlayerId') or 'H-ST'
def selected(s):
 x=((s or {}).get('highResolution') or {}).get('selectedChoice') or {}
 return [x.get('id'),x.get('targetId')]
def options(s):
 d=((s or {}).get('highResolution') or {}).get('decision') or {}
 return [[o.get('id'),o.get('targetId'),o.get('label')] for o in d.get('options',[])]
def motion(s):
 fs=frames(s);hid=hero_id(s); rows=[]; close=[]
 for f in fs:
  h=next((p for p in f.get('players',[]) if p.get('id')==hid),None)
  if not h:continue
  opp=[p for p in f.get('players',[]) if p.get('team')!=h.get('team')]
  nearest=min(opp,key=lambda p:math.hypot(p.get('x',0)-h.get('x',0),p.get('y',0)-h.get('y',0))) if opp else None
  dd=math.hypot(nearest.get('x',0)-h.get('x',0),nearest.get('y',0)-h.get('y',0)) if nearest else 99
  rows.append((float(f.get('time') or 0),h,nearest,dd))
 if not rows:return {}
 minrow=min(rows,key=lambda x:x[3]);under12=[r for r in rows if r[3]<1.2];under16=[r for r in rows if r[3]<1.6]
 def span(a):return round((a[-1][0]-a[0][0]),2) if len(a)>1 else 0
 hxs=[r[1].get('x',0) for r in rows];hys=[r[1].get('y',0) for r in rows]
 speeds=[math.hypot(r[1].get('vx',0),r[1].get('vy',0)) for r in rows]
 return {'t0':rows[0][0],'t1':rows[-1][0],'heroStart':[round(rows[0][1].get('x',0),2),round(rows[0][1].get('y',0),2)],'heroEnd':[round(rows[-1][1].get('x',0),2),round(rows[-1][1].get('y',0),2)],'heroXRange':[round(min(hxs),2),round(max(hxs),2)],'heroYRange':[round(min(hys),2),round(max(hys),2)],'heroMeanSpeed':round(sum(speeds)/len(speeds),2),'minOpponentDistance':round(minrow[3],2),'minOpponentId':minrow[2].get('id') if minrow[2] else None,'samplesUnder1_2m':len(under12),'spanUnder1_2m':span(under12),'samplesUnder1_6m':len(under16),'spanUnder1_6m':span(under16),'lastNearest':{'id':rows[-1][2].get('id') if rows[-1][2] else None,'d':round(rows[-1][3],2),'task':(rows[-1][2] or {}).get('tacticalTask') or (rows[-1][2] or {}).get('action')}}
def sequence(s):
 hid=hero_id(s);out=[]
 for e in events(s):
  if e.get('type')=='USER_CHOICE' or e.get('actorId')==hid:
   out.append([round(float(e.get('t') or 0),2),e.get('type'),e.get('actorId'),e.get('targetId'),e.get('text')])
 return out[-30:]
def result(s):
 r=((s or {}).get('highResolution') or {}).get('actualResult') or {}
 return [r.get('code'),r.get('headline')]
def main():
 rows=[]
 for p in sys.argv[1:]:
  b=load(p);ctx=b.get('bugReportContext') or {};cur=b.get('currentSituation');prev=b.get('previousSituation')
  rows.append({'id':ctx.get('reportId'),'description':ctx.get('description'),'current':{'selected':selected(cur),'options':options(cur),'result':result(cur),'motion':motion(cur),'heroSequence':sequence(cur)},'previous':{'selected':selected(prev),'options':options(prev),'result':result(prev),'motion':motion(prev),'heroSequence':sequence(prev)}})
 print(json.dumps({'schemaVersion':'FLR_TT051_ISSUE_FACTS_1.0','reports':rows},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
