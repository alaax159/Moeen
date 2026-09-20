import { consumeSseBuffer, type ParsedSseEvent } from "./sse";

export interface ChatStreamReader {
  read(): Promise<{
    done: boolean;
    value?: Uint8Array;
  }>;
  cancel?(): Promise<void>;
}

function emitEvents(
  events: readonly ParsedSseEvent[],
  onEvent: (event: ParsedSseEvent) => void,
): boolean {
  for (const event of events) {
    onEvent(event);

    if (event.event === "done") {
      return true;
    }
  }

  return false;
}

export async function readChatSseStream(
  reader: ChatStreamReader,
  onEvent: (event: ParsedSseEvent) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    if (result.value) {
      buffer += decoder.decode(result.value, {
        stream: true,
      });

      const parsed = consumeSseBuffer(buffer);
      buffer = parsed.remainder;

      if (emitEvents(parsed.events, onEvent)) {
        if (reader.cancel) {
          void reader.cancel().catch(() => undefined);
        }

        return;
      }
    }
  }

  buffer += decoder.decode();

  const finalParsed = consumeSseBuffer(buffer, true);
  emitEvents(finalParsed.events, onEvent);
}
