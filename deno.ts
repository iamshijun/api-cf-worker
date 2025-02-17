import worker from "./src/worker.ts";

// ... existing code ...

function handleWebSocketRequest(request: Request, proxyUrl?: string): Response {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    // 获取目标 WebSocket 服务器地址
    let targetUrl = proxyUrl ?? url.searchParams.get('url');
    if (!targetUrl) {
        targetUrl = 'wss://www.asitanokibou.site/ws'; // 默认目标
    }

    // 转换协议
    if (targetUrl.startsWith('http://')) {
        targetUrl = targetUrl.replace('http://', 'ws://');
    } else if (targetUrl.startsWith('https://')) {
        targetUrl = targetUrl.replace('https://', 'wss://');
    } else if (!targetUrl.startsWith('ws://') && !targetUrl.startsWith('wss://')) {
        targetUrl = 'wss://' + targetUrl;
    }
    console.log('targetUrl:', targetUrl);

    try {
        // 创建到目标服务器的 WebSocket 连接
        const targetWs = new WebSocket(targetUrl);
        
        // 使用 Deno 的 WebSocket 升级
        const { socket: clientWs, response } = Deno.upgradeWebSocket(request);

        // 处理目标服务器消息
        targetWs.onmessage = (event) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(event.data);
            }
        };

        // 处理客户端消息
        clientWs.onmessage = (event) => {
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(event.data);
            }
            if (event.data === 'close') {
                clientWs.close();
            }
        };

        // 错误处理
        targetWs.onerror = (error) => {
            console.error('Target WebSocket error:', error);
            clientWs.close();
        };

        clientWs.onerror = (error) => {
            console.error('Client WebSocket error:', error);
            targetWs.close();
        };

        // 关闭处理
        targetWs.onclose = (event) => {
            console.log('Target WebSocket closed');
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(event.code, event.reason);
            }
        };

        clientWs.onclose = (event) => {
            console.log('Client WebSocket closed');
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.close(event.code, event.reason);
            }
        };

        return response;
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'Failed to establish WebSocket connection',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: String(error)
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
}

const port = +(Deno.env.get("PORT") ?? 8100);

// deno-lint-ignore require-await
Deno.serve({port}, async (request: Request) => {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/ws')) {
        return handleWebSocketRequest(request);
    }
    
    return worker.fetch(request,{});
});