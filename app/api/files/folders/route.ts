import { NextResponse } from "next/server";
import { withSession } from "@/lib/with-session";
import { getServerSupabaseClient } from "@/lib/supabase/server";

const VALID_VISIBILITY = ["public", "admin_only"];

// Design §4.1: 일반 스탭은 public 폴더만, 관리자는 전체를 본다.
export async function GET() {
  return withSession(async (session) => {
    const supabase = getServerSupabaseClient();
    let query = supabase
      .from("file_folders")
      .select("id, name, visibility, created_by, created_at")
      .order("created_at", { ascending: true });

    if (!session.isAdmin) {
      query = query.eq("visibility", "public");
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "폴더 목록을 불러오지 못했습니다." }, { status: 500 });
    }
    return NextResponse.json({ folders: data });
  });
}

// Design §4.1: 최상위 폴더는 관리자만 만들 수 있다.
export async function POST(request: Request) {
  return withSession(async (session) => {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const visibility = body?.visibility;

    if (!name) {
      return NextResponse.json({ error: "폴더 이름을 입력해주세요." }, { status: 400 });
    }
    if (!VALID_VISIBILITY.includes(visibility)) {
      return NextResponse.json({ error: "올바른 공개범위를 선택해주세요." }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const { data: folder, error } = await supabase
      .from("file_folders")
      .insert({ name, visibility, created_by: session.employeeId })
      .select("id, name, visibility, created_by, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "폴더 생성에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ folder }, { status: 201 });
  });
}
