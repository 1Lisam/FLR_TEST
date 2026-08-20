# FLR Bug Report Worker

R2에 전체 장면 JSON을 저장하고 GitHub Issue를 생성하는 중계 Worker입니다.

필수 secret: `GITHUB_TOKEN` (repo Issues write). R2 binding: `BUG_REPORTS` -> `flr-bug-reports`.
브라우저는 `등록` 버튼을 누를 때만 POST합니다. Issue 생성 실패 시 방금 저장한 JSON을 삭제합니다.
배포 후 workers.dev `/report` URL을 루트 `bug_report_config.js`의 `FLR_BUG_REPORT_ENDPOINT`에 넣습니다.
