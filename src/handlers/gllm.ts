interface GLLMEnv { 
}

// /gllm handler
export async function handleGLLMRequest(request: Request, _env: GLLMEnv): Promise<Response> {
    try {
        const url = new URL(request.url);
        const targetUrl = 'https://generativelanguage.googleapis.com' 
                            + url.pathname.replace('/gllm', '') + url.search;

        // 构建新的请求
        const newHeaders = new Headers(request.headers);
        newHeaders.delete('Host');  // 删除原始的 Host 头
        
        const newRequest = new Request(targetUrl, {
            method: request.method,
            headers: newHeaders,
            body: request.body,
        });

        const response = await fetch(newRequest);
        
        // 创建新的响应
        const responseHeaders = new Headers(response.headers);
        if (!responseHeaders.has('Access-Control-Allow-Origin')) {//保证不会设置多个Access-Control-Allow-Origin
            responseHeaders.set('Access-Control-Allow-Origin', '*');
        }

        const newResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });

        return newResponse;
    } catch (error) {
        return handleGLLMError("Failed to proxy GLLM request", error);
    }
}

function handleGLLMError(message: string, error: unknown): Response {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({
        error: message,
        message: errorMessage,
        details: String(error)
    }), {
        status: 500,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
    });
}