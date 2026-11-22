// Every request to the server goes through this module, so the CSRF token and header live here only.
let csrf = '';

// The chat state sets this from /api/state once it has loaded.
export function setCsrf(token: string) {
    csrf = token;
}

// The raw response, for reads that are not JSON and for streams; a request with init carries the CSRF header.
export function serverFetch(
    path: string,
    init?: RequestInit & { headers?: Record<string, string> },
) {
    return fetch(
        path,
        init && { ...init, headers: { ...init.headers, 'X-Rabbithole-CSRF': csrf } },
    );
}

// GET without a body, otherwise a JSON POST; keepalive lets a write outlive the page that sends it.
export async function request(path: string, body?: unknown, keepalive = false) {
    const response = await serverFetch(
        path,
        body === undefined
            ? undefined
            : {
                  method: 'POST',
                  keepalive,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
              },
    );
    const data = await response.json();
    if (!response.ok)
        throw Object.assign(new Error(data.error ?? 'Request failed. Reload and try again.'), {
            data,
        });
    return data;
}
