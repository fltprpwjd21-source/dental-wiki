import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createDownloadUrl } from "@/lib/file-storage";
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
//   2) Content-Security-Policy: sandbox 로 이 응답 안의 스크립트 실행을 막는다.
//      허용 목록이 뚫려 html·svg 가 들어오더라도 스크립트가 돌지 않는다.
//      (sandbox 지시어에 값을 주지 않으면 모든 권한이 꺼진다. 브라우저 내장 PDF 뷰어와
//       이미지 렌더링은 페이지 스크립트가 아니라서 영향받지 않는다)
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
      // 이 응답 안에서는 스크립트·폼·팝업 등 모든 것이 꺼진다.
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; object-src 'self'",
      // 파일명은 화면 표시용이다. 헤더에 그대로 넣으면 한글·따옴표에서 깨지므로 인코딩한다.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(node.name)}`,
      // 서명 URL이 60초짜리라 오래 캐싱하면 안 되고, 로그인 사용자별 응답이라 private 이다.
      "Cache-Control": "private, max-age=60",
    });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);

    return new NextResponse(upstream.body, { status: 200, headers });
  });
}
