---
template: plan
version: 1.3
feature: file-server
date: 2026-09-04
author: 2251325
project: myapp (치과위키)
version_of_project: 0.1.0
---

# file-server Planning Document

> **Summary**: 위키(RAG Q&A) 문서와는 별개로, 스탭이 폴더별로 파일을 자유롭게 올리고·내려받고·재업로드(덮어쓰기)할 수 있는 사내 파일함 기능
>
> **Project**: myapp (치과위키)
> **Version**: 0.1.0
> **Author**: 2251325
> **Date**: 2026-09-04
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 인수인계·수가·내규처럼 "질문하면 답이 나와야 하는" 정보 말고도, 스탭들이 그냥 폴더에 넣어두고 필요할 때 파일명으로 찾아 내려받는 방식의 자료(원본 엑셀, 스캔본, 서식 등)가 따로 필요하다. 지금 위키는 이런 용도로 설계되지 않았다. |
| **Solution** | 위키와는 별도의 화면/API로 "폴더 기반 파일함"을 만든다. 폴더는 관리자만 최상위를 만들고, 폴더별로 전체공개/관리자전용 권한을 관리자가 설정하며, 파일은 업로드·재업로드(덮어쓰기)·다운로드·휴지통 방식 삭제만 지원한다. 저장은 Supabase Storage를 우선 사용한다. |
| **Function/UX Effect** | 스탭은 폴더를 탐색하거나 파일명으로 검색해 원하는 파일을 찾고, 권한이 있으면 업로드/재업로드/삭제(휴지통 이동)까지 같은 화면에서 처리한다. |
| **Core Value** | 위키(빠른 질문-답변)와 파일함(원본 자료 보관)을 역할별로 분리해, 각 기능을 무리하게 한 시스템에 욱여넣지 않고도 두 요구를 모두 만족시킨다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 위키 Q&A로 처리할 수 없는 "파일 원본 그대로 보관·배포" 요구가 따로 있음 |
| **WHO** | 치과위생사·기공사·방사선사 전 스탭(열람/업로드), 관리자(폴더·권한 관리, 화이트리스트 관리자와 동일 그룹) |
| **RISK** | 자유 업로드로 인한 악성 파일·용량 폭증, 실수로 인한 파일 덮어쓰기·삭제 |
| **SUCCESS** | 관리자가 만든 폴더에 스탭이 권한 내에서 업로드/다운로드/재업로드 가능, 실수 삭제는 30일 내 복구 가능, 위험 파일 형식은 업로드 자체가 막힘 |
| **SCOPE** | 1차: 폴더·권한·업로드/다운로드/재업로드/휴지통. 2차 이후: 폴더 안 하위폴더를 일반 스탭도 만들지 등은 이번 범위 밖(3번 항목 참고) |

---

## 1. Overview

### 1.1 Purpose

인수인계/수가/내규처럼 RAG로 요약·답변할 성격이 아닌 파일(원본 엑셀, 스캔 문서, 서식 파일 등)을, 스탭들이 나무위키식 문서 수정과는 별개로 폴더에 넣어두고 필요할 때 파일명으로 찾아 내려받거나 최신 버전으로 교체할 수 있게 한다.

### 1.2 Background

이 프로젝트를 처음 기획할 때는 "①위키에 넣을 데이터"와 "②서버에 자유롭게 올리고 받는 파일"을 별도 기능으로 생각했었다. 실제 1~2차 개발에서는 ①만 위키(RAG Q&A + 문서 CRUD)로 구현됐고, ②는 미뤄뒀던 것을 이번에 진행한다. (근거: Gap 분석 논의에서 사용자가 직접 밝힌 원래 의도, 2026-09-03~04 대화)

### 1.3 Related Documents

