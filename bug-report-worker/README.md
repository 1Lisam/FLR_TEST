# FLR Bug Report Worker

TT-0.50의 전체 통합 Episode JSON을 Cloudflare R2에 저장하고, 브라우저에 원본 JSON URL을 반환하는 중계 Worker입니다.

## Current flow
1. 사용자가 경기 화면에서 `버그 리포트 등록`을 누릅니다.
2. 브라우저가 현재 Episode의 전체 통합 JSON을 Worker `/report`로 POST합니다.
3. Worker가 원본 JSON을 R2 `BUG_REPORTS` binding (`flr-bug-reports`)에 저장합니다.
4. Worker가 `/reports/<build>/<reportId>.json` URL을 반환합니다.
5. 브라우저가 그 JSON URL을 포함한 GitHub Issue 작성 화면을 엽니다.
6. Worker endpoint가 설정되지 않았거나 업로드가 실패하면 기존 수동 GitHub Issue + 클립보드 JSON fallback을 사용합니다.

## Security / credentials
- 브라우저에 GitHub token이나 Cloudflare token을 넣지 않습니다.
- 현재 Worker는 GitHub Issue를 서버에서 직접 생성하지 않으므로 `GITHUB_TOKEN`이 필요하지 않습니다.
- Cloudflare 배포 자동화에는 GitHub Actions secrets `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID`를 사용합니다.
- Worker CORS는 기본적으로 `https://1lisam.github.io`만 허용합니다.

## Cloudflare resources
- Worker name: `flr-bug-reporter`
- R2 binding: `BUG_REPORTS`
- R2 bucket: `flr-bug-reports`
- Wrangler config: `bug-report-worker/wrangler.toml`

배포가 완료되면 자동화가 workers.dev URL의 `/report` endpoint를 루트 `bug_report_config.js`의 `FLR_BUG_REPORT_ENDPOINT`에 기록합니다.
