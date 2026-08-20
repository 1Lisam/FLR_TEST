# FLR Bug Report Worker

Football Life RPG의 전체 통합 Episode JSON과 테스터 설명을 Cloudflare R2에 저장하는 익명 버그 접수 Worker입니다.

## Current flow
1. 사용자가 경기 화면에서 `버그 리포트 등록`을 누릅니다.
2. 브라우저가 현재 Episode의 전체 통합 JSON + 분류/중요도/설명을 Worker `/report`로 POST합니다.
3. Worker가 원본 디버그 JSON을 R2 `BUG_REPORTS` binding (`flr-bug-reports`)에 그대로 저장합니다.
4. Worker가 보고서 메타데이터(설명/분류/중요도/원본 JSON URL)를 UUID 기반 메타 레코드에 저장합니다.
5. 브라우저는 `버그 등록 완료`를 표시하고 종료합니다. 정상 경로에서는 GitHub 로그인이나 GitHub Issue 작성 화면이 필요하지 않습니다.
6. `GITHUB_ISSUE_TOKEN`이 Worker secret으로 설정된 경우에만 서버가 같은 보고서를 GitHub Issue로 추가 생성할 수 있습니다. 토큰이 없어도 익명 버그 접수는 정상 완료됩니다.
7. Worker 접수 자체가 실패한 경우에만 기존 수동 GitHub Issue + 클립보드 JSON fallback을 사용합니다.

## Security / credentials
- 브라우저에 GitHub token이나 Cloudflare token을 넣지 않습니다.
- 익명 R2 접수에는 GitHub 자격증명이 필요하지 않습니다.
- 선택적 자동 GitHub Issue 생성은 Worker secret `GITHUB_ISSUE_TOKEN`을 사용하며, 소스/브라우저에 포함하지 않습니다.
- Cloudflare 배포 자동화에는 GitHub Actions secrets `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID`를 사용합니다.
- Worker CORS는 기본적으로 `https://1lisam.github.io`만 허용합니다.
- 원본 JSON URL과 report-meta URL은 무작위 reportId를 포함하며, report-meta 응답은 `no-store`입니다.

## Cloudflare resources
- Worker name: `flr-bug-reporter`
- R2 binding: `BUG_REPORTS`
- R2 bucket: `flr-bug-reports`
- Wrangler config: `bug-report-worker/wrangler.toml`

배포가 완료되면 자동화가 workers.dev URL의 `/report` endpoint를 루트 `bug_report_config.js`의 `FLR_BUG_REPORT_ENDPOINT`에 기록합니다.
