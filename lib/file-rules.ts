// Design §7: 실행 파일 계열은 서버에서 확장자로 차단한다 (바이러스 스캔은 범위 밖).
const FORBIDDEN_EXTENSIONS = [
  "exe", "bat", "cmd", "com", "msi", "scr", "sh", "ps1", "vbs", "jar", "apk", "dll", "app",
];

export const FILE_MAX_SIZE_MB = Number(process.env.FILE_MAX_SIZE_MB ?? "50");
export const FILE_MAX_SIZE_BYTES = FILE_MAX_SIZE_MB * 1024 * 1024;

// Plan FR-06: 휴지통 파일은 30일 후 자동 완전 삭제된다.
export const TRASH_RETENTION_DAYS = 30;

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export function isForbiddenExtension(fileName: string): boolean {
  return FORBIDDEN_EXTENSIONS.includes(getExtension(fileName));
}

export function isOversized(sizeBytes: number): boolean {
  return sizeBytes > FILE_MAX_SIZE_BYTES;
}
