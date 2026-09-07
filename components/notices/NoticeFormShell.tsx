// 작성·수정 화면의 겉. 층 색(작성 = --l-form)을 여기서 한 번만 정한다.
export default function NoticeFormShell({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 bg-l-form">
      <div className="mx-auto max-w-3xl px-4 py-5">
        <h1 className="mb-4 font-display text-xl font-bold tracking-tight text-ink">{heading}</h1>
        {children}
      </div>
    </main>
  );
}
