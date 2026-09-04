import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { createDownloadUrl } from "@/lib/file-storage";
import { isUuid } from "@/lib/uuid";

// Design §2.2·§4.2: 비공개 버킷의 이미지를 <img src="..">로 바로 쓸 수 있게,
// 로그인 확인 후 Supabase 서명 URL로 리다이렉트한다. 버킷 자체는 계속 비공개다.
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
      .select("id, type, status, storage_path")
      .eq("id", id)
      .maybeSingle();

    if (!node || node.type !== "image" || node.status !== "active" || !node.storage_path) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }

    try {
      const url = await createDownloadUrl(node.storage_path);
      return NextResponse.redirect(url, 307);
    } catch {
      return NextResponse.json({ error: "이미지를 불러오지 못했습니다." }, { status: 500 });
    }
  });
}
