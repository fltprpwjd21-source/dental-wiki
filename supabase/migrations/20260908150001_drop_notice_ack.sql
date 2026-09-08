-- ② 「읽음 확인」 버튼을 없앤다 — 공지를 열면 그 순간 읽음이다.
--
--   버튼을 따로 두면 열어본 사람도 한 번 더 눌러야 하고, 안 누르면 작성자에게는
--   안 읽은 것처럼 보인다. 실제로 필요한 건 "누가 이 공지를 봤는가" 하나뿐이라
--   read_at 만 남기고 acked_at 은 지운다.
alter table notice_reads drop column if exists acked_at;

comment on column notice_reads.read_at is '공지를 연 시각. 여는 순간 읽음으로 친다.';
