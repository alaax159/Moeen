/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  beginLatestRequest,
  isLatestRequest,
  type RequestGenerationState,
} from "./request-generation";

test("a newer request makes an older request stale", () => {
  const state: RequestGenerationState = {
    generation: 0,
  };

  const first = beginLatestRequest(state);

  assert.equal(isLatestRequest(state, first), true);

  const second = beginLatestRequest(state);

  assert.equal(isLatestRequest(state, first), false);
  assert.equal(isLatestRequest(state, second), true);
});

test("a retry for the same target still invalidates the earlier request", () => {
  const state: RequestGenerationState = {
    generation: 0,
  };

  const originalRequest = beginLatestRequest(state);
  const retryRequest = beginLatestRequest(state);

  assert.equal(isLatestRequest(state, originalRequest), false);
  assert.equal(isLatestRequest(state, retryRequest), true);
});
