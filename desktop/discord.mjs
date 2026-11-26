import { connect } from 'node:net';
import { discordActivity, discordFrame, discordSockets } from './shell.mjs';

// The Discord Developer Portal application whose name and `logo` asset the status shows.
const CLIENT_ID = '1575313195311042610';
const RETRY_MS = 30_000;

// Shows the open tree as the learner's Discord status; without a running Discord client every call does nothing.
export function discordPresence() {
    const start = Date.now();
    let socket = null,
        ready = false,
        title = null;
    const send = () =>
        ready &&
        socket.write(
            discordFrame(1, {
                cmd: 'SET_ACTIVITY',
                args: { pid: process.pid, activity: discordActivity(title, start) },
                nonce: String(Date.now()),
            }),
        );
    const tryPaths = (paths) => {
        if (!paths.length) return void setTimeout(open, RETRY_MS).unref();
        const s = connect(paths[0]);
        s.once('error', () => tryPaths(paths.slice(1)));
        s.once('connect', () => {
            s.removeAllListeners('error');
            socket = s;
            s.write(discordFrame(0, { v: 1, client_id: CLIENT_ID }));
            // Discord answers the handshake with READY before it accepts an activity.
            s.once('data', () => {
                ready = true;
                send();
            });
            s.on('error', () => {});
            s.once('close', () => {
                socket = null;
                ready = false;
                setTimeout(open, RETRY_MS).unref();
            });
        });
    };
    const open = () => CLIENT_ID && tryPaths(discordSockets(process.platform, process.env));
    open();
    return (next) => {
        title = typeof next === 'string' ? next : null;
        send();
    };
}
