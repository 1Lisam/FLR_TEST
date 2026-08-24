from pathlib import Path

def rep(path,old,new,label):
    p=Path(path);s=p.read_text(encoding='utf-8');n=s.count(old)
    if n!=1: raise SystemExit(f'{label}: expected 1 match got {n}')
    p.write_text(s.replace(old,new,1),encoding='utf-8')

rep('runtime/continuous_match_core.js',
"function offsideLine(m,attTeam){\n  const defenders=outfield(m,other(attTeam)).map(p=>p.x).sort((a,b)=>a-b);",
"function offsideLine(m,attTeam){\n  // Law 11 uses the second-last OPPONENT, not the second-last outfield defender.\n  // The goalkeeper is an opponent too and is normally the last opponent.\n  const defenders=teamPlayers(m,other(attTeam)).map(p=>p.x).sort((a,b)=>a-b);",
'core Law 11 line')
rep('runtime/tactical_movement.js',
"function offsideLine(m,attTeam){const xs=outfield(m,other(attTeam)).map(p=>p.x).sort((a,b)=>a-b);return attTeam===HOME?(xs[xs.length-2]??101):(xs[1]??4);}",
"function offsideLine(m,attTeam){const xs=teamPlayers(m,other(attTeam)).map(p=>p.x).sort((a,b)=>a-b);return attTeam===HOME?(xs[xs.length-2]??101):(xs[1]??4);}",
'high-res run line Law 11')
rep('runtime/hybrid_spatial_intent_v2.js',
"function attackLineLocal(players,team){const xs=Object.values(players).filter(q=>q.team!==team&&q.role!=='GK').map(q=>local(team,q.x,q.y).x).sort((a,b)=>a-b);return xs.length>=2?xs[xs.length-2]:92;}",
"function attackLineLocal(players,team){const xs=Object.values(players).filter(q=>q.team!==team).map(q=>local(team,q.x,q.y).x).sort((a,b)=>a-b);return xs.length>=2?xs[xs.length-2]:92;}",
'hybrid run line Law 11')
rep('runtime/protagonist_match_controller.js',
"  const engineLine=engineOffsideLine(f,src.team,false),referenceLine=engineOffsideLine(f,src.team,true),ballX=b.originX??b.x;",
"  const engineLine=engineOffsideLine(f,src.team,true),referenceLine=engineOffsideLine(f,src.team,true),ballX=b.originX??b.x;",
'protagonist offside diagnostic Law 11')
print('V054_OFFSIDE_LAW11_APPLIED')
