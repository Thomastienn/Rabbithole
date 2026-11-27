// Plot sketches: one or two curves in x from a small grammar parsed here, never run as code (mockup Rabbithole-skt.4).
import katex from 'katex';
import { quoted, type Drawing, type Line, type Palette } from './sketch.ts';

export const r1 = (n: number) => +n.toFixed(1);
export const minus = (s: string) => s.replace(/-/g, '−');

type Ex = { f: (x: number) => number; tex: string; say: string; prec: number; bare?: boolean };
const GRAMMAR = '+ - * / ^ sin cos exp log sqrt';
const FNS = new Map<string, (v: number) => number>([
    ['sin', Math.sin],
    ['cos', Math.cos],
    ['exp', Math.exp],
    ['log', Math.log],
    ['sqrt', Math.sqrt],
]);
const SUP = new Map([...'−0123456789'].map((c, i) => [c, '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'[i]]));
const group = (e: Ex, min: number, tex: boolean) =>
    e.prec < min ? `(${tex ? e.tex : e.say})` : tex ? e.tex : e.say;

function formula(src: string): Ex | string {
    const tokens = src.match(/\d+(?:\.\d+)?|\.\d+|[a-z]+|\S/gi) ?? [];
    const stranger = tokens.find((t) => !/^(\d|\.\d)|^[-+*/^()x]$/.test(t) && !FNS.has(t));
    if (stranger) return `uses ${stranger}, which is not one of ${GRAMMAR}`;
    let i = 0;
    const next = (t?: string) => (t === undefined || tokens[i] === t ? tokens[i++] : undefined);
    const bin = (op: string, a: Ex, b: Ex): Ex => {
        if (op === '+' || op === '-')
            return {
                f: op === '+' ? (x) => a.f(x) + b.f(x) : (x) => a.f(x) - b.f(x),
                tex: `${a.tex} ${op} ${group(b, op === '+' ? 1 : 2, true)}`,
                say: `${a.say} ${op === '+' ? '+' : '−'} ${group(b, op === '+' ? 1 : 2, false)}`,
                prec: 1,
            };
        if (op === '/')
            return {
                f: (x) => a.f(x) / b.f(x),
                tex: `${group(a, 2, true)}/${group(b, 3, true)}`,
                say: `${group(a, 2, false)}/${group(b, 3, false)}`,
                prec: 2,
            };
        // A number times what follows reads as 2x; anything else keeps its dot.
        const juxt = !a.bare && /^[a-z\\(]/i.test(b.tex) && b.prec >= 2;
        return {
            f: (x) => a.f(x) * b.f(x),
            tex: `${group(a, 2, true)}${juxt ? ' ' : ' \\cdot '}${group(b, 2, true)}`,
            say: `${group(a, 2, false)}${juxt ? (b.bare ? ' ' : '') : ' · '}${group(b, 2, false)}`,
            prec: juxt ? 2.5 : 2,
        };
    };
    const atom = (): Ex | undefined => {
        const t = next();
        if (t === undefined) return undefined;
        if (/^[\d.]/.test(t)) return { f: () => +t, tex: t, say: t, prec: 5 };
        if (t === 'x') return { f: (x) => x, tex: 'x', say: 'x', prec: 5 };
        if (t === '(' || FNS.has(t)) {
            if (t !== '(' && !next('(')) return undefined;
            const a = sum();
            if (!a || !next(')')) return undefined;
            if (t === '(') return a;
            const fn = FNS.get(t)!;
            if (t === 'sqrt')
                return {
                    f: (x) => fn(a.f(x)),
                    tex: `\\sqrt{${a.tex}}`,
                    say: `√${group(a, 5, false)}`,
                    prec: 5,
                };
            if (t === 'exp')
                return { f: (x) => fn(a.f(x)), tex: `e^{${a.tex}}`, say: `e^(${a.say})`, prec: 4 };
            const bare = a.prec >= 2.5;
            return {
                f: (x) => fn(a.f(x)),
                tex: `\\${t} ${bare ? a.tex : `(${a.tex})`}`,
                say: `${t} ${bare ? a.say : `(${a.say})`}`,
                prec: bare ? 2 : 5,
                bare,
            };
        }
        return undefined;
    };
    const power = (): Ex | undefined => {
        const a = atom();
        if (!a || !next('^')) return a;
        const b = unary();
        if (!b) return undefined;
        const sup = [...b.say].every((c) => SUP.has(c))
            ? [...b.say].map((c) => SUP.get(c)).join('')
            : '';
        return {
            f: (x) => a.f(x) ** b.f(x),
            tex: `${group(a, 5, true)}^{${b.tex}}`,
            say: `${group(a, 5, false)}${sup || `^${group(b, 5, false)}`}`,
            prec: 4,
        };
    };
    const unary = (): Ex | undefined => {
        if (!next('-')) return power();
        const a = unary();
        return (
            a && {
                f: (x) => -a.f(x),
                tex: `-${group(a, 2, true)}`,
                say: `−${group(a, 2, false)}`,
                prec: 3,
            }
        );
    };
    const product = () => {
        let a = unary();
        while (a && i < tokens.length) {
            const op = tokens[i];
            if (op === '*' || op === '/') i++;
            else if (!/^[\d.a-z(]/i.test(op)) break;
            const b = op === '*' || op === '/' ? unary() : power();
            a = b && bin(op === '/' ? '/' : '*', a, b);
        }
        return a;
    };
    const sum = () => {
        let a = product();
        while (a && (tokens[i] === '+' || tokens[i] === '-')) {
            const op = tokens[i++],
                b = product();
            a = b && bin(op, a, b);
        }
        return a;
    };
    const whole = sum();
    return whole && i === tokens.length ? whole : 'is not a formula in x';
}

// 1, 2, 2.5 or 5 times a power of ten, the smallest at least `raw`.
const step = (raw: number) => {
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw * (1 - 1e-9))!;
};
const label = (v: number) => minus(String(+v.toPrecision(12)));
// shortcut: a curve name's width is estimated at 7.5px per character of 15px maths; measure if names clip.
const NAME_CHAR = 7.5;

export function plot(lines: Line[], p: Palette): Drawing {
    const curves: { line: Line; ex: Ex; focus: boolean; src: string }[] = [];
    let range: number[] | undefined;
    for (const line of lines) {
        const x = /^x\s*:\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)$/i.exec(line.text.replace(/−/g, '-'));
        if (x) {
            range = [+x[1], +x[2]];
            if (!(range[0] < range[1])) return { error: `${quoted(line)} is out of range` };
            continue;
        }
        const focus = /^\*.*\*$/.test(line.text),
            src = focus ? line.text.slice(1, -1).trim() : line.text,
            y = /^y\s*=(.*)$/i.exec(src);
        if (!y) return { error: `${quoted(line)} is not y = … or x: min..max` };
        const ex = formula(y[1]);
        if (typeof ex === 'string') return { error: `${quoted(line)} ${ex}` };
        curves.push({ line, ex, focus, src: `y = ${y[1].trim()}` });
    }
    if (!curves.length) return { error: 'no y = line' };
    if (curves.length > 2) return { error: 'more than two curves' };
    if (!range) return { error: 'no x: min..max line' };
    const [lo, hi] = range,
        xs = Array.from({ length: 201 }, (_, k) => lo + ((hi - lo) * k) / 200),
        values = curves.map((c) =>
            xs.map((x) => c.ex.f(x)).map((v) => (Number.isFinite(v) ? v : NaN)),
        ),
        finite = values.flat().filter((v) => !Number.isNaN(v));
    for (const [k, c] of curves.entries())
        if (values[k].every(Number.isNaN))
            return { error: `${quoted(c.line)} has no value from ${lo} to ${hi}` };
    const low = Math.min(0, ...finite),
        high = Math.max(...finite) > low ? Math.max(...finite) : low + 1,
        ys = step((high - low) / 4),
        [bottom, top] = [Math.floor(low / ys) * ys, Math.ceil(high / ys) * ys],
        names = curves.map((c) => `y = ${c.ex.say}`);
    // Axes too large or too fine to step through would never finish their ticks.
    if (!Number.isFinite(top - bottom) || lo + (hi - lo) / 200 === lo)
        return { error: `values from ${lo} to ${hi} are out of range` };
    const right = 628 - Math.max(...names.map((n) => n.length * NAME_CHAR)),
        X = (v: number) => r1(40 + ((v - lo) / (hi - lo)) * (right - 40)),
        Y = (v: number) => r1(184 - ((v - bottom) / (top - bottom)) * 176);
    const xstep = step((hi - lo) / 5),
        steps: number[] = [];
    for (let v = Math.ceil(lo / xstep - 1e-9) * xstep; v <= hi + xstep * 1e-9; v += xstep)
        steps.push(+v.toPrecision(12));
    const xticks = steps.map((v) => [X(v), label(v)] as const);
    if (!steps.length || X(steps[0]) - X(lo) >= 40) xticks.unshift([X(lo), label(lo)]);
    if (steps.length && X(hi) - X(steps.at(-1)!) >= 40) xticks.push([X(hi), label(hi)]);
    const yticks: string[] = [];
    for (let v = bottom; v <= top + ys * 1e-9; v += ys)
        yticks.push(
            `<text class="sketch-tick sketch-end" x="32" y="${r1(Y(v) + 4)}" style="fill:${p.muted}">${label(v)}</text>`,
        );
    // Each name sits at its curve's last value; two names closer than 20px are pushed apart.
    const at = values.map((vs) => Y([...vs].reverse().find((v) => !Number.isNaN(v))!));
    if (at.length === 2 && Math.abs(at[0] - at[1]) < 20) {
        const mid = (at[0] + at[1]) / 2,
            up = at[0] <= at[1] ? 0 : 1;
        at[up] = mid - 10;
        at[1 - up] = mid + 10;
    }
    const zeroY = bottom <= 0 && 0 <= top ? Y(0) : 184,
        zeroX = lo <= 0 && 0 <= hi ? X(0) : 40;
    const markup =
        `<svg class="sketch-plot" viewBox="0 0 640 216">` +
        `<path class="sketch-axis" style="stroke:${p.muted}" d="M40 ${zeroY}H${r1(right)}M${zeroX} 8V184"/>` +
        yticks.join('') +
        xticks
            .map(
                ([x, t]) =>
                    `<text class="sketch-tick" x="${x}" y="204" style="fill:${p.muted}">${t}</text>`,
            )
            .join('') +
        curves
            .map((c, k) => {
                const d = values[k]
                    .map((v, j) =>
                        Number.isNaN(v)
                            ? ''
                            : `${j && !Number.isNaN(values[k][j - 1]) ? 'L' : 'M'}${X(xs[j])} ${Y(v)}`,
                    )
                    .join('');
                const colour = c.focus ? p.focus : p.ink,
                    math = katex.renderToString(`y = ${c.ex.tex}`, {
                        output: 'mathml',
                        throwOnError: false,
                    });
                return (
                    `<path class="sketch-line" style="stroke:${c.focus ? p.focus : p.seam}" d="${d}"/>` +
                    `<foreignObject x="${r1(right + 12)}" y="${r1(at[k] - 14)}" width="${r1(628 - right)}" height="28">` +
                    `<div class="sketch-math" style="color:${colour}">${math}</div></foreignObject>`
                );
            })
            .join('') +
        '</svg>';
    const items = curves.map((c, k) => ({
        label: c.src,
        focus: c.focus,
        text: [
            `Curve ${names[k]}, x from ${label(lo)} to ${label(hi)}`,
            ...(c.focus ? ['focus'] : []),
        ].join(', '),
    }));
    return { items, markup };
}
