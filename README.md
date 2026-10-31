# 🏓 탁구동호회 운영 웹앱

GitHub Pages(화면) + Firebase Firestore(데이터) 기반의 동호회 운영 웹앱입니다.

## 기능
- **일정**: 날짜별 행사 페이지 (연도별 목록, 오늘/예정 표시)
- **참가자 선택**: 운영진이 행사마다 회원을 탭해서 출석 체크
- **경기 입력**: 이긴 사람 → 상대 선택 → (세트 스코어 선택) → 저장. 로그인 없이 누구나 입력, 5분 안에는 취소 가능
- **연간 순위**: 1년 누적 승률·승수·출석률 (최소 경기 수 필터)
- **회원 관리**: 여러 명 한 번에 추가, 이름 수정, 휴면 처리
- **종목별 결과**: 행사마다 종목(팀 리그·팀 순위·순위 직접 지정)을 만들고 순위별 점수를 합산. 팀 리그는 단식-단식-복식 또는 단식-단식-단식 중 선택
- **게스트**: 참가자 선택 화면에서 추가(`G이름(부수)`로 표시). 행사 안 기록에는 반영, 연간 순위·회비에서는 제외
- **회비**: 12개월 완납이면 파란 막대 하나로 표시

## 권한
| | 일반 회원 | 운영진(로그인) |
|---|---|---|
| 일정·순위 보기 | ✅ | ✅ |
| 경기 결과 입력 | ✅ (그날 참가자끼리만) | ✅ |
| 경기 기록 취소 | 입력 후 5분 이내 | 언제나 |
| 행사 만들기·참가자 선택·회원 관리 | ❌ | ✅ |

---

## 설치 순서

### 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com → **프로젝트 추가**
2. **빌드 → Firestore Database → 데이터베이스 만들기** (위치: `asia-northeast3 (서울)`, 프로덕션 모드)
3. **빌드 → Authentication → 시작하기 → 이메일/비밀번호** 사용 설정
4. **Authentication → Users → 사용자 추가**로 운영진 계정(이메일/비밀번호) 생성
5. **프로젝트 설정(⚙️) → 내 앱 → 웹 앱(</>) 추가** → 나오는 `firebaseConfig` 복사

### 2. 코드에 내 값 넣기
- `app.js` 맨 위
  - `firebaseConfig` ← 복사한 값 붙여넣기
  - `ADMIN_EMAILS` ← 운영진 이메일
  - `CLUB_NAME` ← 동호회 이름
- `firestore.rules`의 `['admin@example.com']` ← 같은 운영진 이메일

### 3. 보안 규칙 적용
Firestore Database → **규칙** 탭에 `firestore.rules` 내용을 통째로 붙여넣고 **게시**

### 4. GitHub Pages 배포
1. GitHub에 새 저장소 만들기 → `index.html`, `app.js`, `style.css` 업로드
2. 저장소 **Settings → Pages → Branch: main / (root) → Save**
3. 1~2분 뒤 `https://아이디.github.io/저장소이름/` 접속
4. Firebase 콘솔 **Authentication → 설정 → 승인된 도메인**에 `아이디.github.io` 추가 (로그인용)

### 5. 처음 사용
1. 운영진 로그인 → **회원** 탭에서 회원 등록 (쉼표/줄바꿈으로 여러 명)
2. **일정** 탭 → 새 행사 만들기 → **참가자 선택**
3. 행사 페이지 주소를 단톡방에 공유 → 이긴 사람이 직접 입력

---

## 데이터 구조 (Firestore)
```
members/{id}  { name, active, grade?, guest?, createdAt }   ※ 게스트는 guest:true, active:false
events/{id}   { date:"2026-10-27", year:2026, title, place, attendees:[memberId…], createdAt }
matches/{id}  { eventId, date, year, winnerId, loserId, score:"3:1", createdAt }
```
- **승률** = 그 해 승 ÷ (승+패)
- **출석률** = 그 해 참가한 행사 수 ÷ 오늘까지 진행된 행사 수
