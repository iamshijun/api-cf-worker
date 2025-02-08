import { Buffer } from "node:buffer";

const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;

async function parseStream(chunk, controller) {
  chunk = await chunk;
  if (!chunk) { return; }
  this.buffer += chunk;
  do {
    const match = this.buffer.match(responseLineRE);
    if (!match) { break; }
    controller.enqueue(match[1]);
    this.buffer = this.buffer.substring(match[0].length);
  } while (true);
}

async function parseStreamFlush(controller) {
  if (this.buffer) {
    console.error("Invalid data:", this.buffer);
    controller.enqueue(this.buffer);
  }
}

export function isEventStream(response) {
  const contentType = response.headers.get("content-type");
  return contentType && (
    contentType.includes("text/event-stream") ||
    contentType.includes("application/x-ndjson")
  );
}

export function createStreamProcessor(transform) {
  return (response) => {
    if (!isEventStream(response)) {
      return response;
    }

    const { body } = response;
    const newBody = body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TransformStream({
        transform: parseStream,
        flush: parseStreamFlush,
        buffer: "",
      }));

    // 如果提供了转换函数，则应用转换
    const processedBody = transform
      ? newBody.pipeThrough(transform) : newBody

    const finalBody = processedBody.pipeThrough(new TextEncoderStream());

    return new Response(finalBody, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };
}