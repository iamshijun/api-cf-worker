import { creastreteStreamProcessor, isEventStream } from "../utils/stream.ts";//deno 要指定后缀名?


export async function proxyRequest(request: Request, targetUrl: string, 
            errorHandler?:  ((error: any) => Response) | string ): Promise<Response> {
    try {
        // 构建新的请求
        const newHeaders = new Headers(request.headers);
        newHeaders.delete('Host');  // 删除原始的 Host 头
        newHeaders.delete('cf-connecting-ip');  // 删除 CF 的客户端 IP 头
        newHeaders.delete('x-real-ip');        // 删除真实 IP 头
        newHeaders.delete('x-forwarded-for');  // 删除转发 IP 头
        newHeaders.delete('referer');          // 删除 Referer 头
        
        const newRequest = new Request(targetUrl, {
            method: request.method,
            headers: newHeaders,
            body: request.body,
        });

        const response = await fetch(newRequest);

        if(isEventStream(response)){
            const processor = creastreteStreamProcessor();
            const streamResponse = processor(response);
            return fixCors(streamResponse); 
        }else{
            return fixCors(response); 
        }
    } catch (error: any) {
        if(typeof errorHandler === "function"){
            return errorHandler?.(error);
        }else{
            const msg = typeof errorHandler === "string" ? errorHandler :  `Failed to fetch resource ${targetUrl}`
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            return new Response(JSON.stringify({
                error: errorMessage,
                message: msg,
                details: String(error)
            }), {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            });
 
        }
    }
}

function fixCors(response: Response) {
    const responseHeaders = new Headers(response.headers);
    if (!responseHeaders.has('Access-Control-Allow-Origin')) { //保证不会设置多个Access-Control-Allow-Origin
        responseHeaders.set('Access-Control-Allow-Origin', '*');
    }
 
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
    });;
}
