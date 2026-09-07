import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // git worktree 가 myapp 안(.claude/worktrees/)에 만들어져, 그 안의 .next 빌드
    // 산출물까지 검사 대상이 됐다. 위 ".next/**" 는 최상위만 가리키므로 걸러지지
    // 않아 lint 가 1600건 넘는 에러를 뱉었다 — 전부 남의 빌드 결과물이었다.
    ".claude/**",
  ]),
]);

export default eslintConfig;
