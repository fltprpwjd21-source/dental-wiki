import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { buildStoragePath, createUploadUrl } from "@/lib/file-storage";
import { isForbiddenExtension, isOversized, FILE_MAX_SIZE_MB } from "@/lib/file-rules";
import { isUuid } from "@/lib/uuid";

// parentId를 URL 경로가 아니라 body로 받는다 — 최상위(루트, parentId=null)
// 노트에 이미지를 붙이는 경우까지 자연스럽게 다루기 위해서다.
export async function POST(request: NextRequest) {
  return withSession(async () => {
    const body = await request.json().catch(() => null);
    const parentId = body?.parentId;
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const sizeBytes = Number.isFinite(body?.sizeBytes) ? Number(body.sizeBytes) : null;

    if (parentId !== null && parentId !== undefined && !isUuid(parentId)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (!fileName || sizeBytes === null) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    if (isForbiddenExtension(fileName)) {
      return NextResponse.json({ error: "업로드할 수 없는 파일 형식입니다." }, { status: 422 });
    }
    if (isOversized(sizeBytes)) {
      return NextResponse.json(
        { error: `파일 용량이 너무 큽니다. (최대 ${FILE_MAX_SIZE_MB}MB)` },
        { status: 422 },
      );
    }

    const supabase = getServerSupabaseClient();
    if (parentId) {
      const { data: parent } = await supabase
        .from("nodes")
        .select("id, type, status")
        .eq("id", parentId)
        .maybeSingle();
      if (!parent || parent.type !== "folder" || parent.status !== "active") {
        return NextResponse.json({ error: "폴더를 찾을 수 없습니다." }, { status: 404 });
      }
    }

    const imageId = randomUUID();
    // 루트(parentId 없음)에 붙는 이미지는 "root" 아래에 모아 경로 충돌을 피한다.
    const storagePath = buildStoragePath(parentId ?? "root", imageId);

    try {
      const { signedUrl, token } = await createUploadUrl(storagePath);
      return NextResponse.json({ imageId, storagePath, uploadUrl: signedUrl, token });
    } catch {
      return NextResponse.json({ error: "업로드 URL 발급에 실패했습니다." }, { status: 500 });
    }
  });
}
