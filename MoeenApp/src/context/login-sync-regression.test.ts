/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootLayoutSource = readFileSync("src/app/_layout.tsx", "utf8");
const authApiSource = readFileSync("src/features/auth/api.ts", "utf8");

test("authenticated sync never replaces the app with a blank screen", () => {
  assert.doesNotMatch(
    rootLayoutSource,
    /if\s*\(loading[^)]*\)\s*\{\s*return null;\s*\}/s,
  );
  assert.match(rootLayoutSource, /ActivityIndicator/);
});

test("authenticated sync has a bounded network wait", () => {
  assert.match(authApiSource, /AbortController/);
  assert.match(authApiSource, /setTimeout/);
});
