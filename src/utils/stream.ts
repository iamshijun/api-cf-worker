
const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
const delimiter = "\n\n";

export function isEventStream(response: Response): boolean {
    const contentType = response.headers.get("content-type");
    return !!contentType && (
        contentType.includes("text/event-stream") ||
        contentType.includes("application/x-ndjson")
    );
}

export function creastreteStreamProcessor(
    transforms?: TransformStream<string, string> | TransformStream<string, string>[]
): (response: Response) => Response {
    return (response: Response): Response => {
        if (!isEventStream(response)) {
            return response;
        }

        const { body } = response;
        if (!body) {
            throw new Error("Response body is null");
        }

        const context = new SSEStreamContext()

        const newBody = body
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new TransformStream<string, string>({
                transform: context.parseStream,
                flush: context.parseStreamFlush,
            }));

        // 如果提供了转换函数，则应用转换
        let processedBody = newBody
        if (transforms) {
            const transformsArray = Array.isArray(transforms) ? transforms : [transforms];
            transformsArray.forEach((transform) => {
                processedBody = processedBody.pipeThrough(transform);
            });
        }

        const finalBody = processedBody
            .pipeThrough(new TransformStream<string, string>({
                transform: (chunk, controller) => {
                    controller.enqueue("data: " + chunk + delimiter);
                },
                flush: (controller) => {
                    controller.enqueue("data: [DONE]" + delimiter);
                },
            }))
            .pipeThrough(new TextEncoderStream());

        return new Response(finalBody, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText,
        });
    };
}

class SSEStreamContext {
    buffer: string = '';

    parseStream(
        chunk: string,
        controller: TransformStreamDefaultController<string>
    ): void { 
        if (!chunk) { return; }
        this.buffer += chunk;
        do {
            const match = this.buffer.match(responseLineRE);
            if (!match) {  break;  }
            controller.enqueue(match[1]);
            this.buffer = this.buffer.substring(match[0].length);
        } while (true);
    }

    parseStreamFlush(
        controller: TransformStreamDefaultController<string>
    ) {
        if (this.buffer) {
            console.error("Invalid data:", this.buffer);
            controller.enqueue(this.buffer);
        }
    }


}
