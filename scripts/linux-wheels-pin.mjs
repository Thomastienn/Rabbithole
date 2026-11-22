// The Desktop build run's Linux wheel pin (.github/workflows/desktop-build.yml): which pinned wheels the
// linux-wheels release lacks, and the re-pin of LINUX_WHEELS to the released files after a rebuild.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LINUX_WHEELS } from './manim-setup.mjs';

// "pycairo-1.29.2-cp312-": package, version and Python, so a new platform tag still counts as the same wheel.
const release = (name) => name.split('-').slice(0, 3).join('-') + '-';

// The pinned wheels whose package and version the release has no wheel of.
export const missingWheels = (pins, assets) =>
    Object.keys(pins).filter(
        (name) =>
            !assets.some((asset) => asset.startsWith(release(name)) && asset.endsWith('.whl')),
    );

// Points every pinned wheel's name and hash at the released file of its package and version.
export function repinWheels(source, sums) {
    const released = sums
        .trim()
        .split('\n')
        .map((line) => line.split(/\s+/));
    return source.replace(/'([^']+\.whl)':(\s+)'[0-9a-f]{64}'/g, (pin, name, space) => {
        const wheel = released.find(([, file]) => file.startsWith(release(name)));
        if (!wheel) throw new Error(`The wheels release has no ${release(name)}* wheel.`);
        return `'${wheel[1]}':${space}'${wheel[0]}'`;
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [command, file] = process.argv.slice(2);
    const text = readFileSync(file, 'utf8');
    const pin = new URL('./manim-setup.mjs', import.meta.url);
    if (command === 'missing') console.log(missingWheels(LINUX_WHEELS, text.split('\n')).join(' '));
    else if (command === 'pin') writeFileSync(pin, repinWheels(readFileSync(pin, 'utf8'), text));
    else
        throw new Error(
            'Usage: node scripts/linux-wheels-pin.mjs missing <assets> | pin <SHA256SUMS>',
        );
}
