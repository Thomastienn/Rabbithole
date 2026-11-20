import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

// shortcut: the idle process holds about 200 MB, freed after 10 minutes; the first call after that waits for a start-up.
const IDLE = 600000;

// One headless Claude CLI started ahead of time for quick thinking calls a learner waits for. The process stays
// up between calls: each call sets its own model and effort by control request, and /clear empties the
// context after it, so no call sees another.
export class ClaudeRunner {
    constructor(start) {
        this.start = start;
        this.idle = IDLE;
        this.child = null;
        this.busy = false;
    }
    // Starts the process when none runs and restarts the idle countdown.
    open() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.close(), this.idle);
        this.timer.unref?.();
        if (this.child) return;
        let child;
        try {
            child = this.start();
        } catch {
            return; // Claude Code is not installed; calls start their own process and report it.
        }
        this.child = child;
        this.busy = false;
        child.stderr.resume();
        child.stdin.on('error', () => {});
        child.on('error', () => {});
        createInterface({ input: child.stdout }).on('line', (line) => {
            let m;
            try {
                m = JSON.parse(line);
            } catch {
                return;
            }
            // A killed process's last lines never reach the next call.
            if (this.child === child) this.onLine?.(m, line);
        });
        child.on('close', () => {
            if (this.child !== child) return;
            this.child = null;
            this.busy = false;
            this.ended?.();
        });
    }
    // Any quick thinking call keeps an open runner alive.
    touch() {
        if (this.child) this.open();
    }
    // The ready process for one call, or null while another call holds it.
    take() {
        if (this.busy) return null;
        this.open();
        if (!this.child) return null;
        this.busy = true;
        return this.child;
    }
    send(message) {
        this.child?.stdin.write(JSON.stringify(message) + '\n');
    }
    // Applies the call's settings, then sends its message; resolves at its result or when the process ends.
    ask(settings, text, onLine) {
        return new Promise((resolve) => {
            this.ended = resolve;
            this.onLine = (m, line) => {
                if (m.type === 'control_response') {
                    // A refused setting ends the call without a result, so it fails instead of using the wrong model.
                    if (m.response?.subtype !== 'success') return resolve();
                    return this.send({ type: 'user', message: { role: 'user', content: text } });
                }
                onLine(line);
                if (m.type === 'result') resolve();
            };
            this.send({
                type: 'control_request',
                request_id: randomUUID(),
                request: { subtype: 'apply_flag_settings', settings },
            });
        });
    }
    // Clears the finished call's context; the runner is free again once the CLI confirms.
    release(child) {
        if (this.child !== child) return;
        this.ended = null;
        this.onLine = (m) => {
            if (m.type !== 'result') return;
            this.onLine = null;
            this.busy = false;
        };
        this.send({ type: 'user', message: { role: 'user', content: '/clear' } });
    }
    // A stopped or stalled call kills the process; a fresh one starts for the next call.
    restart() {
        this.end();
        this.open();
    }
    end() {
        const child = this.child;
        this.child = null;
        this.busy = false;
        this.onLine = null;
        child?.kill();
        this.ended?.();
        this.ended = null;
    }
    close() {
        clearTimeout(this.timer);
        this.end();
    }
}
