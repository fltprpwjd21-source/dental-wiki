import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPT_ATTRIBUTE,
  isAllowedExtension,
  isAllowedMimeType,
  isPreviewableMimeType,
} from "../../lib/file-rules.ts";

// 왜 이 검사가 필요한가
//   첨부 형식 규칙은 세 곳이 서로 맞아야 한다 — 업로드를 통과시키는 허용 목록,
//   파일 선택창의 accept 필터, 그리고 "새 창으로 열지 내려받게 할지"를 정하는
//   미리보기 목록이다. 한 곳만 고치면 증상이 조용하다.
//     · 허용 목록에만 넣고 accept 를 빠뜨리면 → 파일 선택창에 안 보인다
//     · 허용 목록에만 넣고 미리보기 목록을 손보지 않으면 → 새 창이 빈 화면으로 열린다
//   pptx(2026-09-08 추가)가 정확히 두 번째 경우라, 그 조합을 여기서 고정한다.

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

describe("첨부 허용 형식", () => {
  test("사진·PDF·pptx 는 올릴 수 있다", () => {
    for (const name of ["사진.png", "x.JPG", "발표.pdf", "발표자료.pptx"]) {
      assert.equal(isAllowedExtension(name), true, name);
    }
  });

  test("구형 ppt 와 매크로 pptm 은 막는다", () => {
    // 허용 목록을 쓰는 이유가 "필요한 것만 하나씩 늘린다" 이므로 함께 열리지 않게 고정한다.
    assert.equal(isAllowedExtension("발표.ppt"), false);
    assert.equal(isAllowedExtension("발표.pptm"), false);
  });

  test("실행 파일과 스크립트를 품는 형식은 막는다", () => {
    for (const name of ["virus.exe", "run.sh", "page.html", "icon.svg", "확장자없음"]) {
      assert.equal(isAllowedExtension(name), false, name);
    }
  });

  test("mimeType 뒤에 파라미터가 붙어 와도 통과한다", () => {
    assert.equal(isAllowedMimeType("image/png; charset=binary"), true);
    assert.equal(isAllowedMimeType(PPTX_MIME), true);
    assert.equal(isAllowedMimeType("application/vnd.ms-powerpoint"), false);
  });
});

describe("미리보기 가능 여부", () => {
  test("브라우저가 그릴 수 있는 형식만 참이다", () => {
    for (const mime of ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]) {
      assert.equal(isPreviewableMimeType(mime), true, mime);
    }
  });

  test("pptx 는 미리보기가 안 된다 — 새 창이 아니라 내려받기로 처리해야 한다", () => {
    assert.equal(isPreviewableMimeType(PPTX_MIME), false);
  });

  test("mime 을 모르는 첨부는 미리보기로 치지 않는다", () => {
    // 예전 첨부에는 mime_type 이 비어 있을 수 있다. 그때 빈 창을 띄우는 쪽으로 기울면 안 된다.
    assert.equal(isPreviewableMimeType(null), false);
    assert.equal(isPreviewableMimeType(undefined), false);
    assert.equal(isPreviewableMimeType(""), false);
  });

  test("미리보기 목록은 허용 목록의 부분집합이다", () => {
    // 미리보기만 되고 업로드는 안 되는 형식이 생기면 규칙이 어긋난 것이다.
    for (const mime of ACCEPT_ATTRIBUTE.split(",")) {
      if (isPreviewableMimeType(mime)) assert.equal(isAllowedMimeType(mime), true, mime);
    }
  });

  test("accept 필터에 pptx 가 들어 있다 — 파일 선택창에서 고를 수 있어야 한다", () => {
    assert.ok(ACCEPT_ATTRIBUTE.includes(PPTX_MIME));
  });
});
