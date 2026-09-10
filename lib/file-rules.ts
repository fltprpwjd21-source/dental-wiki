// Design §7: 업로드 가능한 형식은 서버에서 확장자로 강제한다 (바이러스 스캔은 범위 밖).
//
// 2026-09-05: '금지 목록'에서 '허용 목록'으로 뒤집었다.
//   금지 목록(exe·bat·sh …) 방식은 목록에 없는 형식이 그대로 통과한다. 실제로
//   html·svg가 빠져 있었는데, 이 둘은 <script>를 품을 수 있고 첨부는 /api/notes/{id}/content
//   가 서명 URL로 열어주므로 스토리지 도메인에서 스크립트가 실행될 수 있었다.
//   허용 목록은 빠뜨렸을 때의 결과가 '보안 구멍'이 아니라 '이 형식이 안 올라감'이라
//   사용자 신고로 반드시 드러난다 — 실패해도 안전한 쪽으로 기운다.
// 2026-09-08: pptx 추가. 발표자료를 보관함에 올리고 싶다는 요구에서 나왔다.
//   구형 .ppt 와 매크로를 품을 수 있는 .pptm 은 일부러 넣지 않는다 — 이 목록을
//   허용 방식으로 만든 이유가 "빠뜨렸을 때 보안 구멍이 아니라 안 올라감으로 드러난다"
//   이므로, 꼭 필요한 하나만 늘린다.
const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "pdf", "pptx"];

// 확장자는 파일 이름의 일부일 뿐이라 내용과 무관하다(virus.exe → photo.png 로 바꾸면 통과).
// mimeType 도 클라이언트가 보내는 값이라 그 자체로는 증거가 못 되지만, 두 값이 서로
// 어긋나는 요청을 걸러내는 정도의 값은 있어 함께 검사한다.
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

// 브라우저가 화면에 그려줄 수 있는 형식. 사진은 <img>, PDF 는 브라우저 내장 뷰어가 연다.
//
// pptx 는 여기에 들어가지 않는다 — 브라우저에 파워포인트 뷰어가 없어서, 새 창으로 열면
// 빈 화면이 뜨거나 그냥 내려받아진다. 온라인 뷰어(오피스·구글)에 맡기는 길도 있지만
// 그러려면 파일이 인터넷에 공개돼 있어야 해서(그쪽 서버가 직접 가져간다) 쓰지 않는다.
// 미리보기가 필요하면 PDF 로 내보내 함께 올리고, pptx 는 고칠 때 쓰는 원본으로 둔다.
const PREVIEWABLE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
];

// 미리보기가 되는 형식인가. 안 되는 형식은 새 창에 띄우지 말고 내려받게 해야 한다
// (app/api/notes/[id]/content 의 Content-Disposition 참고).
export function isPreviewableMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return PREVIEWABLE_MIME_TYPES.includes(mimeType.split(";")[0].trim().toLowerCase());
}

// 화면의 <input accept>에 그대로 쓴다 — 파일 선택창 필터와 서버 규칙이 어긋나지 않게
// 한 곳에서 관리한다. (accept 는 강제력이 없는 편의 기능이고, 강제는 서버가 한다)
export const ACCEPT_ATTRIBUTE = ALLOWED_MIME_TYPES.join(",");

// 50MB 로 되돌렸다 (2026-09-10).
//   2026-09-08 에 100MB 로 올렸었다 — 발표자료(PPT를 PDF로 내보낸 것)처럼 사진이 많이
//   들어간 자료가 50MB를 넘기는 일이 있었기 때문이다. 그런데 Supabase 무료 플랜은
//   파일 하나당 50MB 가 플랫폼 차원의 상한이라, 앱과 버킷만 100MB 로 올려두면 업로드가
//   스토리지 단계에서 거부된다 — 사용자에게는 원인을 알 수 없는 실패로 보인다.
//   셋(앱·버킷·플랫폼)이 어긋난 상태를 두느니 전부 50MB 로 맞춘다.
//   100MB 가 실제로 필요해지면 Pro 플랜으로 올린 뒤 다시 판단한다.
// 무한정 올리지 않는 이유는 저장공간보다
// **전송량**이 먼저 바닥나기 때문이다 — 첨부는 /api/notes/{id}/content 가 바이트를 그대로
// 흘려보내는 구조라, 한 번 열 때마다 Supabase 와 Vercel 양쪽에서 파일 크기만큼 전송량이
// 발생한다(캐시는 60초짜리다). 큰 원본은 앱에 올리는 대신 링크로 두는 쪽이 맞다.
//
// 주의: 이 값을 바꾸면 스토리지 버킷의 file_size_limit 도 같이 올려야 한다.
// 앱만 고치면 업로드가 스토리지 단계에서 거부된다 (supabase/migrations 의 storage_bucket 참고).
export const FILE_MAX_SIZE_MB = Number(process.env.FILE_MAX_SIZE_MB ?? "50");
export const FILE_MAX_SIZE_BYTES = FILE_MAX_SIZE_MB * 1024 * 1024;

// 휴지통 항목은 이 기간이 지나면 크론이 자동으로 완전 삭제한다.
//
// 30일 → 7일 (2026-09-07). 30일은 "혹시 몰라 넉넉히" 잡은 값이었는데, 실제로는
// 잘못 지운 것을 되돌리는 일이 하루 이틀 안에 일어난다. 그 사이 스토리지에는 지운
// 파일이 계속 쌓여 있고, 관리자 화면에도 오래된 항목이 밀려 정작 최근 것을 못 본다.
// 되돌릴 기회는 일주일이면 충분하고, 급하면 관리자가 휴지통 화면에서 직접 비운다.
export const TRASH_RETENTION_DAYS = 7;

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export function isAllowedExtension(fileName: string): boolean {
  return ALLOWED_EXTENSIONS.includes(getExtension(fileName));
}

export function isAllowedMimeType(mimeType: string): boolean {
  // "image/png; charset=..." 처럼 파라미터가 붙어 오는 경우가 있어 앞부분만 본다.
  return ALLOWED_MIME_TYPES.includes(mimeType.split(";")[0].trim().toLowerCase());
}

export function isOversized(sizeBytes: number): boolean {
  return sizeBytes > FILE_MAX_SIZE_BYTES;
}
