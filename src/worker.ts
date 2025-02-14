import {proxyRequest} from './handlers/proxy.ts';

interface Env {
    OAUTH_STORE: KVNamespace;
    BDPAN_APP_KEY: string;
    BDPAN_APP_SECRET: string;
    BDPAN_REDIRECT_URI: string;
}

interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    expires_at?: number;
}

async function handleIpRequest(_request: Request): Promise<Response> {
    const response = await fetch( new Request("https://ipinfo.io/json",{
        method: "GET"
    }))
    
    const responseHeaders = new Headers(response.headers);
    if (!responseHeaders.has('Access-Control-Allow-Origin')) { //保证不会设置多个Access-Control-Allow-Origin
        responseHeaders.set('Access-Control-Allow-Origin', '*');
    }
    
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
    });
}

function handleCorsPreflightRequest(request: Request): Response {
    const requestHeaders = 
        request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization';
    
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, HEAD, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": requestHeaders,
        },
    });
}

async function handleGLLMRequest(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = 'https://generativelanguage.googleapis.com' 
                        + url.pathname.replace('/gllm', '') + url.search;

    return proxyRequest(request,targetUrl, "Failed to proxy GLLM request");
}

async function handleProxyRequest(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
        return new Response("Missing proxy url parameter", { status: 400 });
    }
    return proxyRequest(request,targetUrl, "Failed to proxy request");
}

async function handleNotionRequest(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = 'https://api.notion.com' 
                        + url.pathname.replace('/notion-api', '') + url.search;

    const response = await proxyRequest(request,targetUrl, "Failed to proxy Notion api request");
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Notion-Version');
    return response;
} 

async function handleShonagonRequest(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = 'https://shonagon.ninjal.ac.jp/api/' 
                        + url.pathname.replace('/shonagon-api', '') + url.search;

    return proxyRequest(request,targetUrl, "Failed to proxy Shonagon request");
}

async function handleAuthorize(url: URL, env: Env): Promise<Response> {
    const response_type = url.searchParams.get('response_type') ?? 'code' //code,token,..
    const scope = url.searchParams.get('scope') ?? 'basic,netdisk'
    const state = url.searchParams.get('state') ?? 'PIGGS'
    const display = url.searchParams.get('display') ?? 'page'

    const appKey = env.BDPAN_APP_KEY;
    const appSecret = env.BDPAN_APP_SECRET;
    const redirect_uri = env.BDPAN_REDIRECT_URI;

    if (redirect_uri == null) {
        return new Response("Redirect URI not set", { status: 400 });
    }
    if (!appKey || !appSecret) {
        return new Response("App credentials not found", { status: 400 });
    }

    const params = new URLSearchParams({
        client_id : appKey,
        response_type,
        redirect_uri,
        scope,
        state,
        display
    });

    return new Response(null, {
        status: 303,
        headers: {
            Location: `https://openapi.baidu.com/oauth/2.0/authorize?${params}`
        }
    });
}

async function handleToken(url: URL, env: Env): Promise<Response> {
    try {
        const code = url.searchParams.get('code') ?? ''
        const redirect_uri = env.BDPAN_REDIRECT_URI;

        const appKey = env.BDPAN_APP_KEY;
        const appSecret = env.BDPAN_APP_SECRET;

        if (redirect_uri == null) {
            return new Response("Redirect URI not set", { status: 400 });
        }
        if (!appKey || !appSecret) {
            return new Response("App credentials not found", { status: 400 });
        }

        const params = new URLSearchParams({
            client_id: appKey,
            client_secret: appSecret,
            code,
            redirect_uri,
            grant_type: "authorization_code",
        });

        const tokenResponse = await fetch(`https://openapi.baidu.com/oauth/2.0/token?${params}`, {
            method: "GET",
        });

        // 添加过期时间戳
        const tokenData:TokenResponse = await tokenResponse.json();
        if (tokenData.expires_in) {
            tokenData.expires_at = Date.now() + (tokenData.expires_in * 1000);
        }

        return new Response(JSON.stringify(tokenData), {
            status: tokenResponse.status,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
        });
    } catch (error) {
        return handleError("Failed to get token", error);
    }
} 

async function handleRefresh(url: URL, env: Env): Promise<Response> {
    try {
        const refresh_token = url.searchParams.get('refresh_token') ?? ''
        const appKey = env.BDPAN_APP_KEY;
        const appSecret = env.BDPAN_APP_SECRET;

        if (!appKey || !appSecret) {
            return new Response("App credentials not found", { status: 400 });
        }

        const params = new URLSearchParams({
            client_id: appKey,
            client_secret: appSecret,
            refresh_token,
            grant_type: "refresh_token",
        });

        const refreshResponse = await fetch(`https://openapi.baidu.com/oauth/2.0/token?${params}`, {
            method: "GET",
        });

        // 添加过期时间戳
        const refreshData:TokenResponse = await refreshResponse.json();
        if (refreshData.expires_in) {
            refreshData.expires_at = Date.now() + (refreshData.expires_in * 1000);
        }

        return new Response(JSON.stringify(refreshData), {
            status: refreshResponse.status,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
        });
    } catch (error) {
        return handleError("Failed to refresh token", error);
    }
}

function handleError(message: string, error: unknown): Response {
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

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // CORS 预检请求处理
        if (request.method === "OPTIONS") {
            return handleCorsPreflightRequest(request);
        }

        switch (url.pathname) {
            case "/ip":
                return handleIpRequest(request);
            case "/oauth/authorize":
                return handleAuthorize(url, env);
            case "/oauth/token":
                return handleToken(url, env);
            case "/oauth/refresh":
                return handleRefresh(url, env);
            default:
                if(url.pathname.startsWith("/gllm")){
                    return handleGLLMRequest(request, env);
                }else if(url.pathname.startsWith("/notion-api")){
                    return handleNotionRequest(request, env);
                }else if(url.pathname.startsWith("/shonagon-api")){
                    return handleShonagonRequest(request, env);
                }else if(url.pathname.startsWith("/proxy")){
                    return handleProxyRequest(request, env);
                }
                return new Response("Not found", { status: 404 });
        }
    }

};