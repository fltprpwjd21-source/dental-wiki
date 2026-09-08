// 층 마지막 — 남색 띠. 「읽은 사람 집계」를 켠 공지에만 붙는다.
//
// 버튼은 없다. 공지를 여는 순간 읽음으로 치기 때문이다.
//   버튼을 따로 두면 열어본 사람도 한 번 더 눌러야 하고, 안 누르면 작성자에게는
//   안 읽은 것처럼 보인다. 실제로 필요한 건 "누가 봤는가" 하나뿐이었다.
export default function NoticeAck({
  readCount,
  staffCount,
}: {
  readCount: number;
  staffCount: number;
}) {
  return (
    <div className="bg-head text-white/70">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2.5 px-4 py-3 text-[11.5px]">
        <span>
          이 공지를 읽은 사람 <b className="font-medium text-white">{readCount}</b>
          {staffCount > 0 && ` / ${staffCount}`}명
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-white/80">
          <span aria-hidden>✓</span> 열어봤으니 읽음으로 기록됐습니다
        </span>
      </div>
    </div>
  );
}
