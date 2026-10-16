(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FLRPG_MATCH_ACADEMY=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='STEP39-MATCH-ACADEMY-0.7';
const SCENARIOS={
  ATT_FULLBACK_SUPPORT_BALANCE:{id:'ATT_FULLBACK_SUPPORT_BALANCE',title:'풀백 기본 지원 위치',description:'윙어가 터치라인 폭을 이미 잡고 있을 때 풀백과 같은 쪽 8번이 지원 위치를 유지하되 완전히 멈추지 않고 작은 재정렬을 계속하는지 확인합니다.'},
  ATT_FRONT_THREE_WIDTH:{id:'ATT_FRONT_THREE_WIDTH',title:'드문 언더랩 + 후방 커버',description:'풀백의 상황성 언더랩을 의도적으로 한 번 보여주는 장면입니다. 짧고 얕게 들어가되, 같은 쪽 CB와 중앙 미드필더가 뒤를 메우고 반대 풀백은 후방 균형을 유지해야 합니다.'},
  ATT_TAKE_ON:{id:'ATT_TAKE_ON',title:'돌파 성공 → 1:1 마무리',description:'WF가 수비수에게 실제 TAKE_ON을 시도합니다. 돌파에 성공해 GK와 1:1/오픈 슈팅 길이 생기면 남은 드리블 동작을 끝까지 기다리지 않고 즉시 슈팅 판단을 다시 열어야 합니다. 실패 시 태클/루즈볼도 정상 결과입니다.'},
  ATT_BYLINE_CROSS_HEADER:{id:'ATT_BYLINE_CROSS_HEADER',title:'바이라인 크로스 / 컷백',description:'WF가 바이라인까지 전진한 뒤 실제 공격 판단을 사용합니다. 박스 안 ST/반대 WF에게 크로스하거나 가까운 페널티스폿 쪽 컷백은 가능하지만, 수십 m 뒤 미드필더에게 되돌리는 공을 CROSS로 선택하면 실패입니다.'},
  BALL_PASS_SPEED:{id:'BALL_PASS_SPEED',title:'패스 속도 차이',description:'같은 기술 시연에서 짧은 지상 패스와 긴 전환 패스를 연속으로 보여줍니다. 짧은 패스는 부드럽고, 긴 패스는 더 빠르거나 공중 궤적을 사용해 서로 다른 도착 감각이 보여야 합니다.'},
  SHOT_CURLED_FEEL:{id:'SHOT_CURLED_FEEL',title:'감아차기 궤적',description:'측면 각도에서 인프런트 감아차기를 강제로 시연합니다. V0.8과 반대 굽힘 방향으로 수정했고 곡률도 더 크게 보여야 합니다.'},
  SHOT_CHIP_FEEL:{id:'SHOT_CHIP_FEEL',title:'1:1 칩슛 · GK 넘기기',description:'골키퍼가 앞으로 나온 1:1에서 칩슛이 GK를 넘는 성공 장면을 시연합니다. 실제 경기에서는 이런 조건에서만 드물게 후보가 됩니다.'},
  SHOT_CHIP_SAVE_FEEL:{id:'SHOT_CHIP_SAVE_FEEL',title:'1:1 칩슛 · GK 선방',description:'같은 칩슛 계열이라도 높이와 GK 대응이 맞으면 골키퍼가 잡거나 손끝으로 쳐낼 수 있음을 시연합니다.'},
  ATT_OPEN_CENTRAL_SHOT:{id:'ATT_OPEN_CENTRAL_SHOT',title:'정면 오픈 슈팅 판단',description:'이전 자동 회귀용 장면입니다.'},
  ATT_EARLY_CROSS_LEFT:{id:'ATT_EARLY_CROSS_LEFT',title:'좌측 얼리 크로스',description:'이전 자동 회귀용 장면입니다.'},
  ATT_EARLY_CROSS_RIGHT:{id:'ATT_EARLY_CROSS_RIGHT',title:'우측 얼리 크로스',description:'이전 자동 회귀용 장면입니다.'},
  DEF_MARK_ORBIT:{id:'DEF_MARK_ORBIT',title:'오프더볼 마킹 궤도',description:'이전 자동 회귀용 장면입니다.'},
  RST_LONG_GOAL_KICK:{id:'RST_LONG_GOAL_KICK',title:'롱 골킥 세컨드볼',description:'이전 자동 회귀용 장면입니다.'},
  PHY_PACE_CONTRAST:{id:'PHY_PACE_CONTRAST',title:'속도·가속 능력치 대비',description:'이전 자동 회귀용 장면입니다.'},
  PHY_BODY_TURN:{id:'PHY_BODY_TURN',title:'몸 방향·턴 능력 대비',description:'이전 자동 회귀용 장면입니다.'}
};
return{VERSION,SCENARIOS};
});
