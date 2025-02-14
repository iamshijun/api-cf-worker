import worker from "./src/worker.ts";

const port = +(Deno.env.get("PORT") ?? 8100);

Deno.serve({port}, worker.fetch);