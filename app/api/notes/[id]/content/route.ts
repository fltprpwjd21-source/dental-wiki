import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createDownloadUrl } from "@/lib/file-storage";
import { isPreviewableMimeType } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";

// 비공개 버킷의 첨부파일(사진·PDF)을 <img src>·<iframe src>·다운로드 링크로 쓸 수 있게
// 로그인 확인 후 내려준다. 버킷 자체는 계속 비공개다.
//
// 예전에는 Supabase 서명 URL로 307 리다이렉트했다. 그러면 브라우저가 최종적으로 받는
// 것은 *.supabase.co 의 응답이라, 노트 본문의 PDF 미리보기 <iframe> 안이 **교차 출처**가
// 된다. 코드 주석에는 "same-origin 인증 라우트라 안전하다"고 적혀 있었지만 사실이 아니었다
// (LESSONS §9-9). 허용 목록이 html·svg 를 막고 있어 당장의 위험은 없었지만, 나중에 허용
// 형식을 늘리는 사람이 그 주석을 근거로 판단하면 그대로 뚫린다.
//
// 그래서 바이트를 우리 응답으로 그대로 흘려보낸다. 이제 두 겹이 된다.
//   1) 진짜 same-origin 이 된다 — 서명 URL도 브라우저에 노출되지 않는다.
//   2) Content-Security-Policy 로 이 응답 안의 스크립트 실행을 막는다.
//      허용 목록이 뚫려 html·svg 가 들어오더라도 스크립트가 돌지 않는다.
//
// CSP 에 sandbox 를 쓰지 않는 이유 (2026-09-07)
//   처음에는 `sandbox` 지시어를 값 없이 넣었다. 모든 권한이 꺼지니 가장 안전하다고
//   생각했는데, **브라우저 내장 PDF 뷰어까지 막혀 미리보기가 빈 화면이 됐다.**
//   sandbox 는 문서를 불투명한 출처로 만들어 플러그인 렌더링을 함께 차단한다.
//   막고 싶었던 것은 "업로드된 파일 안의 스크립트"이므로 script-src 로 좁힌다 —
//   PDF·이미지 렌더링은 페이지 스크립트가 아니라서 영향받지 않는다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withSession(async () => {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    const supabase = getServerSupabaseClient();
    const { data: node } = await supabase
      .from("nodes")
      .select("id, type, status, storage_path, name, mime_type")
      .eq("id", id)
      .maybeSingle();

    if (!node || node.type !== "attachment" || node.status !== "active" || !node.storage_path) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    let upstream: Response;
    try {
      const url = await createDownloadUrl(node.storage_path);
      upstream = await fetch(url);
    } catch {
      return NextResponse.json({ error: "첨부파일을 불러오지 못했습니다." }, { status: 500 });
    }

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "첨부파일을 불러오지 못했습니다." }, { status: 502 });
    }

    // 형식은 DB 에 저장된 값을 쓴다. 스토리지가 알려주는 값을 그대로 쓰면 업로드 때
    // 검사한 것과 다른 형식으로 렌더될 수 있다.
    const contentType = node.mime_type ?? "application/octet-stream";
    const headers = new Headers({
      "Content-Type": contentType,
      // 선언한 형식대로만 해석하게 한다 (내용을 보고 형식을 추측하지 않게).
      "X-Content-Type-Options": "nosniff",
      // 이 응답이 HTML·SVG 로 해석되더라도 그 안의 스크립트는 실행되지 않는다.
      // (default-src 나 sandbox 로 넓게 막으면 PDF 뷰어까지 막힌다 — 위 주석 참고)
      "Content-Security-Policy":
        "script-src 'none'; object-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      // 브라우저가 그릴 수 있는 형식만 inline 으로 띄운다. pptx 처럼 뷰어가 없는 형식을
      // inline 으로 주면 새 창이 빈 화면으로 열려 "안 열린다"는 신고가 들어온다 —
      // 그런 형식은 처음부터 내려받게 한다. (판단 기준은 lib/file-rules.ts 한 곳에 둔다)
      //
      // 파일명은 화면 표시용이다. 헤더에 그대로 넣으면 한글·따옴표에서 깨지므로 인코딩한다.
      "Content-Disposition": `${
        isPreviewableMimeType(contentType) ? "inline" : "attachment"
      }; filename*=UTF-8''${encodeURIComponent(node.name)}`,
      // 서명 URL이 60초짜리라 오래 캐싱하면 안 되고, 로그인 사용자별 응답이라 private 이다.
      "Cache-Control": "private, max-age=60",
    });
    // Content-Length 는 압축이 걸려 있지 않을 때만 넘긴다.
    // fetch 는 gzip 을 알아서 풀어주므로, 압축된 응답의 길이를 그대로 붙이면 우리가
    // 내보내는 실제 바이트 수와 어긋나 브라우저가 응답을 잘린 것으로 본다.
    const encoding = upstream.headers.get("content-encoding");
    const length = upstream.headers.get("content-length");
    if (length && !encoding) headers.set("Content-Length", length);

    return new NextResponse(upstream.body, { status: 200, headers });
  });
}
