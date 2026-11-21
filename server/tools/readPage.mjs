import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export const PAGE_SIZE = 20000;
const MAX_BYTES = 5 * 1024 * 1024,
    SAVE_BYTES = 20 * 1024 * 1024,
    MAX_REDIRECTS = 5,
    TIMEOUT = 30000;

// Non-public IPv4 ranges (RFC 6890 special-purpose, multicast and reserved).
const blocked = new BlockList();
for (const [net, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
])
    blocked.addSubnet(net, prefix, 'ipv4');
// IPv6: only global unicast 2000::/3, minus documentation, IETF special, 6to4 and NAT64 ranges.
const global6 = new BlockList();
global6.addSubnet('2000::', 3, 'ipv6');
for (const [net, prefix] of [
    ['2001::', 23],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['3fff::', 20],
])
    blocked.addSubnet(net, prefix, 'ipv6');

export function publicAddress(address) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
    if (mapped) return publicAddress(mapped);
    const family = isIP(address);
    if (family === 4) return !blocked.check(address, 'ipv4');
    if (family === 6) return global6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
    return false;
}

const refused = (host) =>
    new Error(`read_page refuses ${host}: only public internet addresses can be read.`);

// Validate the socket's DNS answers, without borrowing unchecked sockets from the global pool.
export function request(url, signal, lookup, isPublic) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && !isPublic(host)) return Promise.reject(refused(host));
    const checkedLookup = (name, options, callback) =>
        lookup(name, { ...options, all: true }, (error, address, family) => {
            if (error) return callback(error);
            // Node asks for every address when it races IPv4 and IPv6; any non-public one refuses the host.
            const all = Array.isArray(address) ? address : [{ address, family }];
            if (!all.length || all.some((a) => !isPublic(a.address)))
                return callback(refused(name));
            if (options.all) callback(null, all);
            else callback(null, all[0].address, all[0].family);
        });
    return new Promise((resolve, reject) => {
        const req = (url.protocol === 'https:' ? https : http).get(
            url,
            {
                signal,
                agent: false,
                lookup: checkedLookup,
                headers: {
                    'User-Agent': 'Rabbithole read_page',
                    Accept: 'text/html,text/*;q=0.9,*/*;q=0.5',
                },
            },
            resolve,
        );
        req.on('error', reject);
    });
}

export async function body(response, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of response) {
        size += chunk.length;
        if (size > limit) {
            response.destroy();
            throw new Error(
                `read_page stopped: the page is larger than ${limit / 1024 / 1024} MB.`,
            );
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function readable(html, url) {
    const dom = new JSDOM(html, { url });
    try {
        const document = dom.window.document;
        const article = new Readability(document).parse();
        return {
            title: article?.title || document.title || '',
            text: article?.textContent ?? document.body?.textContent ?? '',
        };
    } finally {
        dom.window.close();
    }
}

// Fetches a public http(s) page on the server and returns its readable text, PAGE_SIZE characters at a time.
export async function readPage(
    { url, offset = 0, save_as },
    { signal, lookup = dnsLookup, isPublic = publicAddress, workspace } = {},
) {
    let target;
    try {
        target = new URL(url);
    } catch {
        throw new Error('read_page needs a full http or https URL.');
    }
    if (!Number.isSafeInteger(offset) || offset < 0)
        throw new Error('read_page offset must be a whole number of characters, 0 or more.');
    // Trust boundary: a plain filename only, so a save cannot leave the workspace.
    if (
        save_as !== undefined &&
        (typeof save_as !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/.test(save_as))
    )
        throw new Error(
            'read_page save_as must be a plain filename of letters, digits, dot, dash or underscore.',
        );
    if (save_as !== undefined && !workspace)
        throw new Error('read_page cannot save files: offline Python is unavailable.');
    const timed = AbortSignal.any([AbortSignal.timeout(TIMEOUT), ...(signal ? [signal] : [])]);
    for (let redirects = 0; ; redirects++) {
        if (!['http:', 'https:'].includes(target.protocol))
            throw new Error(`read_page only reads http and https URLs, not ${target.protocol}`);
        const response = await request(target, timed, lookup, isPublic);
        const location = response.headers.location;
        if (response.statusCode >= 300 && response.statusCode < 400 && location) {
            response.destroy();
            if (redirects >= MAX_REDIRECTS)
                throw new Error('read_page stopped: too many redirects.');
            target = new URL(location, target);
            continue;
        }
        if (response.statusCode >= 400) {
            response.destroy();
            throw new Error(`read_page got HTTP ${response.statusCode} from ${target.href}.`);
        }
        const type = String(response.headers['content-type'] ?? '').toLowerCase();
        const html = /html|xml/.test(type);
        const textual = html || /^text\/|json/.test(type);
        if (!textual && save_as === undefined) {
            response.destroy();
            throw new Error(`read_page cannot read ${type || 'unknown'} content as text.`);
        }
        const bytes = await body(response, save_as === undefined ? MAX_BYTES : SAVE_BYTES);
        let saved = [];
        if (save_as !== undefined) {
            await mkdir(workspace, { recursive: true, mode: 0o700 });
            // Sandboxed Python may leave a link under this name: write a fresh file, then rename it over the entry.
            const part = join(workspace, `.${randomUUID()}.part`);
            try {
                await writeFile(part, bytes, { flag: 'wx' });
                await rename(part, join(workspace, save_as));
            } catch (error) {
                await rm(part, { force: true });
                throw error;
            }
            saved = [`Saved ${bytes.length} bytes as ${save_as} in the Python workspace.`];
            // Binary or very large saves skip text extraction; Python reads the file instead.
            if (!textual || bytes.length > MAX_BYTES)
                return [`URL: ${target.href}`, `Content type: ${type || 'unknown'}`, ...saved].join(
                    '\n',
                );
        }
        const raw = bytes.toString('utf8');
        const page = html ? readable(raw, target.href) : { title: '', text: raw };
        const text = page.text
            .replace(/[ \t\r]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        const end = Math.min(offset + PAGE_SIZE, text.length);
        return [
            `URL: ${target.href}`,
            ...(page.title ? [`Title: ${page.title.trim()}`] : []),
            ...saved,
            offset >= text.length
                ? `Offset ${offset} is past the end; the page has ${text.length} characters.`
                : `Characters ${offset}–${end} of ${text.length}.` +
                  (end < text.length ? ` Call read_page again with offset ${end} for more.` : ''),
            '',
            text.slice(offset, end),
        ].join('\n');
    }
}
