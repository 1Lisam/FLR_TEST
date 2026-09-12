# V48 True Three-Layer Scene user test

한국어 설명: Donor는 경기 전체의 background simulation만 담당하고, Legacy는 사용자 choices만 생성하며, Astra/V48 Candidate가 보이는 짧은 interactive scene을 실제로 시뮬레이션합니다. 흐름은 Donor → Astra → 같은 Donor handback입니다. Macro 단계에는 pitch를 표시하지 않고 compact 상태만 표시합니다. Interactive 단계에는 retained Candidate Match.inspect()의 tactical state, role/id, facing, pressure/mark/cover 관계를 표시합니다.

**TEST_ONLY.** 시작은 정지 상태이며 `?autostart=1`도 시작만 할 뿐 선택을 자동 실행하지 않습니다. Legacy Initial V1은 포함하지 않습니다.

V48_TRUE_THREE_LAYER_SCENE_TEST_READY
