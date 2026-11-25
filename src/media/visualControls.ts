// Visual controls: custom elements the visual frame defines before any fragment runs, globals like stepThrough.
// Each renders native elements in its light DOM from its attributes (label, variant, range or options), so keyboard,
// focus and screen readers work as for native controls. Each exposes value and fires input and change; visual
// part picking skips every rh- element.
const PATHS = {
    check: 'm3 8.5 3 3 7-7',
    minus: 'M3 8h10',
    plus: 'M8 3v10M3 8h10',
    reset: 'M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3',
};
const icon = (name: keyof typeof PATHS) =>
    `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${PATHS[name]}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const decimals = (step: string) => step.split('.')[1]?.length ?? 0;

export function defineControls(view: Window & typeof globalThis) {
    if (view.customElements.get('rh-button')) return;
    const document = view.document;
    let ids = 0;
    const make = <K extends keyof HTMLElementTagNameMap>(
        tag: K,
        props: Partial<HTMLElementTagNameMap[K]> = {},
        ...children: (Node | string)[]
    ) => {
        const e = Object.assign(document.createElement(tag), props);
        e.append(...children);
        return e;
    };
    const fire = (target: EventTarget, ...types: string[]) => {
        for (const type of types) target.dispatchEvent(new view.Event(type, { bubbles: true }));
    };

    class Control extends view.HTMLElement {
        static observedAttributes = ['disabled'];
        private built = false;
        private initial: unknown;
        private pending?: { value: unknown };
        get value(): unknown {
            return this.built ? this.read() : this.pending?.value;
        }
        set value(value: unknown) {
            if (this.built) this.write(value);
            else this.pending = { value };
        }
        connectedCallback() {
            // A move, such as stepThrough wrapping the visual's root, reconnects it: keep what the learner set.
            if (this.built) return;
            const label = this.getAttribute('label') ?? this.textContent?.trim() ?? '';
            this.replaceChildren();
            this.render(label);
            this.built = true;
            this.initial = this.read();
            if (this.pending) this.write(this.pending.value);
            this.attributeChangedCallback();
        }
        attributeChangedCallback() {
            for (const e of this.querySelectorAll('button, input'))
                (e as HTMLInputElement).disabled = this.hasAttribute('disabled');
        }
        reset() {
            if (this.built) this.write(this.initial);
        }
        protected render(_label: string) {}
        protected read(): unknown {
            return undefined;
        }
        protected write(_value: unknown) {}
        protected attr(name: string, fallback = '') {
            return this.getAttribute(name) ?? fallback;
        }
    }

    class RhButton extends Control {
        protected render(label: string) {
            this.append(make('button', { type: 'button' }, label));
        }
    }

    class RhToggle extends Control {
        private button!: HTMLButtonElement;
        protected render(label: string) {
            this.button = make('button', { type: 'button', innerHTML: icon('check') }, label);
            this.button.setAttribute('aria-pressed', String(this.hasAttribute('pressed')));
            this.button.addEventListener('click', () => {
                this.write(!this.read());
                fire(this, 'input', 'change');
            });
            this.append(this.button);
        }
        protected read() {
            return this.button.getAttribute('aria-pressed') === 'true';
        }
        protected write(value: unknown) {
            this.button.setAttribute('aria-pressed', String(Boolean(value)));
        }
    }

    class RhSwitch extends Control {
        private input!: HTMLInputElement;
        protected render(label: string) {
            this.input = make('input', { type: 'checkbox', checked: this.hasAttribute('checked') });
            this.input.setAttribute('role', 'switch');
            this.append(make('label', {}, this.input, label));
        }
        protected read() {
            return this.input.checked;
        }
        protected write(value: unknown) {
            this.input.checked = Boolean(value);
        }
    }

    class RhSlider extends Control {
        private input!: HTMLInputElement;
        private shown!: HTMLSpanElement;
        protected render(label: string) {
            const id = `rh-${++ids}`,
                [min, max, step] = [
                    this.attr('min', '0'),
                    this.attr('max', '100'),
                    this.attr('step', '1'),
                ];
            this.input = make('input', { type: 'range', id, min, max, step });
            this.input.value = this.attr('value', String((+min + +max) / 2));
            this.shown = make('span');
            const output = make('output', {}, this.shown);
            output.setAttribute('for', id);
            if (this.hasAttribute('unit'))
                output.append(' ', make('span', { className: 'unit' }, this.attr('unit')));
            this.input.addEventListener('input', () => this.paint());
            this.append(make('label', { htmlFor: id }, label), this.input, output);
            this.paint();
        }
        private paint() {
            const { min, max, step, value } = this.input;
            this.shown.textContent = (+value).toFixed(decimals(step));
            this.input.style.setProperty(
                '--fill',
                `${((+value - +min) / (+max - +min || 1)) * 100}%`,
            );
        }
        protected read() {
            return +this.input.value;
        }
        protected write(value: unknown) {
            this.input.value = String(value);
            this.paint();
        }
    }

    class RhNumber extends Control {
        private input!: HTMLInputElement;
        protected render(label: string) {
            const id = `rh-${++ids}`,
                step = this.attr('step', '1'),
                box = make('span', { className: 'box' });
            this.input = make('input', { type: 'number', id, step });
            for (const name of ['min', 'max'])
                if (this.hasAttribute(name)) this.input.setAttribute(name, this.attr(name));
            this.write(this.attr('value', '0'));
            const stepper = (sign: number, name: 'minus' | 'plus', verb: string) => {
                const button = make('button', { type: 'button', innerHTML: icon(name) });
                button.setAttribute('aria-label', `${verb} ${label}`);
                button.addEventListener('click', () => {
                    this.write(this.read() + sign * +step);
                    fire(this.input, 'input', 'change');
                });
                return button;
            };
            box.append(stepper(-1, 'minus', 'Decrease'), this.input);
            if (this.hasAttribute('unit'))
                box.append(make('span', { className: 'unit' }, this.attr('unit')));
            box.append(stepper(1, 'plus', 'Increase'));
            // A typed value outside the range or off the number line clamps once it settles.
            this.input.addEventListener('change', () => this.write(this.read()));
            this.append(make('label', { htmlFor: id }, label), box);
        }
        protected read() {
            return +this.input.value || 0;
        }
        protected write(value: unknown) {
            const { min, max, step } = this.input,
                clamped = Math.min(
                    +(max || Infinity),
                    Math.max(+(min || -Infinity), Number(value) || 0),
                );
            this.input.value = clamped.toFixed(decimals(step));
        }
    }

    class RhChoice extends Control {
        private radios: HTMLInputElement[] = [];
        protected render(label: string) {
            const options = this.attr('options')
                    .split(',')
                    .map((o) => o.trim())
                    .filter(Boolean),
                name = `rh-${++ids}`,
                list = options.length > 5,
                chosen = this.attr('value', options[0]);
            if (list) this.setAttribute('layout', 'list');
            const group = make('span', { className: list ? 'list' : 'seg' });
            for (const option of options) {
                const radio = make('input', {
                    type: 'radio',
                    name,
                    value: option,
                    checked: option === chosen,
                });
                this.radios.push(radio);
                group.append(make('label', {}, radio, option));
            }
            this.append(make('fieldset', {}, make('legend', {}, label), group));
        }
        protected read() {
            return this.radios.find((r) => r.checked)?.value ?? '';
        }
        protected write(value: unknown) {
            for (const r of this.radios) r.checked = r.value === value;
        }
    }

    class RhText extends Control {
        private input!: HTMLInputElement;
        protected render(label: string) {
            const id = `rh-${++ids}`;
            this.input = make('input', {
                type: 'text',
                id,
                placeholder: this.attr('placeholder'),
                value: this.attr('value'),
            });
            this.append(make('label', { htmlFor: id }, label), this.input);
        }
        protected read() {
            return this.input.value;
        }
        protected write(value: unknown) {
            this.input.value = String(value ?? '');
        }
    }

    class RhReset extends Control {
        protected render(label: string) {
            const button = make(
                'button',
                { type: 'button', innerHTML: icon('reset') },
                label || 'Reset',
            );
            button.addEventListener('click', () => {
                const root = this.closest('#visual') ?? document.body;
                for (const e of root.querySelectorAll('*')) if (e instanceof Control) e.reset();
                fire(root, 'reset');
            });
            this.append(button);
        }
    }

    for (const [name, element] of [
        ['rh-button', RhButton],
        ['rh-toggle', RhToggle],
        ['rh-switch', RhSwitch],
        ['rh-slider', RhSlider],
        ['rh-number', RhNumber],
        ['rh-choice', RhChoice],
        ['rh-text', RhText],
        ['rh-reset', RhReset],
    ] as const)
        view.customElements.define(name, element);
}
