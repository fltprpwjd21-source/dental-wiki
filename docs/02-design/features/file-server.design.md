---
template: design
version: 1.3
feature: file-server
date: 2026-09-04
author: 2251325
project: myapp (치과위키)
version_of_project: 0.1.0
---

# file-server Design Document

> **Summary**: 폴더별 접근권한(전체공개/관리자전용)을 가진 사내 파일함 — 업로드/다운로드/재업로드(덮어쓰기)/휴지통(30일)을 Supabase Storage 위에 구현한다
>
> **Project**: myapp (치과위키)
> **Version**: 0.1.0
> **Author**: 2251325
> **Date**: 2026-09-04
> **Status**: Draft
> **Planning Doc**: [file-server.plan.md](../../01-plan/features/file-server.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 위키 Q&A로 처리할 수 없는 "파일 원본 그대로 보관·배포" 요구가 따로 있음 |
| **WHO** | 전 스탭(열람/업로드), 관리자(폴더 생성·권한 관리) |
| **RISK** | 자유 업로드로 인한 악성 파일·용량 폭증, 실수로 인한 파일 덮어쓰기·삭제 |
| **SUCCESS** | 관리자가 만든 폴더에 스탭이 권한 내에서 업로드/다운로드/재업로드 가능, 실수 삭제는 30일 내 복구 가능, 위험 파일 형식은 업로드 자체가 막힘 |
| **SCOPE** | 1차: 최상위 폴더(관리자만 생성)·권한 2단계·업로드/다운로드/재업로드/휴지통. 하위 폴더·세분화 권한·바이러스 스캔·미리보기는 범위 밖 |

---

## 1. Overview

### 1.1 Design Goals

- 기존 위키(문서 CRUD)와 완전히 분리된 새 테이블·API·화면으로 만들어, 기존 기능에 부작용을 주지 않는다
- 기존 인증(`withSession`, `session.isAdmin`) 패턴을 그대로 재사용해 인증 로직을 두 번 만들지 않는다
- 큰 파일이 우리 서버(Vercel 서버리스 함수)를 거치지 않고 Supabase Storage로 직접 오가도록 해, 서버리스 함수의 요청 본문 크기 제한 문제를 피한다

### 1.2 Design Principles

- **기존 패턴 재사용**: `withSession` + `session.isAdmin` 체크 방식을 문서 API와 동일하게 사용 (Prisma나 새 ORM, 새 인증 계층을 만들지 않음)
- **YAGNI**: 하위 폴더, 세분화 권한, 저장소 추상화 인터페이스 등 지금 필요 없는 확장 지점은 만들지 않는다 (Plan §2.2 Out of Scope 참고)
- **불변 로그**: 문서 수정 로그(`document_logs`)와 동일하게, 파일 이력도 수정·삭제 불가능한 로그 테이블로 남긴다

---

## 2. Architecture Options (v1.7.0)

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 파일을 단일 테이블 + 폴더는 문자열 태그 | 저장소를 인터페이스로 추상화 | folders/files/file_logs 테이블 분리, 저장소는 Supabase Storage 직접 사용 |
| **New Files** | 4 | 10+ | 7 |
| **Modified Files** | 0 | 0 | 0 |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Medium (폴더 권한이 문자열 파싱에 의존) | High | High |
| **Effort** | Low | High | Medium |
| **Risk** | Medium (폴더별 권한 요구사항을 제대로 못 지킬 위험) | Low (구조는 안전하지만 과설계) | Low |
| **Recommendation** | 빠른 프로토타입용 | 저장소를 자주 바꿀 걸 아는 경우 | **선택됨** |

**Selected**: Option C — **Rationale**: 폴더별 접근권한(전체공개/관리자전용)이 이번 기능의 핵심 요구사항이라 폴더를 제대로 된 테이블로 모델링해야 한다. 저장소 추상화(Option B)는 "나중에 Supabase 용량이 부담되면 이전"이라는 아직 확정되지 않은 미래 요구를 위해 지금부터 인터페이스 계층을 만드는 것이라 이 프로젝트의 기존 방침(불필요한 추상화 금지, DESIGN.md의 Prisma 미사용 결정과 같은 맥락)과 맞지 않는다. 이전이 실제로 필요해지면 그때 `lib/file-storage.ts` 안의 구현만 바꾸면 된다 — 지금은 그 파일 자체가 이미 유일한 저장소 접점이라 이전 비용이 크지 않다.

### 2.1 Component Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Browser   │────▶│  Next.js API      │────▶│  Postgres            │
│ (파일함 화면) │     │  (app/api/files/*)│     │  (file_folders/files/│
│             │     │  withSession 인증  │     │   file_logs)         │
└──────┬──────┘     └────────┬──────────┘     └─────────────────────┘
       │                     │
       │   ① signed URL 발급  │
       │◀────────────────────┘
       │
       │   ② 그 URL로 직접 업로드/다운로드 (Vercel 함수를 거치지 않음)
       ▼
┌─────────────────────┐
│ Supabase Storage     │
│ (private bucket)     │
└─────────────────────┘
```

### 2.2 Data Flow

**업로드**
```
사용자가 파일 선택 → POST /api/files/folders/:id/upload-url (권한 확인 + 위험 확장자/용량 검사)
  → Supabase Storage signed upload URL 발급
  → 브라우저가 그 URL로 파일을 직접 PUT
  → 완료 후 POST /api/files/folders/:id/files (메타데이터 저장 + 로그 기록)
```

**다운로드**
```
사용자가 다운로드 클릭 → GET /api/files/:id/download-url (권한 확인)
  → Supabase Storage signed download URL(1분 유효) 발급 → 브라우저가 바로 다운로드
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `app/api/files/**` | `lib/with-session.ts`, `lib/file-storage.ts` | 인증 + Storage 연동 |
| `lib/file-storage.ts` | Supabase Storage(JS SDK) | signed URL 발급, 파일 삭제 |
| `components/FileBrowser.tsx` | `app/api/files/**` | 폴더/파일 목록, 업로드/다운로드 UI |
| 휴지통 자동 삭제(Cron) | `app/api/files/purge-trash` (내부용) | 30일 지난 휴지통 파일 완전 삭제 |

---

## 3. Data Model

### 3.1 Entity Definition

```typescript
type FolderVisibility = "public" | "admin_only";

interface FileFolder {
  id: string;
  name: string;
  visibility: FolderVisibility;
  createdBy: string;   // employee_id (역사 기록용 스냅샷, FK 없음 — documents.created_by와 동일 원칙)
  createdAt: string;
}

type FileStatus = "active" | "trashed";

interface FileEntry {
  id: string;
  folderId: string;
  name: string;          // 사용자가 올린 원래 파일명 (표시용)
  storagePath: string;   // Supabase Storage 상의 실제 경로 (예: `${folderId}/${id}`)
  sizeBytes: number;
  mimeType: string;
  version: number;       // 재업로드할 때마다 +1
  status: FileStatus;
  uploadedBy: string;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type FileAction = "upload" | "reupload" | "trash" | "restore" | "purge";

interface FileLog {
  id: string;
  fileId: string;
  folderId: string;
  action: FileAction;
  actor: string;         // employee_id, purge는 "system"
  detail: Record<string, unknown>; // 예: { previousVersion, sizeBytes }
  createdAt: string;
}
```

### 3.2 Entity Relationships

```
[FileFolder] 1 ──── N [FileEntry]
                          │
                          └── 1 ──── N [FileLog]
```

### 3.3 Database Schema

```sql
create table file_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  visibility text not null check (visibility in ('public', 'admin_only')),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table files (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references file_folders(id),
  name text not null,
  storage_path text not null,
  size_bytes bigint not null,
  mime_type text not null,
  version int not null default 1,
  status text not null default 'active' check (status in ('active', 'trashed')),
  uploaded_by text not null,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index files_folder_id_idx on files(folder_id);
create index files_name_search_idx on files using gin (to_tsvector('simple', name));
create index files_trashed_at_idx on files(trashed_at) where status = 'trashed';

create table file_logs (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null,
  folder_id uuid not null,
  action text not null check (action in ('upload', 'reupload', 'trash', 'restore', 'purge')),
  actor text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index file_logs_file_id_idx on file_logs(file_id);

-- document_logs와 동일한 원칙: 로그는 한 번 쓰면 수정·삭제할 수 없다
create or replace function file_logs_block_mutation() returns trigger as $$
begin
  raise exception 'file_logs 테이블은 수정·삭제할 수 없습니다';
end;
$$ language plpgsql;

create trigger file_logs_no_update
  before update on file_logs
  for each row execute function file_logs_block_mutation();

create trigger file_logs_no_delete
  before delete on file_logs
  for each row execute function file_logs_block_mutation();

revoke all on file_folders, files, file_logs from anon, authenticated;
```

> RLS는 이 프로젝트 전역 방침대로 anon/authenticated 권한을 전부 회수해 사실상 차단하고, service_role(서버 코드)만 접근한다 — 기존 `documents` 테이블과 동일한 모델.

### Supabase Storage

- 버킷: `file-server` (private, 공개 URL 없음 — 반드시 signed URL 경유)
- 오브젝트 경로: `${folder_id}/${file_id}` (원본 파일명은 DB의 `files.name`에만 저장 → 경로에 사용자 입력 문자열을 쓰지 않아 경로 조작/인코딩 문제 원천 차단)

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/files/folders | 접근 가능한 폴더 목록 (일반 스탭은 public만, 관리자는 전체) | Required |
| POST | /api/files/folders | 폴더 생성 | Required (admin) |
| GET | /api/files/folders/:id/files | 폴더 내 활성 파일 목록 (`?q=검색어`) | Required (폴더 권한) |
| POST | /api/files/folders/:id/upload-url | 업로드용 signed URL 발급 (확장자/용량 검사) | Required (폴더 권한) |
| POST | /api/files/folders/:id/files | 업로드 완료 후 메타데이터 확정 (신규 파일) | Required (폴더 권한) |
| POST | /api/files/:id/reupload-url | 재업로드용 signed URL 발급 | Required (폴더 권한) |
| POST | /api/files/:id/reupload | 재업로드 완료 확정 (version +1) | Required (폴더 권한) |
| GET | /api/files/:id/download-url | 다운로드용 signed URL 발급 | Required (폴더 권한) |
| POST | /api/files/:id/trash | 휴지통으로 이동 | Required (폴더 권한) |
| GET | /api/files/trash | 접근 가능한 폴더의 휴지통 파일 목록 | Required |
| POST | /api/files/:id/restore | 휴지통에서 복구 | Required (폴더 권한) |
| POST | /api/files/purge-trash | 30일 지난 휴지통 파일 완전 삭제 (Vercel Cron 전용) | Cron 시크릿 헤더 |

> "폴더 권한" = 해당 파일이 속한 폴더가 `public`이면 전 스탭, `admin_only`면 관리자만.

### 4.2 Detailed Specification

#### `POST /api/files/folders`

**Request:**
```json
{ "name": "2026년 서식 모음", "visibility": "admin_only" }
```

**Response (201):**
```json
{ "folder": { "id": "uuid", "name": "2026년 서식 모음", "visibility": "admin_only", "createdAt": "..." } }
```

**Error Responses:**
- `401`: 로그인 필요
- `403`: 관리자 아님
- `400`: name 비어있음

#### `POST /api/files/folders/:id/upload-url`

**Request:**
```json
{ "fileName": "수가표_2026.xlsx", "sizeBytes": 204800, "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
```

**Response (200):**
```json
{ "uploadUrl": "https://.../object/upload/sign/...", "fileId": "uuid" }
```

**Error Responses:**
- `403`: 폴더 접근 권한 없음(관리자전용 폴더에 일반 스탭이 시도)
- `422`: 위험 확장자(`FORBIDDEN_EXTENSION`) 또는 용량 초과(`FILE_TOO_LARGE`)
- `404`: 폴더 없음

#### `GET /api/files/:id/download-url`

**Response (200):**
```json
{ "downloadUrl": "https://...", "fileName": "수가표_2026.xlsx", "expiresIn": 60 }
```

**Error Responses:**
- `403`: 폴더 접근 권한 없음
- `404`: 파일 없음 또는 이미 휴지통에 있음(활성 파일만 다운로드 가능)

---

## 5. UI/UX Design

### 5.1 Screen Layout

```
┌────────────────────────────────────────────┐
│ 헤더 (기존 AppHeader 재사용, "파일함" 메뉴 추가) │
├────────────────────────────────────────────┤
│ [폴더 목록]                    [+ 새 폴더]*  │  * 관리자만 보임
│  📁 2026년 서식 모음  (관리자전용)            │
│  📁 진료과 공통 자료  (전체공개)              │
├────────────────────────────────────────────┤
│ 폴더 진입 시:                                │
│  [파일명 검색____________] [업로드]*         │
│  파일명            크기    올린날짜   [다운로드][재업로드]*[삭제]* │
│  ...                                        │
│  ─ 휴지통 보기 (펼치기) ─                    │
│    파일명   삭제된날짜(복구 가능일)  [복구]   │
└────────────────────────────────────────────┘
```

### 5.2 User Flow

```
파일함 메뉴 → 폴더 목록(권한 내) → 폴더 진입 → 파일 검색/목록 확인
  → (권한 있으면) 업로드 또는 재업로드 또는 삭제(휴지통 이동)
  → 휴지통 펼치기 → 복구
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `FolderList` | `components/files/FolderList.tsx` | 접근 가능한 폴더 목록 + 관리자용 폴더 생성 |
| `FileList` | `components/files/FileList.tsx` | 폴더 내 파일 목록, 검색, 업로드/재업로드/삭제 트리거 |
| `TrashSection` | `components/files/TrashSection.tsx` | 휴지통 목록 + 복구 |
| `UploadButton` | `components/files/UploadButton.tsx` | 파일 선택 → upload-url 발급 → 직접 업로드 → 완료 확정까지의 흐름 캡슐화 |

### 5.4 Page UI Checklist

#### /files (폴더 목록)

- [ ] 목록: 폴더 카드/행 — 이름, 공개범위 배지(전체공개/관리자전용)
- [ ] 버튼: "+ 새 폴더" (관리자에게만 노출, 이름 + 공개범위 선택 모달)
- [ ] 빈 상태: "아직 만들어진 폴더가 없습니다" (관리자 여부에 따라 안내 문구 다름)

#### /files/[folderId] (폴더 상세)

- [ ] 검색창: 파일명 부분 일치 검색
- [ ] 버튼: "업로드" (폴더 접근 권한 있는 사용자에게만 노출)
- [ ] 목록: 파일명, 크기(사람이 읽기 쉬운 단위), 올린 사람, 올린 날짜, 버전
- [ ] 각 행 버튼: 다운로드 / 재업로드 / 삭제(휴지통 이동)
- [ ] 업로드 진행 상태 표시 (진행률 또는 "업로드 중...")
- [ ] 위험 확장자·용량 초과 시 에러 메시지
- [ ] "휴지통 보기" 펼치기 — 파일명, 삭제일, "N일 후 완전 삭제" 안내, 복구 버튼

---

## 6. Error Handling

### 6.1 Error Code Definition

| Code | Message | Cause | Handling |
|------|---------|-------|----------|
| 401 | 로그인이 필요합니다. | 세션 없음 | 로그인 화면으로 |
| 403 | 이 폴더에 접근할 권한이 없습니다. | admin_only 폴더에 일반 스탭 접근 | 폴더 목록으로 |
| 403 | 관리자만 사용할 수 있습니다. | 폴더 생성/방문 등 관리자 전용 작업 | 버튼 자체를 숨김 + 서버에서도 재확인 |
| 404 | 파일을 찾을 수 없습니다. | 삭제(purge)됐거나 잘못된 id | 목록 새로고침 |
| 422 | 업로드할 수 없는 파일 형식입니다. | 위험 확장자 | 안내 문구로 허용 형식 표시 |
| 422 | 파일 용량이 너무 큽니다. (최대 {N}MB) | 용량 초과 | 안내 문구 |
| 500 | 파일 처리 중 오류가 발생했습니다. | Storage 연동 실패 등 | 로그 남기고 재시도 안내 |

### 6.2 Error Response Format

기존 위키 API와 동일하게 `{ "error": "한국어 메시지" }` 형식을 유지한다 (이 프로젝트는 `error.code` 중첩 구조를 쓰지 않음 — 기존 `app/api/documents/*` 관례 그대로).

---

## 7. Security Considerations

- [x] 인증: 모든 라우트 `withSession` 통과 필수 (미들웨어가 아니라 route 내부 체크 — 기존 방식과 동일)
- [x] 인가: 폴더 `visibility`를 서버에서 매 요청 재확인 (세션에 캐시하지 않음 — `session.isAdmin`이 이미 매 요청 DB 재조회되는 기존 구조를 그대로 활용)
- [x] 업로드 검증: 확장자 차단 목록(`.exe .bat .cmd .com .msi .scr .sh .ps1 .vbs .jar .apk .dll` 등)과 최대 용량(`FILE_MAX_SIZE_MB`, 기본 50MB)을 **서버(API)에서** 검사 — 클라이언트 검증은 UX용 보조 수단일 뿐 신뢰하지 않음
- [x] 경로 조작 방지: Storage 오브젝트 경로는 UUID로만 구성, 사용자 입력 파일명은 DB 메타데이터로만 저장(파일시스템 경로에 노출 안 함)
- [x] Signed URL 만료: 업로드/다운로드 URL은 발급 후 60초 내에만 유효
- [x] 로그 불변성: `file_logs`는 `document_logs`와 동일한 트리거로 수정·삭제 차단
- [ ] 바이러스 스캔: Plan에서 이미 범위 밖으로 명시 — 확장자 차단이 유일한 방어선이라는 점을 관리자에게 안내 문구로 고지
- [ ] Cron 엔드포인트(`/api/files/purge-trash`) 보호: `CRON_SECRET` 환경변수를 헤더로 검사해 외부에서 함부로 호출 못 하게 함 (Vercel Cron은 이 헤더를 자동으로 붙여줌)

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| L1: API Tests | 폴더/파일 CRUD, 권한, 확장자/용량 검증, 휴지통 | curl 스크립트 (기존 세션 검증 방식과 동일) | Do |
| L2: UI Action Tests | 업로드/다운로드/삭제/복구 버튼 동작 | 수동 + 브라우저 확인 (이 프로젝트는 Playwright 미도입 상태 유지) | Do |

### 8.2 L1: API Test Scenarios

| # | Endpoint | Method | Test Description | Expected Status |
|---|----------|--------|-------------------|:---:|
| 1 | /api/files/folders | POST | 일반 스탭이 폴더 생성 시도 | 403 |
| 2 | /api/files/folders | POST | 관리자가 폴더 생성 | 201 |
| 3 | /api/files/folders | GET | 일반 스탭 조회 시 admin_only 폴더가 목록에서 빠짐 | 200, 목록에 미포함 |
| 4 | /api/files/folders/:id/upload-url | POST | admin_only 폴더에 일반 스탭이 업로드 시도 | 403 |
| 5 | /api/files/folders/:id/upload-url | POST | .exe 파일 업로드 시도 | 422 |
| 6 | /api/files/folders/:id/upload-url | POST | 용량 제한 초과 파일 | 422 |
| 7 | /api/files/:id/reupload | POST | 정상 재업로드 시 version 증가 확인 | 200 |
| 8 | /api/files/:id/trash → GET /api/files/trash | POST/GET | 삭제 후 휴지통 목록에 나타남, 원래 목록에서는 사라짐 | 200 |
| 9 | /api/files/:id/restore | POST | 휴지통에서 복구 후 원래 목록에 다시 나타남 | 200 |
| 10 | /api/files/purge-trash | POST | 시크릿 헤더 없이 호출 시 거부 | 401 |
| 11 | /api/files/purge-trash | POST | 30일 지난(테스트용으로 trashed_at을 과거로 조작) 파일이 완전 삭제됨 | 200, 이후 DB에서 사라짐 |

### 8.3 Seed Data Requirements

| Entity | Minimum Count | Key Fields Required |
|--------|:------------:|---------------------|
| file_folders | 2 | 하나는 `public`, 하나는 `admin_only` |
| files | 3 | 활성 2개(폴더별 1개씩), 휴지통 1개 |

---

## 9. Clean Architecture

이 프로젝트는 Enterprise 레벨의 계층 분리(Presentation/Application/Domain/Infrastructure)를 쓰지 않는다 — 기존 위키 코드도 `app/api/*/route.ts` 안에 직접 Supabase 호출을 작성하는 방식이라, 파일함 기능도 동일한 관례를 따른다.

### 9.4 This Feature's Layer Assignment

| Component | Location |
|-----------|----------|
| API 라우트 (권한 체크 + Supabase 호출) | `app/api/files/**/route.ts` |
| Storage 연동 헬퍼 (signed URL 발급, 삭제) | `lib/file-storage.ts` |
| 화면 컴포넌트 | `components/files/*.tsx` |
| 페이지 | `app/files/page.tsx`, `app/files/[folderId]/page.tsx` |

---

## 10. Coding Convention Reference

기존 프로젝트 관례(PascalCase 컴포넌트, camelCase 함수, 한국어 주석/에러 메시지, `@/*` import alias)를 그대로 따른다. 새로 정의할 것은 없다.

---

## 11. Implementation Guide

### 11.1 File Structure

```
app/
├── files/
│   ├── page.tsx                       # 폴더 목록
│   └── [folderId]/page.tsx            # 폴더 상세(파일 목록 + 휴지통)
├── api/files/
│   ├── folders/route.ts               # GET(목록)/POST(생성)
│   └── folders/[id]/
│       ├── files/route.ts             # GET(목록)/POST(업로드 확정)
│       └── upload-url/route.ts        # POST(업로드 signed URL)
│   └── [id]/
│       ├── download-url/route.ts      # GET
│       ├── reupload-url/route.ts      # POST
│       ├── reupload/route.ts          # POST
│       ├── trash/route.ts             # POST
│       └── restore/route.ts           # POST
│   ├── trash/route.ts                 # GET
│   └── purge-trash/route.ts           # POST (Cron 전용)
components/files/
├── FolderList.tsx
├── FileList.tsx
├── TrashSection.tsx
└── UploadButton.tsx
lib/
└── file-storage.ts                    # Supabase Storage signed URL 발급/삭제 헬퍼
supabase/migrations/
└── {timestamp}_file_server.sql        # file_folders/files/file_logs 테이블 + 트리거
vercel.json                            # crons: purge-trash 매일 1회
```

### 11.2 Implementation Order

1. [ ] DB 마이그레이션 작성·적용 (`file_folders`, `files`, `file_logs`, 트리거, RLS 회수)
2. [ ] Supabase Storage 버킷(`file-server`, private) 생성
3. [ ] `lib/file-storage.ts` (signed upload/download URL 발급, 삭제)
4. [ ] 폴더 API (`/api/files/folders` GET/POST) + 권한 체크
5. [ ] 파일 업로드 흐름 API (upload-url 발급 → 업로드 확정) + 확장자/용량 검증
6. [ ] 다운로드 API
7. [ ] 재업로드 API (version 증가)
8. [ ] 휴지통 이동/목록/복구 API
9. [ ] purge-trash API + `vercel.json` Cron 설정
10. [ ] 화면 구현 (`/files`, `/files/[folderId]`, 컴포넌트 4종)
11. [ ] AppHeader에 "파일함" 메뉴 추가
12. [ ] L1 API 테스트 스크립트로 §8.2 시나리오 전부 검증
13. [ ] `npm run lint` / `npm run build`

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|--------------|:---:|
| DB + Storage 기반 | `module-1` | 마이그레이션, 버킷 생성, `lib/file-storage.ts` | 15-20 |
| 폴더/파일 API | `module-2` | 폴더 CRUD, 업로드/다운로드/재업로드/휴지통/purge API | 30-40 |
| 화면 | `module-3` | `/files` 페이지들, 컴포넌트, AppHeader 메뉴 | 25-35 |
| 검증 | `module-4` | L1 API 테스트, lint/build, 실제 업로드/다운로드 수동 확인 | 15-20 |

#### Recommended Session Plan

| Session | Phase | Scope | Turns |
|---------|-------|-------|:-----:|
| Session 1 | Plan + Design | 전체 | 완료 |
| Session 2 | Do | `--scope module-1` | 15-20 |
| Session 3 | Do | `--scope module-2` | 30-40 |
| Session 4 | Do | `--scope module-3` | 25-35 |
| Session 5 | Do + Check | `--scope module-4` | 15-20 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-04 | 최초 작성 (Option C 선택, signed URL 기반 업로드/다운로드로 확정) | 2251325 |
