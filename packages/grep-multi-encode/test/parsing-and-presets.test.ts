// Test perspectives (abbreviated; full matrix in repo plan). Case IDs: TC-N-01..04, TC-A-01..03, TC-B-01..03.

import { describe, expect, it } from "vitest";
import { clampDebounceMs, normalizeEncodingPresetId, resolveEncodingPreset } from "../src/encodingPresets";
import { parseCommaSeparated } from "../src/inputParsing";
import { pathMatchesIncludeGlobs } from "../src/globRules";

describe("parseCommaSeparated", () => {
  it("TC-N-01: splits and trims comma-separated segments", () => {
    // Given: comma-separated string with spaces
    // When: parsed
    // Then: trimmed non-empty segments in order
    expect(parseCommaSeparated("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("TC-A-01: empty string yields empty array", () => {
    // Given: empty input
    // When: parsed
    // Then: no segments
    expect(parseCommaSeparated("")).toEqual([]);
    expect(parseCommaSeparated("  ,  , ")).toEqual([]);
  });
});

describe("normalizeEncodingPresetId / resolveEncodingPreset", () => {
  it("TC-N-02: utf8 preset returns UTF-8 only", () => {
    // Given: utf8 preset and arbitrary settings list
    // When: resolved
    // Then: only utf8
    expect(resolveEncodingPreset("utf8", ["shift_jis", "utf8"])).toEqual(["utf8"]);
  });

  it("TC-N-05: ja preset includes Japanese encodings in fixed order", () => {
    // Given: ja preset
    // When: resolved
    // Then: shift_jis and euc-jp appear after utf8
    const list = resolveEncodingPreset("ja", ["utf8"]);
    expect(list[0]).toBe("utf8");
    expect(list).toContain("shift_jis");
    expect(list).toContain("euc-jp");
  });

  it("TC-N-06: cjk preset is wider than ja", () => {
    // Given: cjk preset
    // When: resolved
    // Then: contains gb18030
    expect(resolveEncodingPreset("cjk", ["utf8"])).toContain("gb18030");
  });

  it("TC-N-07: normalizeEncodingPresetId keeps known ids", () => {
    // Given: known preset strings
    // When: normalized
    // Then: same id
    expect(normalizeEncodingPresetId("ja")).toBe("ja");
    expect(normalizeEncodingPresetId("cjk")).toBe("cjk");
  });

  it("TC-A-02: unknown preset id falls back to settings order", () => {
    // Given: invalid preset key
    // When: normalized and resolved
    // Then: same as settings encodings
    expect(normalizeEncodingPresetId("not-a-real-preset")).toBe("settings");
    const settings = ["utf8", "euc-jp"] as const;
    expect(resolveEncodingPreset(normalizeEncodingPresetId("???"), [...settings])).toEqual([...settings]);
  });
});

describe("clampDebounceMs", () => {
  it("TC-B-01: zero clamps to minimum", () => {
    // Given: debounce 0 and min 100 max 5000
    // When: clamped
    // Then: 100
    expect(clampDebounceMs(0, 100, 5000)).toBe(100);
  });

  it("TC-B-02: NaN clamps to minimum", () => {
    // Given: non-finite value
    // When: clamped
    // Then: min
    expect(clampDebounceMs(Number.NaN, 100, 5000)).toBe(100);
  });

  it("TC-B-03: huge value clamps to maximum", () => {
    // Given: value above max
    // When: clamped
    // Then: max
    expect(clampDebounceMs(999_999, 100, 5000)).toBe(5000);
  });
});

describe("pathMatchesIncludeGlobs", () => {
  it("TC-N-03: empty include list matches any path", () => {
    // Given: no include patterns
    // When: checked
    // Then: always true
    expect(pathMatchesIncludeGlobs("any/path.txt", [])).toBe(true);
  });

  it("TC-N-04: glob matches nested typescript file", () => {
    // Given: **\/*.ts pattern
    // When: path is under src
    // Then: matches
    expect(pathMatchesIncludeGlobs("src/components/Foo.ts", ["**/*.ts"])).toBe(true);
  });

  it("TC-A-03: non-matching extension fails", () => {
    // Given: only ts include
    // When: path is php
    // Then: false
    expect(pathMatchesIncludeGlobs("lib/foo.php", ["**/*.ts"])).toBe(false);
  });
});