- Requirements: [PRD.md](../../../PRD.md) — 단, 이 파일함 기능은 PRD.md의 "이번에 만들 것" 범위 밖의 새 기능이라 PRD 자체는 이번 Plan 승인 후 별도로 갱신 필요
- References: [DESIGN.md](../../../DESIGN.md) (기존 위키 아키텍처 — 인증/세션 재사용 대상)

---

## 2. Scope

### 2.1 In Scope

- [ ] 관리자가 최상위 폴더를 만들고, 폴더별로 "전체 스탭 공개" 또는 "관리자 전용"을 지정
- [ ] 폴더 안에서 파일 업로드 / 다운로드 / 재업로드(덮어쓰기, 새 버전) / 삭제(휴지통 이동)
- [ ] 파일명 기반 검색(폴더 안 또는 전체, 정확히 일치·부분 일치)
- [ ] 위험 확장자(.exe, .sh, .bat 등) 업로드 차단 + 개별 파일 용량 제한
- [ ] 삭제된 파일은 30일간 휴지통에 보관 후 자동 완전 삭제, 그 전엔 복구 가능
- [ ] 기존 로그인 세션(사원번호 화이트리스트) 그대로 재사용 — 별도 계정 체계 없음
- [ ] 파일 업로드/삭제/복구 시 "누가, 언제, 무엇을" 로그 기록 (위키 문서 로그와 별개 테이블)

### 2.2 Out of Scope

- 하위 폴더를 일반 스탭이 만드는 기능 (관리자만 최상위 폴더 생성 — 하위 폴더 생성 주체는 Design 단계에서 확정)
- 텍스트 파일 웹 내 직접 편집 (재업로드로만 파일 교체)
- 폴더/파일 단위의 세분화된 권한(사용자별 개별 권한) — 이번엔 "전체공개 vs 관리자전용" 2단계만
- 바이러스 백신 연동 스캔 (확장자 차단 + 용량 제한까지만, 실제 악성코드 스캔은 이번 범위 밖)
- 파일 미리보기(이미지/PDF 뷰어 등) — 다운로드만 지원
- Supabase 외 저장소로의 이전 작업 자체 (이번엔 Supabase Storage로 구현, 이전은 필요해지면 별도 Plan)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 관리자는 최상위 폴더를 생성하고 "전체공개/관리자전용"을 지정할 수 있다 | High | Pending |
| FR-02 | 권한이 있는 사용자는 폴더 안에 파일을 업로드할 수 있다 | High | Pending |
| FR-03 | 권한이 있는 사용자는 파일을 다운로드할 수 있다 | High | Pending |
| FR-04 | 권한이 있는 사용자는 기존 파일을 재업로드(덮어쓰기)할 수 있다 | High | Pending |
| FR-05 | 권한이 있는 사용자는 파일을 휴지통으로 이동(삭제)할 수 있고, 30일 내 복구할 수 있다 | High | Pending |
| FR-06 | 휴지통의 파일은 30일이 지나면 자동으로 완전 삭제된다 | Medium | Pending |
| FR-07 | 파일명으로 검색할 수 있다 (부분 일치) | Medium | Pending |
| FR-08 | 업로드 시 위험 확장자·용량 초과 파일은 거부된다 | High | Pending |
| FR-09 | 업로드/재업로드/삭제/복구 이력은 로그로 남는다 | Medium | Pending |
| FR-10 | 관리자가 아닌 사용자는 "관리자전용" 폴더 자체가 보이지 않는다 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Security | 화이트리스트 세션 없이는 어떤 파일 API도 401 | 기존 `withSession` 패턴 재사용 + curl 테스트 |
| Security | 위험 확장자 업로드 시 서버가 거부(클라이언트 검증만으로 끝내지 않음) | API 레벨 유닛 테스트 |
| Security | 관리자전용 폴더는 서버에서 매 요청 권한 재확인 (세션에 캐시 안 함, 기존 isAdmin 패턴과 동일) | API 테스트 |
| Performance | 파일 목록 조회는 폴더당 1회 쿼리로 처리 | 코드 리뷰 |
| 개인정보 | 업로드 파일에 환자 개인정보가 없는지는 시스템이 자동 검증하지 않음(업로더 책임) — CLAUDE.md 원칙과 동일 | 문서화(안내 문구)로 대체 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~FR-10 전부 구현
- [ ] 관리자/일반 스탭 권한별 접근 테스트 통과 (관리자전용 폴더가 일반 스탭에게 보이지 않음 포함)
- [ ] 위험 확장자·용량 초과 업로드 거부 테스트 통과
- [ ] 삭제 → 휴지통 → 복구, 삭제 → 30일 경과 시뮬레이션 → 완전 삭제 테스트 통과
- [ ] `npm run lint` / `npm run build` 통과

