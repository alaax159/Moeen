/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { readChatSseStream, type ChatStreamReader } from "./stream-reader";

test("a killed connection preserves events received before the disconnect", async () => {
  const encoder = new TextEncoder();
  let call = 0;

  const reader: ChatStreamReader = {
    async read() {
      call += 1;

      if (call === 1) {
        return {
          done: false,
          value: encoder.encode(
            'event: session\ndata: {"sessionId":22}\n\n' +
              'event: delta\ndata: {"text":"Partial answer "}\n\n',
          ),
        };
      }

      throw new Error("connection killed");
    },
  };

  const events: {
    event: string;
    data: string;
  }[] = [];

  await assert.rejects(
    readChatSseStream(reader, (event) => {
      events.push(event);
    }),
    /connection killed/,
  );

  assert.deepEqual(events, [
    {
      event: "session",
      data: '{"sessionId":22}',
    },
    {
      event: "delta",
      data: '{"text":"Partial answer "}',
    },
  ]);
});

test("done is terminal and does not wait for EOF or a later connection failure", async () => {
  const encoder = new TextEncoder();
  let readCalls = 0;
  let cancelCalls = 0;

  const reader: ChatStreamReader = {
    async read() {
      readCalls += 1;

      if (readCalls === 1) {
        return {
          done: false,
          value: encoder.encode(
            'event: delta\ndata: {"text":"Complete answer"}\n\n' +
              'event: done\ndata: {"citations":[],"validationStatus":"accepted","promptVersion":"v1"}\n\n',
          ),
        };
      }

      throw new Error("connection failed after done");
    },

    async cancel() {
      cancelCalls += 1;
    },
  };

  const events: {
    event: string;
    data: string;
  }[] = [];

  await readChatSseStream(reader, (event) => {
    events.push(event);
  });

  assert.equal(readCalls, 1);
  assert.equal(cancelCalls, 1);
  assert.deepEqual(
    events.map((event) => event.event),
    ["delta", "done"],
  );
});

test("events after done in the same network chunk are ignored", async () => {
  const encoder = new TextEncoder();

  const reader: ChatStreamReader = {
    async read() {
      return {
        done: false,
        value: encoder.encode(
          'event: done\ndata: {"citations":[],"validationStatus":"accepted","promptVersion":"v1"}\n\n' +
            'event: delta\ndata: {"text":"must not be processed"}\n\n',
        ),
      };
    },

    async cancel() {},
  };

  const events: {
    event: string;
    data: string;
  }[] = [];

  await readChatSseStream(reader, (event) => {
    events.push(event);
  });

  assert.deepEqual(
    events.map((event) => event.event),
    ["done"],
  );
});
