// ChatGPT OAuth and Claude Code sign-in. ChatGPT: start returns the sign-in URL; the callback is the only permitted cross-site navigation.
export async function authRoutes(req, res, url, ctx) {
    if (req.method === 'GET' && url.pathname === '/auth/callback') {
        try {
            await ctx.auth.callback(url);
            // A page, not a redirect: the browser marks a redirect from here cross-site, and the app refuses it.
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(
                '<!doctype html><title>Rabbithole</title><p>Signed in to ChatGPT. Return to Rabbithole, or <a href="/">open it here</a>.</p>',
            );
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
    // Claude Code signs in through its own CLI; without a printed address the learner runs the command.
    if (req.method === 'POST' && url.pathname === '/api/claude/login')
        return ctx.json(
            res,
            200,
            (await ctx.providers.claude.login()) ?? { command: 'claude auth login' },
        );
    return false;
}
