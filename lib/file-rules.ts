// Design §7: 업로드 가능한 형식은 서버에서 확장자로 강제한다 (바이러스 스캔은 범위 밖).
//
// 2026-09-05: '금지 목록'에서 '허용 목록'으로 뒤집었다.
//   금지 목록(exe·bat·sh …) 방식은 목록에 없는 형식이 그대로 통과한다. 실제로
//   html·svg가 빠져 있었는데, 이 둘은 <script>를 품을 수 있고 첨부는 /api/notes/{id}/content
//   가 서명 URL로 열어주므로 스토리지 도메인에서 스크립트가 실행될 수 있었다.
//   허용 목록은 빠뜨렸을 때의 결과가 '보안 구멍'이 아니라 '이 형식이 안 올라감'이라
//   사용자 신고로 반드시 드러난다 — 실패해도 안전한 쪽으로 기운다.
const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "pdf"];

// 확장자는 파일 이름의 일부일 뿐이라 내용과 무관하다(virus.exe → photo.png 로 바꾸면 통과).
// mimeType 도 클라이언트가 보내는 값이라 그 자체로는 증거가 못 되지만, 두 값이 서로
// 어긋나는 요청을 걸러내는 정도의 값은 있어 함께 검사한다.
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
];

// 화면의 <input accept>에 그대로 쓴다 — 파일 선택창 필터와 서버 규칙이 어긋나지 않게
// 한 곳에서 관리한다. (accept 는 강제력이 없는 편의 기능이고, 강제는 서버가 한다)
export const ACCEPT_ATTRIBUTE = ALLOWED_MIME_TYPES.join(",");

export const FILE_MAX_SIZE_MB = Number(process.env.FILE_MAX_SIZE_MB ?? "50");
export const FILE_MAX_SIZE_BYTES = FILE_MAX_SIZE_MB * 1024 * 1024;

// Plan FR-06: 휴지통 파일은 30일 후 자동 완전 삭제된다.
export const TRASH_RETENTION_DAYS = 30;

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
