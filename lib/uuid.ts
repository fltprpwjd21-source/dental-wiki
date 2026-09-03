// 문서 id는 uuid다. 주소창에 uuid가 아닌 값이 들어오면 DB가 형식 오류를 내고
// 그것이 500(서버 오류)으로 나가버린다. 사용자 잘못을 서버 잘못으로 보고하지 않도록
// 라우트 진입 시점에 형식을 먼저 확인해 404로 처리한다.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
