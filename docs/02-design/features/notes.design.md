---
template: design
version: 1.3
feature: notes
date: 2026-09-04
author: 2251325
project: myapp (치과위키)
---

# notes Design Document

> **Summary**: 옵시디언식 폴더 트리 + 마크다운 노트 + 이미지. 왼쪽 트리, 오른쪽 편집/뷰어 2단 화면
>
> **Project**: myapp (치과위키)
> **Author**: 2251325
> **Date**: 2026-09-04
> **Status**: Draft
> **Planning Doc**: [notes.plan.md](../../01-plan/features/notes.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 파일 보관함이 아니라 트리로 정리되는 메모장이 필요했음 (사진을 올려도 바로 못 보는 게 결정적 불편) |
| **WHO** | 전 스탭이 하나의 공유 트리를 함께 보고 편집 |
| **RISK** | 비공개 이미지가 URL만으로 새어나가면 안 됨, 기존 파일함 데이터를 깨지 않고 이전해야 함 |
| **SUCCESS** | 폴더 중첩 생성, 노트 편집·저장, 이미지 업로드 즉시 표시, 휴지통 30일 |
| **SCOPE** | 트리·노트 편집·이미지 인라인·2단 레이아웃·휴지통. 위키링크/그래프뷰/공동편집/옵시디언 동기화는 범위 밖 |

---

## 1. Overview

### 1.1 Design Goals

- 폴더·노트·이미지를 하나의 트리로 다루어, 옵시디언의 "볼트(vault) = 파일 트리"라는 모델을 그대로 반영한다
- 노트 저장은 위키 문서와 같은 방식(Postgres 텍스트 + 낙관적 잠금)을 재사용해 별도 편집 인프라를 새로 만들지 않는다
- 이미지는 비공개 버킷에 그대로 두고, 인증된 사용자에게만 보이는 중계 경로로만 노출한다

### 1.2 Design Principles

- **트리 = 폴더/노트/이미지가 같은 종류의 노드**: 세 가지를 별도 테이블로 쪼개지 않고 `type` 컬럼으로 구분되는 하나의 트리 테이블로 다룬다 (아래 §2.0 Option 비교 참고)
- **기존 자산 재사용**: 낙관적 잠금(`version` + `expectedVersion` + `VERSION_CONFLICT`), 불변 로그 트리거, `withSession` 인증은 위키 문서·파일함에서 이미 검증된 패턴을 그대로 가져온다
- **호환성은 형식 수준에서만**: 옵시디언 앱과 직접 연동하지 않되, "폴더 트리 + 마크다운 + 이미지"라는 옵시디언의 저장 형식과 개념적으로 같은 모양을 유지한다

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 기존 `file_folders`/`files`를 그대로 두고 컬럼만 추가(parent_id, content) | 폴더/노트/이미지를 각각 별도 테이블(3개)로 완전히 분리 | 폴더·노트·이미지를 하나의 `nodes` 트리 테이블로 통합 (`type` 컬럼) |
| **New Files** | 적음 | 많음 (테이블 3개 + 조인 로직) | 중간 |
| **Complexity** | 낮음 | 높음 (트리 조회 시 3개 테이블 UNION 필요) | 낮음~중간 |
| **Maintainability** | 낮음 (폴더 테이블에 노트 전용 컬럼이 섞여 어색함) | 중간 (분리는 깔끔하지만 트리 하나 그리는 데 3번 조회) | 높음 (트리 조회가 노드 테이블 1번 조회로 끝남) |
| **Effort** | 낮음 | 높음 | 중간 |
| **Risk** | 중간 (스키마가 어색해 나중에 다시 갈아엎을 가능성) | 낮음 | 낮음 |
| **Recommendation** | — | — | **선택됨** |

**Selected**: Option C — **Rationale**: 옵시디언의 핵심 모델 자체가 "폴더든 파일이든 트리의 노드"다. 폴더·노트·이미지를 한 테이블에서 `type`으로만 구분하면, 왼쪽 트리 UI가 원하는 "부모 밑에 자식들"이라는 조회가 테이블 하나로 끝난다(폴더 따로, 노트 따로, 이미지 따로 조회해 합치는 로직이 필요 없다). 기존 `file_folders`/`files`는 이 `nodes` 테이블로 흡수한다.

### 2.1 Component Diagram

```
┌──────────────┐     ┌───────────────────┐     ┌─────────────────────┐
│   Browser    │────▶│  Next.js API       │────▶│  Postgres            │
│ 왼쪽: 트리    │     │  app/api/notes/*   │     │  nodes / node_logs   │
│ 오른쪽: 편집/뷰│     │  withSession 인증   │     └─────────────────────┘
└──────┬───────┘     └────────┬──────────┘
       │ 이미지 업로드/조회      │
       ▼                      ▼
┌─────────────────────┐  (기존 file-server 버킷 재사용)
│ Supabase Storage     │
│ file-server (private)│
└─────────────────────┘
```

### 2.2 Data Flow

**트리 로딩**: `GET /api/notes/tree` → `nodes` 전체를 한 번에 조회 → 클라이언트에서 `parent_id` 기준으로 트리 조립 → 왼쪽 패널 렌더링

**노트 열람/편집**: 트리에서 노트 클릭 → `GET /api/notes/:id` → 마크다운 렌더링(뷰 모드) → "편집" 클릭 시 원문 textarea로 전환 → 저장 시 `PATCH /api/notes/:id` (기존 문서 PATCH와 동일하게 `expectedVersion` 포함)

**이미지 업로드(노트 안에서)**: 편집 중 이미지 선택 → signed URL 발급(`POST /api/notes/:parentId/images/upload-url`, 파일함 방식 재사용) → 업로드 → 확정(`POST /api/notes/:parentId/images`, `type='image'` 노드 생성) → 에디터가 커서 위치에 `![](/api/notes/{imageId}/content)` 마크다운 삽입

**이미지 표시**: `<img src="/api/notes/{id}/content">` → 이 경로가 세션 쿠키로 인증 확인 후 Supabase 서명 URL로 307 리다이렉트 → 브라우저가 그 서명 URL에서 실제 이미지를 받아온다 (버킷 자체는 여전히 비공개)

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `app/api/notes/**` | `lib/with-session.ts`, `lib/file-storage.ts`(재사용) | 인증 + Storage 연동 |
| 마크다운 렌더러 | `react-markdown` + `remark-gfm` (신규 설치) | 표·목록·코드블록 지원, HTML 삽입을 렌더링하지 않아 XSS 원천 차단 |
| `components/notes/*` | `app/api/notes/**` | 트리·편집기·뷰어 |

---

## 3. Data Model

### 3.1 Entity Definition

```typescript
type NodeType = "folder" | "note" | "image";
type NodeStatus = "active" | "trashed";

interface Node {
  id: string;
  parentId: string | null;      // null이면 최상위
  type: NodeType;
  name: string;                 // 폴더명 / 노트 제목 / 이미지 파일명
  content: string | null;       // note 전용: 마크다운 원문
  storagePath: string | null;   // image 전용: Storage 경로
  mimeType: string | null;      // image 전용
  sizeBytes: number | null;     // image 전용
  version: number;              // 낙관적 잠금 (note는 저장마다, folder/image는 이름 변경 시 증가)
  status: NodeStatus;
  createdBy: string;
  updatedAt: string;
  createdAt: string;
  trashedAt: string | null;
}
```

### 3.2 Entity Relationships

```
[Node] 1 ──── N [Node]   (자기 참조: parent_id)
   │
   └── 1 ──── N [NodeLog]
```

### 3.3 Database Schema

```sql
create table nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references nodes(id),
  type text not null check (type in ('folder', 'note', 'image')),
  name text not null,
  content text,                 -- note 전용
  storage_path text,            -- image 전용
  mime_type text,                -- image 전용
  size_bytes bigint,             -- image 전용
  version int not null default 1,
  status text not null default 'active' check (status in ('active', 'trashed')),
  created_by text not null,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint note_has_content check (type <> 'note' or content is not null),
  constraint image_has_storage check (type <> 'image' or storage_path is not null),
  constraint folder_has_no_payload check (type <> 'folder' or (content is null and storage_path is null))
);
create index nodes_parent_id_idx on nodes(parent_id);
create index nodes_name_search_idx on nodes using gin (to_tsvector('simple', name));
create index nodes_trashed_at_idx on nodes(trashed_at) where status = 'trashed';

create table node_logs (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null,
  action text not null check (action in
    ('create_folder', 'create_note', 'update_note', 'upload_image',
     'rename', 'trash', 'restore', 'purge')),
  actor text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index node_logs_node_id_idx on node_logs(node_id);

-- document_logs / file_logs와 동일 원칙: 로그는 수정·삭제 불가
create trigger node_logs_no_update before update on node_logs
  for each row execute function file_logs_block_mutation();
create trigger node_logs_no_delete before delete on node_logs
  for each row execute function file_logs_block_mutation();

alter table nodes enable row level security;
alter table node_logs enable row level security;
revoke all on nodes, node_logs from anon, authenticated;
```

**기존 파일함 데이터 이전**: `file_folders`(1건) → `type='folder'` 노드로, `files`(1건, 이미지) → `type='image'` 노드로, `file_logs`(2건) → `node_logs`로 옮기는 백필을 마이그레이션에 포함한다. 옮긴 뒤 `file_folders`/`files`/`file_logs`와 관련 함수(`register_uploaded_file` 등)는 삭제한다. `app/api/files/**`, `app/files/**`, `components/files/**`는 `app/api/notes/**`, `app/notes/**`, `components/notes/**`로 교체하고 기존 파일함 코드는 제거한다.

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/notes/tree | 전체 트리(활성 노드) 조회 | Required |
| POST | /api/notes/folders | 폴더 생성 (`parentId` 포함 가능) | Required |
| POST | /api/notes | 노트 생성 (`parentId`, `name`) | Required |
| GET | /api/notes/:id | 노트 상세(content, version) | Required |
| PATCH | /api/notes/:id | 노트 저장 (`content`, `expectedVersion`) | Required |
| PATCH | /api/notes/:id/rename | 폴더/노트/이미지 이름 변경 | Required |
| POST | /api/notes/:parentId/images/upload-url | 이미지 업로드 signed URL | Required |
| POST | /api/notes/:parentId/images | 이미지 업로드 확정 (`type='image'` 노드 생성) | Required |
| GET | /api/notes/:id/content | 이미지 실제 조회용 — signed URL로 307 리다이렉트 | Required |
| POST | /api/notes/:id/trash | 휴지통 이동 (폴더면 하위 전체 포함) | Required |
| GET | /api/notes/trash | 휴지통 목록 | Required |
| POST | /api/notes/:id/restore | 복구 | Required |
| POST | /api/notes/purge-trash | 30일 경과분 완전삭제 (Cron 전용, 기존 재사용) | Cron 시크릿 |
| GET | /api/notes/search?q= | 이름 검색 | Required |

### 4.2 Detailed Specification

#### `PATCH /api/notes/:id`

기존 `PATCH /api/documents/:id`와 동일한 낙관적 잠금 패턴:

**Request:** `{ "content": "# 제목\n본문...", "expectedVersion": 3 }`
**Response (200):** `{ "node": { "id", "content", "version": 4, "updatedAt" } }`
**Error:** `404 NOT_FOUND` / `409 VERSION_CONFLICT`("다른 사람이 방금 이 노트를 수정했습니다...")

#### `POST /api/notes/:id/trash` (폴더인 경우)

폴더를 휴지통으로 옮기면 `parent_id`로 연결된 모든 하위 노드(재귀)를 함께 `status='trashed'`로 바꾼다. 복구도 마찬가지로 하위 전체를 함께 되돌린다 — 부분 복구(폴더는 복구하되 특정 자식만 남기기)는 지원하지 않는다.

#### `GET /api/notes/:id/content` (이미지)

```
1. withSession으로 로그인 확인
2. 해당 image 노드가 존재하는지 확인 (404)
3. Supabase createSignedUrl(storage_path, 300) 발급
4. 307 리다이렉트
```

캐싱: `<img>` 태그가 이 경로를 direct src로 쓰므로, 브라우저가 이 요청 자체는 매번 보내지만 리다이렉트 대상(서명 URL)은 5분간 유효해 같은 세션 내 재방문에서 재사용된다.

---

## 5. UI/UX Design

### 5.1 Screen Layout

```
┌──────────────────────────────────────────────────────┐
│ 헤더 (기존 AppHeader, "파일함" → "노트"로 메뉴명 변경)   │
├───────────────┬────────────────────────────────────────┤
│ 왼쪽 트리       │ 오른쪽 편집/뷰어                          │
│ 📁 진료과 인수  │  [보기] [편집]              [저장]       │
│  📁 치주과     │  ────────────────────────────────────  │
│   📝 인수인계   │  # 치주과 인수인계                        │
│   🖼 사진.png  │  ...마크다운 렌더링 또는 textarea 원문...  │
│  📁 보철과     │  ![사진](url) ← 이미지 인라인 표시         │
│ + 새 폴더 *    │                                          │
│ + 새 노트      │  ─ 휴지통 보기 ─                          │
└───────────────┴────────────────────────────────────────┘
* 폴더·노트 생성은 로그인한 전 스탭 누구나 가능하다 (file-server의
  "관리자만 최상위 폴더 생성" 규칙은 이 기능에는 적용하지 않는다 — 전
  스탭이 함께 채워나가는 공유 노트라는 성격에 맞춰 완화, 2026-09-04 확정).
```

좁은 화면(375px)에서는 트리와 편집 화면을 한 화면에 나란히 두기 어렵다. 트리를 기본으로 보여주고, 노트를 선택하면 편집 화면으로 전환 + "← 트리로" 뒤로가기 버튼을 두는 방식으로 처리한다(모바일 파일 앱과 동일한 패턴).

### 5.2 User Flow

```
노트 메뉴 진입 → 왼쪽 트리에서 폴더 펼치기/노트 선택
  → 오른쪽에 렌더링된 노트 표시 → "편집" → 원문 수정 → 이미지 삽입 → 저장
  → 트리에서 새 폴더/새 노트 만들기 → 삭제(휴지통) → 복구
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `NoteTree` | `components/notes/NoteTree.tsx` | 왼쪽 트리 렌더링, 펼치기/접기, 새 폴더/노트 생성 |
| `NoteEditor` | `components/notes/NoteEditor.tsx` | 오른쪽 보기/편집 토글, 저장, 충돌 처리 |
| `ImageUploadButton` | `components/notes/ImageUploadButton.tsx` | 에디터 안에서 이미지 업로드 → 마크다운 삽입 |
| `MarkdownView` | `components/notes/MarkdownView.tsx` | react-markdown 기반 렌더링 (이미지 src를 `/api/notes/:id/content`로 매핑) |
| `TrashPanel` | `components/notes/TrashPanel.tsx` | 휴지통 목록 + 복구 (file-server의 TrashSection과 동일 패턴) |

### 5.4 Page UI Checklist

#### /notes

- [ ] 왼쪽: 트리 (폴더 펼치기/접기 아이콘, 노트/이미지 아이콘 구분)
- [ ] 왼쪽 하단: "+ 새 폴더", "+ 새 노트" 버튼
- [ ] 오른쪽: 아무것도 선택 안 했을 때 안내 문구
- [ ] 오른쪽: 노트 선택 시 [보기]/[편집] 토글 + 저장 버튼
- [ ] 오른쪽: 이미지 선택 시 이미지 크게 표시
- [ ] 편집 모드: 이미지 업로드 버튼 (누르면 커서 위치에 마크다운 삽입)
- [ ] 충돌 시 409 메시지 + 새로고침 버튼 (기존 문서 편집과 동일)
- [ ] 휴지통 펼치기 + 복구 버튼
- [ ] 검색창 (트리 상단)

---

## 6. Error Handling

기존 위키·파일함과 동일한 `{ "error": "한국어 메시지" }` 포맷, 동일한 상태 코드 관례(401/403/404/409/422/500)를 유지한다.

---

## 7. Security Considerations

- [x] 모든 라우트 `withSession` 통과
- [x] 이미지는 비공개 버킷 유지, `/api/notes/:id/content`가 세션 확인 후에만 서명 URL로 리다이렉트
- [x] 마크다운 렌더링은 `react-markdown`(HTML 패스스루 비활성 기본값)으로 처리해 `<script>` 등 삽입 HTML이 실행되지 않음 — 별도 sanitize 라이브러리 불필요
- [x] 노트 저장은 낙관적 잠금(`expectedVersion`)으로 동시 편집 충돌 감지
- [x] 폴더 삭제 시 하위 전체를 서버가 재귀 처리 (클라이언트가 목록을 만들어 보내지 않음 — 목록 조작으로 일부만 지우는 것을 방지)

---

## 8. Test Plan

### 8.2 L1: API Test Scenarios

| # | Endpoint | Method | Test Description | Expected Status |
|---|----------|--------|-------------------|:---:|
| 1 | /api/notes/folders | POST | 하위 폴더 생성(parentId 지정) | 201 |
| 2 | /api/notes/tree | GET | 생성한 폴더가 트리에 부모-자식으로 나타남 | 200 |
| 3 | /api/notes | POST | 노트 생성 | 201 |
| 4 | /api/notes/:id | PATCH | 정상 저장, version 증가 | 200 |
| 5 | /api/notes/:id | PATCH | 낡은 expectedVersion으로 저장 | 409 |
| 6 | /api/notes/:parentId/images/upload-url → images | POST | 이미지 업로드 전체 흐름 | 200/201 |
| 7 | /api/notes/:id/content | GET | 로그인 없이 호출 | 401 |
| 8 | /api/notes/:id/content | GET | 로그인 상태로 호출 | 307 |
| 9 | /api/notes/:id/trash (폴더) | POST | 하위 노트·이미지도 함께 trashed | 200 |
| 10 | /api/notes/:id/restore (폴더) | POST | 하위 전체 복구 | 200 |
| 11 | /api/notes/purge-trash | POST | 30일 경과 노드 완전삭제 | 200 |

### 8.5 Seed Data Requirements

| Entity | Minimum Count | Key Fields Required |
|--------|:------------:|---------------------|
| nodes | 5 이상 | 폴더 2단 중첩, 노트 1개 이상, 이미지 1개 이상, 휴지통 1개 포함 |

---

## 9~10. Clean Architecture / Coding Convention

기존 프로젝트 관례(계층 분리 없이 `app/api/*/route.ts`에 직접 로직, PascalCase 컴포넌트, 한국어 주석) 그대로 따른다.

---

## 11. Implementation Guide

### 11.1 File Structure

```
supabase/migrations/{timestamp}_notes.sql   -- nodes/node_logs 생성 + 기존 데이터 백필 + 구 테이블/함수 정리
lib/notes/tree.ts                            -- 평면 배열 → 트리 조립 유틸
app/api/notes/
├── tree/route.ts
├── folders/route.ts
├── route.ts                    -- POST(노트 생성)
├── search/route.ts
├── trash/route.ts
├── purge-trash/route.ts
└── [id]/
    ├── route.ts                 -- GET/PATCH(노트)
    ├── rename/route.ts
    ├── content/route.ts         -- 이미지 리다이렉트
    ├── trash/route.ts
    ├── restore/route.ts
    └── images/
        ├── upload-url/route.ts
        └── route.ts             -- POST(이미지 확정)
app/notes/page.tsx                -- 트리 + 편집 화면(클라이언트 컴포넌트 대부분)
components/notes/{NoteTree,NoteEditor,ImageUploadButton,MarkdownView,TrashPanel}.tsx
```

기존 `app/api/files/**`, `app/files/**`, `components/files/**`, `lib/file-access.ts`(폴더 개념이 바뀌므로 재작성), `lib/file-rules.ts`(재사용)는 정리하면서 필요한 부분만 옮긴다.

### 11.2 Implementation Order

1. [ ] DB 마이그레이션 (`nodes`/`node_logs` 생성 + 백필 + 구 스키마 정리)
2. [ ] `react-markdown`, `remark-gfm` 설치
3. [ ] 트리 조회/조립 (`lib/notes/tree.ts`, `GET /api/notes/tree`)
4. [ ] 폴더·노트 생성/이름변경 API
5. [ ] 노트 저장 API (낙관적 잠금)
6. [ ] 이미지 업로드 + 표시 API (`/content` 리다이렉트 라우트 포함)
7. [ ] 휴지통(재귀 포함)/복구/purge API
8. [ ] 검색 API
9. [ ] 화면: 트리 컴포넌트 → 편집기/뷰어 → 이미지 업로드 버튼 → 휴지통 패널
10. [ ] AppHeader "파일함" → "노트" 메뉴명 변경
11. [ ] 기존 `app/api/files/**` 등 구 코드 삭제
12. [ ] L1 API 테스트 + 브라우저 실제 조작 확인
13. [ ] `npm run lint` / `npm run build`

### 11.3 Session Guide

| Module | Scope Key | Description |
|--------|-----------|-------------|
| DB + 트리 조회 | `module-1` | 마이그레이션, 백필, tree API |
| 노트/폴더 CRUD | `module-2` | 생성·이름변경·저장(낙관적 잠금)·검색 |
| 이미지 | `module-3` | 업로드·표시·에디터 삽입 |
| 휴지통 + 구코드 정리 | `module-4` | 재귀 삭제/복구/purge, 파일함 코드 제거 |
| 화면 | `module-5` | 트리 UI, 편집기, 뷰어, 반응형 |
| 검증 | `module-6` | L1 테스트, 브라우저 확인, lint/build |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-04 | 최초 작성. file-server를 대체하는 트리형 노트로 설계, Option C(통합 nodes 테이블) 채택 | 2251325 |
