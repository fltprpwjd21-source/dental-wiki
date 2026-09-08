-- 「열어봤다」와 「확인했다」를 나눈다.
--
-- 지금까지는 공지를 열기만 해도 notice_reads 에 줄이 생겼고, 화면의 「읽음 확인」
-- 버튼은 이미 있는 줄을 다시 넣으려다 아무 일도 하지 않았다. 그래서
--   - 새로고침하면 버튼이 다시 안 누른 것처럼 보이고
--   - 카드의 「확인 필요」 표시도 영영 사라지지 않았다.
--
-- 열어본 것(read_at)은 카드의 안 읽음 점을, 직접 누른 것(acked_at)은
-- 확인 필요 표시와 버튼 상태를 맡는다.
alter table notice_reads
  add column acked_at timestamptz;

comment on column notice_reads.read_at is '공지를 연 시각. 카드의 안 읽음 점이 이걸 본다.';
comment on column notice_reads.acked_at is '「읽음 확인」을 직접 누른 시각. 누르기 전에는 비어 있다.';
