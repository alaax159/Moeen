/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";

import { applyAssistantDelta, failAssistantDelivery } from "./chat-state";

test("mid-stream failure preserves partial assistant text", () => {
  const failed = failAssistantDelivery(
    {
      text: "This medicine ",
      status: "streaming",
    },
    "Connection lost",
  );

  assert.deepEqual(failed, {
    text: "This medicine ",
    status: "failed",
    error: "Connection lost",
  });
});

test("retry replaces the previous partial text on its first delta", () => {
  const retried = applyAssistantDelta(
    {
      text: "This med",
      status: "failed",
      error: "Connection lost",
    },
    "This medicine ",
    true,
  );

  assert.deepEqual(retried, {
    text: "This medicine ",
    status: "streaming",
  });

  assert.deepEqual(applyAssistantDelta(retried, "is used for..."), {
    text: "This medicine is used for...",
    status: "streaming",
  });
});
