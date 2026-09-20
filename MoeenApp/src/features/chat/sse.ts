export interface ParsedSseEvent {
  event: string;
  data: string;
}

export interface SseParseResult {
  events: ParsedSseEvent[];
  remainder: string;
}

function parseEventBlock(block: string): ParsedSseEvent | null {
  let event = "message";
  const dataLines: string[] = [];

  for (let rawLine of block.split("\n")) {
    if (rawLine.endsWith("\r")) {
      rawLine = rawLine.slice(0, -1);
    }

    if (!rawLine || rawLine.startsWith(":")) {
      continue;
    }

    if (rawLine.startsWith("event:")) {
      event = rawLine.slice("event:".length).replace(/^ /, "");
      continue;
    }

    if (rawLine.startsWith("data:")) {
      dataLines.push(rawLine.slice("data:".length).replace(/^ /, ""));
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

export function consumeSseBuffer(input: string, flush = false): SseParseResult {
  const normalized = input.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");

  let remainder = "";

  if (!flush) {
    remainder = blocks.pop() ?? "";
  }

  const events: ParsedSseEvent[] = [];

  for (const block of blocks) {
    const parsed = parseEventBlock(block);

    if (parsed) {
      events.push(parsed);
    }
  }

  if (flush && remainder.trim()) {
    const parsed = parseEventBlock(remainder);

    if (parsed) {
      events.push(parsed);
    }

    remainder = "";
  }

  return {
    events,
    remainder,
  };
}
