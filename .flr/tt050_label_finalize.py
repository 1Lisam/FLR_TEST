#!/usr/bin/env python3
import sys
from pathlib import Path
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()

def replace_once(text,old,new,label):
    n=text.count(old)
    if n!=1:
        raise SystemExit(f'TT050_LABEL_REPLACE {label} expected=1 actual={n}')
    return text.replace(old,new,1)

p=ROOT/'index.html'
t=p.read_text(encoding='utf-8')
t=replace_once(t,
    'TT-0.49 Match Decisions, Clean 1v1 & Exact Target',
    'TT-0.50 Cadence, Through-ball Timing & Exact Target',
    'document title')
t=replace_once(t,
    'FLR_TEST · TECHNICAL TEST <strong>TT-0.49</strong> · LIVE HYBRID V0.6 · STEP78',
    'FLR_TEST · TECHNICAL TEST <strong>TT-0.50</strong> · LIVE HYBRID V0.6 · STEP78',
    'developer build label')
t=replace_once(t,
    '깨끗한 1:1 빈도와 득점/선방/빗나감 분포, 실제 침투 중인 선수의 공간패스 노출과 exact target 유지, 쓰루패스 수신 뒤 NPC의 빠른 공격 연결, 주인공 절대 조작권을 검수합니다. TT-0.48의 전술 이동 구조는 그대로 보존합니다.',
    '경기당 선택 밀도와 연속 전진의 흐름, 침투 러너와 쓰루패스의 도착 타이밍, 화면에 표시된 choiceId + exact target의 실제 실행, 최종 3분의 1 NPC 공격 지속, RCM–ST 간격, 주인공 절대 조작권을 검수합니다.',
    'review purpose')
p.write_text(t,encoding='utf-8')

p=ROOT/'step71_hybrid_v06_ui.js'
t=p.read_text(encoding='utf-8')
t=replace_once(t,"b:'TT-0.49'","b:'TT-0.50'",'compact bug snapshot build')
p.write_text(t,encoding='utf-8')
print('TT050_LABEL_FINALIZE_OK')
