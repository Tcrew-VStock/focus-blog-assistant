# FOCUS AI Content Studio v3.0

## 무엇을 하는 앱인가요?
이 앱은 프롬프트 복사 도구가 아닙니다. Google Gemini API에 직접 연결해 아래 작업을 한 번에 수행합니다.

1. 사용자가 주제와 글 유형을 입력합니다.
2. Gemini Deep Research가 웹에서 최신 자료를 조사합니다.
3. 조사 보고서와 출처 URL을 화면에 표시합니다.
4. Gemini가 조사 보고서만을 근거로 네이버 블로그용 글 초안을 작성합니다.
5. 편집기에서 글을 수정하고 저장/복사/HTML/Markdown으로 내보냅니다.
6. Wikimedia Commons에서 실제 이미지 파일을 검색해 편집 본문에 삽입할 수 있습니다.

## 실행 및 가장 간단한 배포
- `index.html` 하나로 동작하는 정적 웹 앱입니다.
- 서버, Cloudflare, Wrangler, npm 빌드가 필요하지 않습니다.
- 가장 간단한 온라인 공개 방식은 GitHub Pages입니다.
  1. GitHub에서 새 저장소 생성
  2. `index.html`과 `README.md`를 저장소 최상위에 업로드
  3. 저장소 Settings → Pages → Deploy from a branch → `main` / `/(root)` → Save
  4. 생성된 Pages URL로 접속
- 로컬 파일로 열 수도 있지만 브라우저의 보안 정책 또는 네트워크 환경에 따라 API 요청이 제한될 수 있습니다. 이 경우 GitHub Pages 같은 HTTPS 정적 호스팅 주소에서 실행하세요.

## 최초 1회 설정
1. https://aistudio.google.com/app/apikey 에서 본인의 Gemini API 키를 발급합니다.
2. 앱의 Settings 메뉴에 키를 입력하고 저장합니다.
3. `연결 테스트`를 눌러 정상 응답을 확인합니다.
4. Create Content에서 주제를 넣고 `자료 조사 + 글 자동 작성`을 누릅니다.

API 키는 현재 브라우저의 localStorage에 저장됩니다. 정적 앱이라 서버에 키를 보관하지 않으며, 같은 브라우저 프로필에서만 설정이 유지됩니다. 공용 기기에서는 저장하지 마세요. API 사용량과 요금/무료 한도는 Google AI Studio 프로젝트와 선택한 모델 정책을 따릅니다.

## 정확성 관련 중요 제한
- Gemini Deep Research는 웹 검색으로 최신 공개 자료와 인용을 수집하지만, 검색엔진의 색인 지연이나 원문 공개 시점 때문에 모든 수치의 실시간성을 보장하지 않습니다.
- 특히 KRX 실시간 체결가·호가 데이터는 검색 결과로 대체할 수 없습니다. 한국거래소는 실시간 시세 분배 상품과 개인의 참고 목적 조회, 재배포/상업 활용에 대한 계약 조건을 별도로 안내합니다. 따라서 이 앱은 시세를 실시간으로 확인할 수 없으면 실시간이라고 표시하지 말라고 AI에 지시합니다.
- OpenDART는 공시·정기보고서·재무정보 확인을 위한 공식 데이터 원천입니다. 이 버전은 DART에 대한 자동 API 키 연동 대신 Gemini가 공개 웹 원문을 조사하도록 구성했습니다.
- 생성된 내용은 게시 전에 원문 출처, 기준일, 단위, 실적 회계기간을 확인하세요. 검색 노출 또는 투자 성과를 보장하지 않습니다.

## 저장 범위
글, 조사 보고서, 출처, 브랜드 설정, API 키는 브라우저 localStorage에 저장됩니다. 기기 간 자동 동기화/서버 백업 기능은 없습니다. Analytics는 저장 데이터의 개수·글자 수만 보여주며 네이버 조회수나 참여율을 가공해 만들지 않습니다.

## 기술
- Single-file HTML/CSS/JavaScript
- Gemini Interactions API / Deep Research agent
- Wikimedia Commons public API
