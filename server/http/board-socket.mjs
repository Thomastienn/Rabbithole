import http from 'node:http';
import { WebSocketServer } from 'ws';
import { boardSession } from '../board/session.mjs';

// One WebSocket per open board at /api/trees/<id>/board (docs/board-spec.md); chat replies stay on server-sent events.
export function boardSockets(ctx, server) {
    const sockets = new WebSocketServer({ noServer: true, maxPayload: 200000 });
    server.on('upgrade', (req, socket, head) => {
        socket.on('error', () => {});
        const refuse = (status) =>
            socket.end(
                `HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\n\r\n`,
            );
        const origin = ctx.origin();
        const url = URL.parse(req.url, origin);
        const id = url?.pathname.match(/^\/api\/trees\/([^/]+)\/board$/)?.[1];
        if (!id || ctx.stopping) return refuse(404);
        // A socket opens the board like a POST would: from this app's own page, with its CSRF token in the address.
        if (
            req.headers.host !== new URL(origin).host ||
            req.headers.origin !== origin ||
            url.searchParams.get('csrf') !== ctx.csrf
        )
            return refuse(403);
        if (!ctx.store.header(id)) return refuse(404);
        sockets.handleUpgrade(req, socket, head, (ws) =>
            boardSession(ctx, id, ws, url.searchParams.get('mode') === 'guided'),
        );
    });
}
