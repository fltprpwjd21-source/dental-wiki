-- 왜 필요한가
--   첨부파일이 들어가는 'file-server' 버킷이 지금까지 대시보드에서 손으로 만들어져 있었다.
--   마이그레이션에도 스크립트에도 없어서, 새 Supabase 프로젝트에서 이 저장소를 그대로
--   띄우면 마이그레이션은 전부 성공하는데 첨부를 올리는 순간에야 'Bucket not found'로
--   실패한다. 실제로 리전 이전(시드니 → 서울)을 하면서 이 구멍이 드러났다.
--
-- 무엇을 하는가
--   Supabase Storage 의 버킷은 storage.buckets 테이블 행이므로 평범한 SQL로 선언할 수 있다.
--   이미 있으면 설정만 맞춰(update) 두 프로젝트가 같은 상태로 수렴하게 한다.
--
-- 설정 근거
--   public=false : Design §3.3 — 공개 URL 없이 서명 URL로만 접근한다.
--   file_size_limit : lib/file-rules.ts 의 FILE_MAX_SIZE_MB(기본 50MB)와 같은 값.
--     앱에서 이미 막고 있지만, 서명 URL을 직접 손에 넣은 경우까지 막으려면 스토리지가
--     물리적으로 강제해야 한다.
--   allowed_mime_types 는 여기서 건드리지 않는다(null 유지). 허용 형식은 현재
--     lib/file-rules.ts 가 두 지점에서 강제하고 있고, 버킷 레벨 제한은 별도 판단으로 넣는다.
insert into storage.buckets (id, name, public, file_size_limit)
values ('file-server', 'file-server', false, 52428800)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;
