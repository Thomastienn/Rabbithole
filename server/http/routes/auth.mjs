// ChatGPT OAuth: start returns the sign-in URL; the callback is the only permitted cross-site navigation.
export async function authRoutes(req, res, url, ctx) {
    if (req.method === 'GET' && url.pathname === '/auth/callback') {
        try {
            await ctx.auth.callback(url);
            res.writeHead(303, { Location: '/' });
            res.end();
        } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(
                'ChatGPT sign-in failed or was declined. Return to Rabbithole and continue with ChatGPT to retry. Your saved trees are available.',
            );
        }
        return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/auth')
        return ctx.json(res, 200, { url: ctx.auth.start(ctx.origin()) });
    return false;
}