### 4.2 Quality Criteria

- [ ] 신규 API 라우트 전부 `withSession` 패턴 적용 (인증 누락 없음)
- [ ] Zero lint errors
- [ ] Build succeeds

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 악성 파일 업로드(랜섬웨어 등 첨부 후 다른 스탭이 다운로드해 실행) | High | Medium | 위험 확장자 서버측 차단(FR-08), 실행 파일 계열 전면 금지. 바이러스 스캔 자체는 이번 범위 밖이므로 잔존 위험으로 명시 |
| 실수로 중요 파일 삭제/덮어쓰기 | Medium | High | 휴지통 30일 보관(FR-05, FR-06), 재업로드는 완전 대체가 아니라 로그에 "덮어쓰기 전 상태" 흔적을 남기는 방식 검토(Design 단계에서 확정) |
| 저장 용량 증가로 인한 Supabase 비용 상승 | Medium | Medium | 개별 파일 용량 제한(FR-08)으로 상한선 관리, 용량 추이는 관리자가 설정 탭에서 주기적으로 확인(모니터링 UI는 이번 범위 밖, 추후 검토) |
| 권한 설정 실수로 관리자전용 폴더가 전체공개로 노출 | High | Low | 폴더 생성 시 기본값을 "관리자전용"으로 하고, 전체공개 전환 시 확인 절차(Design 단계에서 UI 확정) |
| 기존 위키 세션/인증 로직과의 통합 실수로 인증 우회 발생 | High | Low | 새 API 라우트도 기존 `withSession`/`getSession` 패턴을 그대로 재사용, 새 인증 로직을 만들지 않음 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| Supabase Storage 버킷 | 신규 저장소 | 파일 실물 저장용 버킷 신설 (문서/DB와는 별개) |
| `file_folders`, `files`, `file_logs` (가칭) | 신규 DB 테이블 | 폴더 메타데이터, 파일 메타데이터, 업로드/삭제/복구 로그 |
| `employee_whitelist` | 기존 테이블 | 변경 없음 — 관리자 여부(`is_admin`) 그대로 재사용, 스키마 변경 없음 |
| `lib/auth.ts`, `lib/with-session.ts` | 기존 인증 로직 | 변경 없음 — 새 API 라우트가 그대로 가져다 씀 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `employee_whitelist` | READ | `lib/auth.ts`의 `getSession()` | None — 읽기만 하고 스키마 변경 없음 |
| `withSession` | 재사용 | `app/api/documents/*`, `app/api/settings/*` (기존) | None — 기존 라우트는 그대로, 새 라우트가 같은 함수를 가져다 쓰는 것뿐 |

### 6.3 Verification

- [ ] 새 기능이 기존 `employee_whitelist`/세션 스키마를 변경하지 않는지 확인
- [ ] 관리자 권한 판단이 기존 설정 탭(화이트리스트 관리)과 동일한 기준(`is_admin`)을 쓰는지 확인
- [ ] 기존 위키 문서 API(`/api/documents/*`)가 이번 변경으로 영향받지 않는지 확인 (완전히 분리된 새 라우트/테이블이므로 영향 없음 예상)

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | ☐ |
| **Dynamic** | Feature-based modules, BaaS integration | Web apps with backend, SaaS MVPs | ☑ |
| **Enterprise** | Strict layer separation, DI, microservices | High-traffic systems | ☐ |

