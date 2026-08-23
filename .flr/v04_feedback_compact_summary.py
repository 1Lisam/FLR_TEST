#!/usr/bin/env python3
import json, pathlib, sys
src=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))

def compact_s(s):
    if not isinstance(s,dict): return None
    choice=s.get('selectedChoice') or {}
    res=s.get('actualResult') or {}
    fm=s.get('frameMetrics') or {}
    entry=s.get('entry') or {}
    ev=s.get('events') or []
    return {
      'boundary':s.get('boundary'),
      'choice':{'id':choice.get('id'),'targetId':choice.get('targetId'),'label':choice.get('label'),'meta':choice.get('meta')},
      'result':{'code':res.get('code'),'headline':res.get('headline'),'detail':res.get('detail')},
      'entry':entry,
      'motion':{'heroMaxVelocity':fm.get('heroMaxVelocity'),'heroMaxPositionSpeed':fm.get('heroMaxPositionSpeed'),'heroMaxTurnRate':fm.get('heroMaxTurnRate'),'heroTurnReversals':fm.get('heroTurnReversals'),'topPlayerSpeeds':fm.get('topPlayerSpeeds'),'duration':fm.get('duration')},
      'shots':s.get('shots'),'goals':s.get('goals'),'goalToEpisodeEndSeconds':s.get('goalToEpisodeEndSeconds'),'celebrationFrames':s.get('celebrationFrames'),'goalResultMismatch':s.get('goalResultMismatch'),'lossToEpisodeEndSeconds':s.get('lossToEpisodeEndSeconds'),'corners':s.get('corners'),
      'optionIds':[{'id':x[0],'targetId':x[1]} for x in (s.get('decisionOptions') or [])],
      'events':[{'t':e.get('t'),'type':e.get('type'),'actorId':e.get('actorId'),'targetId':e.get('targetId'),'team':e.get('team'),'text':e.get('text')} for e in ev]
    }
rows=[]
for r in src.get('reports') or []:
    m=r.get('meta') or {}
    rows.append({'reportId':m.get('report_id'),'category':m.get('category'),'priority':m.get('priority'),'description':m.get('description'),'current':compact_s(r.get('current')),'previous':compact_s(r.get('previous')),'error':r.get('error')})
out={'schemaVersion':'FLR_V04_FEEDBACK_COMPACT_SUMMARY_1.0','count':len(rows),'reports':rows}
pathlib.Path(sys.argv[2]).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
