# FRL A버전 Visual Comparison Viewer

개발/검수 전용 desktop viewer입니다. A와 B는 각각 별도 iframe realm에서 실제 복사 엔진을 실행하며, 시나리오 시작 시 동일한 serialized 현재 상태와 seed를 받습니다. 시작 이후 이동·접촉·결과는 각 엔진이 결정합니다.

`index.html`을 정적 파일 서버로 열어 사용합니다. 배포하지 않았으며 `astra_test/`, service viewer, legacy FLR, gameplay logic은 이 작업에서 변경하지 않습니다.
