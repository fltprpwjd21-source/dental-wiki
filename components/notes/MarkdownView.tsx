"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Design §7: react-markdown은 기본적으로 원문 속 HTML을 렌더링하지 않는다
// (React 엘리먼트로만 변환) — 그래서 <script> 같은 삽입 HTML이 실행되지 않는다.
// 별도 sanitize 라이브러리가 필요 없는 이유가 이것이다.

// 첨부파일 업로드 시 노트 본문에 끼워 넣는 링크 형식(/api/notes/{id}/content)과
// 정확히 일치하는지 검사한다. 이 패턴이 아닌 일반 링크는 절대 건드리지 않는다.
const ATTACHMENT_LINK = /^\/api\/notes\/[0-9a-f-]{36}\/content$/i;

function textOf(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
}

// 사진은 마크다운 이미지 문법(![](...))이라 기본 <img> 렌더링만으로 바로
// 보이지만, PDF는 링크([📎 이름](...))라 그냥 두면 텍스트 한 줄로만 보였다.
// "사진처럼 바로 보이면 좋겠다"는 요청에 따라, 첨부 링크 중 이름이 .pdf로
// 끝나는 것만 골라 <iframe>으로 미리보기를 끼워 넣는다.
//
// 이 iframe 이 안전한 근거 (2026-09-07 정정)
//   예전 주석은 "same-origin 인증 라우트라 안전하다"고 적고 있었는데 **사실이 아니었다**.
//   /api/notes/{id}/content 가 Supabase 서명 URL로 307 리다이렉트했기 때문에, iframe 안은
//   실제로는 *.supabase.co 였다 (LESSONS §9-9).
//   지금은 그 라우트가 바이트를 직접 흘려보내므로 진짜 same-origin 이고, 응답에
//   `Content-Security-Policy: sandbox` 가 붙어 그 안에서는 스크립트가 아예 실행되지 않는다.
//   즉 허용 목록(§9-2)이 뚫려 html·svg 가 들어오더라도 이 iframe 에서 코드가 돌지 않는다.
function AttachmentLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const text = textOf(children);
  if (href && ATTACHMENT_LINK.test(href) && /\.pdf$/i.test(text)) {
    return (
      <>
        <iframe
          src={href}
          title={text}
          className="my-2 h-[70vh] max-h-[600px] w-full rounded border border-gray-200"
        />
        <a href={href} target="_blank" rel="noreferrer" className="text-xs text-gray-500 underline">
          {text} · 새 창에서 열기
        </a>
      </>
    );
  }
  return (
    <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer">
      {children}
    </a>
  );
}

const components: Components = { a: AttachmentLink };

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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