기존 프로젝트가 이미 Next.js App Router + Supabase(BaaS) 구조의 Dynamic 레벨이므로 그대로 따른다.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | Next.js (기존 유지) | Next.js App Router | CLAUDE.md 규칙 — 프레임워크 변경/마이그레이션 제안 금지 |
| 저장소 | Supabase Storage / 자체 서버(VPS·NAS) | Supabase Storage | 이미 쓰는 Supabase 프로젝트에 포함, 서버 운영 부담 없음. 용량이 실제로 커지면 그때 다른 저장소로 이전 검토(사용자 결정) |
| 인증 | 기존 세션 재사용 / 별도 인증 | 기존 세션(`withSession`) 재사용 | 계정 체계를 두 개로 나눌 이유가 없음 |
| API 스타일 | REST 라우트 / DB 함수(RPC) | 기존과 동일하게 API 라우트 + 필요시 DB 함수 | 위키 문서 CRUD와 동일한 패턴 유지가 일관성 있음 |
| 파일 삭제 방식 | 즉시 삭제 / 휴지통 | 휴지통(30일) | 사용자 결정 사항, 실수 복구 가능해야 함 |

### 7.3 Clean Architecture Approach

```
Selected Level: Dynamic

기존 구조 그대로 확장:
app/api/files/                 - 폴더 목록/생성, 파일 업로드/다운로드/삭제/복구 API
app/files/                     - 파일함 화면 (폴더 탐색, 업로드 UI)
components/FileBrowser.tsx 등  - 새 컴포넌트
lib/file-storage.ts            - Supabase Storage 연동 헬퍼 (신규)
supabase/migrations/           - file_folders/files/file_logs 테이블 + 휴지통 자동 삭제 스케줄
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md` has coding conventions section
- [ ] `docs/01-plan/conventions.md` exists — 없음, CLAUDE.md/DESIGN.md로 대체
- [ ] `CONVENTIONS.md` exists at project root — 없음
- [x] ESLint configuration
- [ ] Prettier configuration — 없음 (ESLint만 사용 중, 기존 관행 유지)
- [x] TypeScript configuration

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **Naming** | exists (PascalCase 컴포넌트, camelCase 함수) | 파일함 관련 테이블/컴포넌트도 동일 규칙 | High |
| **폴더 구조** | exists (`app/`, `components/`, `lib/`) | `app/files/`, `app/api/files/` 신설 위치만 확정 | High |
| **에러 처리** | exists (`withSession` + 한국어 에러 메시지 패턴) | 파일 업로드 실패(용량 초과/확장자 차단) 메시지 문구 확정 | Medium |
| **환경 변수** | exists (`.env`) | Supabase Storage 버킷명 등 필요 시 추가 | Medium |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `SUPABASE_SERVICE_ROLE_KEY` | 기존 값 재사용 (Storage 접근도 동일 키로 가능) | Server | ☐ (기존 값 재사용) |
| `FILE_STORAGE_BUCKET` | Supabase Storage 버킷 이름 | Server | ☑ |
| `FILE_MAX_SIZE_MB` | 개별 파일 업로드 최대 용량 | Server | ☑ (기본값은 Design 단계에서 확정) |

---

## 9. Next Steps

1. [ ] Design 문서 작성 (`file-server.design.md`) — 테이블 스키마, API 계약, 하위 폴더 생성 주체, 재업로드 시 이전 버전 보존 방식 등 세부 확정
2. [ ] 사용자 검토 및 승인
3. [ ] 구현 시작

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-04 | 최초 작성 (사용자 확인 완료: 접근권한=폴더별, 삭제=휴지통 30일, 수정=재업로드만, 폴더생성=관리자만, 저장소=Supabase 우선) | 2251325 |
