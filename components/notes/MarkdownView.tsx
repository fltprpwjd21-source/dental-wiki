"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Design §7: react-markdown은 기본적으로 원문 속 HTML을 렌더링하지 않는다
// (React 엘리먼트로만 변환) — 그래서 <script> 같은 삽입 HTML이 실행되지 않는다.
// 별도 sanitize 라이브러리가 필요 없는 이유가 이것이다.
export default function MarkdownView({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="text-sm text-gray-400">(빈 노트)</p>;
  }

  // Tailwind의 typography 플러그인 없이도 최소한의 문서 스타일이 나오도록,
  // 임의 변형 선택자(arbitrary variant)로 자식 태그에 직접 스타일을 준다.
  return (
    <div
      className="max-w-none space-y-3 text-sm leading-relaxed text-ink
        [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-brand
        [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-brand
        [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold
        [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
        [&_li]:my-0.5 [&_a]:text-accent [&_a]:underline
        [&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs
        [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-surface [&_pre]:p-3
        [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded [&_img]:border [&_img]:border-gray-200
        [&_table]:my-2 [&_table]:border-collapse [&_th]:border [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1
        [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1
        [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
