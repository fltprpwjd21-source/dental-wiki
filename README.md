# 치과위키 (Dental Wiki)

치과 스탭(치과위생사·기공사·방사선사) 전용 사내 위키 + LLM 질의응답 서비스입니다.
진료과별 인수인계 / 보험·비보험 수가 / 병원 내규·운영회칙 문서를 등록해두고, 자연어로 질문하면
등록된 문서를 근거로 답변합니다.

- 기획: [PRD.md](PRD.md) · 작업 계획: [PLAN.md](PLAN.md) · 설계: [DESIGN.md](DESIGN.md)
- 개발 규칙: [CLAUDE.md](CLAUDE.md)

## 기술 스택

- Next.js (App Router, TypeScript, Tailwind CSS) — 화면과 API를 한 프로젝트에서 처리
- Supabase(Postgres + pgvector) — 문서·수정로그·사원번호 화이트리스트 저장, 의미 검색용 임베딩
- OpenAI API — 질문/문서 임베딩 생성 및 답변 생성
- 배포: Vercel

## 다른 컴퓨터에서 이어서 작업하기

`.env`는 비밀 값이라 저장소에 올라가지 않습니다. 새 컴퓨터에서는 아래 순서로 세팅하세요.

### 1. 내려받고 의존성 설치

```bash
git clone <저장소 주소>
cd myapp
npm install
```

### 2. `.env` 파일을 직접 만들기

프로젝트 최상위에 `.env` 파일을 만들고 아래 항목을 채웁니다. **값은 기존 컴퓨터의 `.env`에서
직접 복사해오거나, 각 서비스 대시보드에서 다시 발급받으세요.**

| 키 | 용도 | 어디서 얻나 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 주소 | Supabase 대시보드 → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버에서 DB 접근 (service_role 키) | 같은 화면의 `service_role` 키 |
| `OPENAI_API_KEY` | 임베딩·답변 생성 | OpenAI 대시보드 |
| `COMMON_LOGIN_PASSWORD` | 전 직원 공통 로그인 비밀번호 | 직접 정한 값 (기존 값과 같아야 기존 계정으로 로그인됨) |
| `SESSION_SECRET` | 로그인 세션 서명용 | 임의의 긴 문자열 (바뀌면 기존 로그인 세션만 풀림) |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI 인증 | Supabase 대시보드 → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | 마이그레이션 적용용 DB 비밀번호 | Project Settings → Database → Reset password |
| `OPENAI_CHAT_MODEL` | (선택) 답변 생성 모델 | 미설정 시 `gpt-4o-mini` |

### 3. DB 연결 (이미 만들어둔 Supabase 프로젝트에 연결)

```bash
npx supabase link --project-ref <프로젝트-ref>
```

DB 스키마는 이미 적용되어 있으므로, **새 마이그레이션을 추가했을 때만** 아래를 실행합니다.

```bash
npx supabase db push
```

### 4. 실행

```bash
npm run dev
```

`http://localhost:3000` 접속 → 사원번호 + 공통 비밀번호로 로그인합니다.

## 배포

- 운영 주소: <https://dental-wiki-hyumc1.vercel.app>
- `main` 브랜치에 푸시하면 Vercel이 자동으로 빌드·배포한다. 따로 명령을 실행할 필요가 없다.
- 빌드가 실패하면 배포가 중단되고 기존 버전이 그대로 유지된다.

### Vercel 환경변수

`.env`는 저장소에 올라가지 않으므로 Vercel에 따로 등록해야 한다.
(대시보드 → dental-wiki → Settings → Environment Variables)

Production에 등록해 둔 것은 **앱 실행에 필요한 5개뿐**이다.

| 키 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 주소 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버에서 DB 접근 |
| `OPENAI_API_KEY` | 임베딩·답변 생성 |
| `SESSION_SECRET` | 로그인 세션 서명 |
| `COMMON_LOGIN_PASSWORD` | 전 직원 공통 비밀번호 |

`GITHUB_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`는
로컬 CLI 작업용이므로 Vercel에 올리지 않는다. 배포된 앱이 쓸 이유가 없는 값은 주지 않는다.

### 접근 제어

- **프로덕션은 인터넷에 공개**되어 있다. 로그인(사원번호 화이트리스트 + 공통 비밀번호)과
  로그인 시도 횟수 제한(사번당 5회/10분, IP당 20회/10분)이 유일한 방어선이다.
- **preview 배포는 Vercel 로그인이 필요**하도록 보호해 두었다
  (Settings → Deployment Protection → Vercel Authentication, preview만 적용).
- **preview 환경변수는 일부러 비워 두었다.** 값을 주면 preview가 프로덕션 DB에 그대로
  붙어서, 실험 중인 브랜치가 실제 문서·수정 로그를 건드릴 수 있다. 로그는 트리거 때문에
  되돌릴 수도 없다. 브랜치에서 실험할 때는 테스트용 Supabase 프로젝트를 따로 만들어
  그 값을 preview 환경변수로 넣는다.

### DB 마이그레이션은 자동이 아니다

코드는 자동 배포되지만 `supabase/migrations/`의 SQL은 따로 적용해야 한다.
마이그레이션을 추가한 커밋을 푸시했다면 아래를 잊지 말 것.

```bash
npx supabase db push
```

## 자주 쓰는 명령

```bash
npm run dev        # 개발 서버
npm run lint       # 검사
npm run build      # 빌드 확인
npm run seed:docs  # data/seed-docs 의 마크다운 문서를 DB에 등록 (임베딩 함께 생성)
```

## 문서 추가하는 방법

1. 앱에서 직접: 카테고리 화면 → "새 문서 만들기"
2. 파일로 한번에: `data/seed-docs/`에 아래 형식으로 `.md` 파일을 넣고 `npm run seed:docs`

```markdown
---
category: handover        # handover | insurance | policy
title: 문서 제목
---

본문 내용
```

## 주의

- 환자 개인정보·진료기록은 어떤 문서에도 넣지 않습니다.
- 문서는 삭제할 수 없고 수정만 가능하며, 모든 수정은 자동으로 이력에 남습니다.
