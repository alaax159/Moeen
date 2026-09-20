/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";

import { consumeSseBuffer } from "./sse";

test("parses session, delta and done events across chunk boundaries", () => {
  const first = consumeSseBuffer(
    'event: session\ndata: {"sessionId":22}\n\n' +
      'event: delta\ndata: {"text":"Hel',
  );

  assert.deepEqual(first.events, [
    {
      event: "session",
      data: '{"sessionId":22}',
    },
  ]);

  const second = consumeSseBuffer(
    first.remainder +
      'lo "}\n\nevent: done\ndata: {"citations":["label-chunk-42"],"validationStatus":"accepted","promptVersion":"v1"}\n\n',
  );

  assert.deepEqual(second.events, [
    {
      event: "delta",
      data: '{"text":"Hello "}',
    },
    {
      event: "done",
      data: '{"citations":["label-chunk-42"],"validationStatus":"accepted","promptVersion":"v1"}',
    },
  ]);

  assert.equal(second.remainder, "");
});

test("keeps an incomplete event buffered", () => {
  const result = consumeSseBuffer('event: delta\ndata: {"text":"partial"}');

  assert.equal(result.events.length, 0);
  assert.equal(result.remainder, 'event: delta\ndata: {"text":"partial"}');
});
