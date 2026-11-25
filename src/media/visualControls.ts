// Visual controls: custom elements the visual frame defines before any fragment runs, globals like stepThrough.
// Each renders native elements in its light DOM from its attributes (label, variant, range or options), so keyboard,
// focus and screen readers work as for native controls. Inputs expose value and fire input and change; display
// controls (readout, result, status) expose the value they show. Visual part picking skips every rh- element.
// Series inks in legend order; a chart colours its nth series with the nth ink.
const INKS = ['blue', 'yellow', 'pink', 'green'];
const CIRCLE = 'M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13';
const PATHS = {
    check: 'm3 8.5 3 3 7-7',
    minus: 'M3 8h10',
    plus: 'M8 3v10M3 8h10',
    reset: 'M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3',
    correct: `${CIRCLE}M5.5 8.2l1.8 1.8 3.2-3.6`,
    incorrect: 'M4 4l8 8M12 4l-8 8',
    neutral: `${CIRCLE}M6.3 6.3a1.8 1.8 0 1 1 2.5 1.6c-.5.2-.8.6-.8 1.1v.4M8 11.2v.1`,
    info: `${CIRCLE}M8 7.3v3.7M8 5v.1`,
    success: `${CIRCLE}M5.5 8.2l1.8 1.8 3.2-3.6`,
    warning: 'M8 2l6.5 11.5h-13zM8 6.5v3M8 11.5v.1',
};
const icon = (name: keyof typeof PATHS) =>
    `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${PATHS[name]}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function defineControls(view: Window & typeof globalThis) {
    if (view.customElements.get('rh-button')) return;
    const document = view.document;
    let ids = 0;
    const make = <K extends keyof HTMLElementTagNameMap>(
        tag: K,
        props: object = {},
        ...children: (Node | string)[]
    ) => {
        const e = document.createElement(tag);
        Object.assign(e, props);
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
            const text = this.textContent?.trim() ?? '',
                label = this.getAttribute('label') ?? text;
            this.replaceChildren();
            this.render(label, text);
            this.built = true;
            if (this.pending) this.write(this.pending.value);
            this.initial = this.read();
            this.attributeChangedCallback();
        }
        attributeChangedCallback() {
            for (const e of this.querySelectorAll('button, input'))
                (e as HTMLInputElement).disabled = this.hasAttribute('disabled');
        }
        reset() {
            if (this.built) this.write(this.initial);
        }
        protected render(_label: string, _text: string) {}
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
            const { min, max, value } = this.input;
            this.shown.textContent = value;
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
            this.input.defaultValue = this.input.value;
            const stepper = (sign: number, name: 'minus' | 'plus', verb: string) => {
                const button = make('button', { type: 'button', innerHTML: icon(name) });
                button.setAttribute('aria-label', `${verb} ${label}`);
                button.addEventListener('click', () => {
                    if (step === 'any') this.write(this.read() + sign);
                    else this.input.stepUp(sign);
                    fire(this.input, 'input', 'change');
                });
                return button;
            };
            box.append(stepper(-1, 'minus', 'Decrease'), this.input);
            if (this.hasAttribute('unit'))
                box.append(make('span', { className: 'unit' }, this.attr('unit')));
            box.append(stepper(1, 'plus', 'Increase'));
            // Clamp typed values once the learner finishes editing.
            this.input.addEventListener('change', () => this.write(this.read()));
            this.append(make('label', { htmlFor: id }, label), box);
        }
        protected read() {
            return +this.input.value || 0;
        }
        protected write(value: unknown) {
            const input = this.input;
            const number = Number(value);
            input.value = Number.isFinite(number) ? String(number) : '0';
            if (input.validity.rangeUnderflow) input.value = input.min;
            if (input.validity.rangeOverflow) input.value = input.max;
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

    class RhReadout extends Control {
        private shown!: HTMLSpanElement;
        private current: unknown;
        protected render(label: string) {
            const id = `rh-${++ids}`;
            this.shown = make('span');
            // An output is a polite live region, so a changed value is announced.
            const output = make('output', {}, this.shown);
            output.setAttribute('aria-labelledby', id);
            if (this.hasAttribute('unit'))
                output.append(' ', make('span', { className: 'unit' }, this.attr('unit')));
            this.append(make('span', { id, className: 'key' }, label), output);
            this.write(this.attr('value'));
        }
        protected read() {
            return this.current;
        }
        protected write(value: unknown) {
            this.current = value;
            this.shown.textContent = String(value ?? '');
        }
    }

    // Result card and status line: a toned icon and text in a status region; variant and label may change later.
    class RhMessage extends Control {
        static observedAttributes = ['variant', 'label'];
        protected tones = ['info', 'success', 'warning'];
        private sign?: HTMLSpanElement;
        private heading?: HTMLElement;
        private body!: HTMLElement;
        private start: (string | null)[] = [];
        protected render(_label: string, text: string) {
            this.start = [this.getAttribute('variant'), this.getAttribute('label')];
            this.setAttribute('role', 'status');
            this.setAttribute('aria-atomic', 'true');
            this.sign = make('span', { className: 'icon' });
            this.body = make(this.localName === 'rh-result' ? 'p' : 'span', {}, text);
            if (this.localName === 'rh-result') this.heading = make('b');
            this.append(this.sign, ...(this.heading ? [this.heading] : []), this.body);
        }
        attributeChangedCallback() {
            if (!this.sign) return;
            const variant = this.attr('variant');
            this.sign.innerHTML = icon(
                (this.tones.includes(variant) ? variant : this.tones[0]) as keyof typeof PATHS,
            );
            if (this.heading) this.heading.textContent = this.attr('label');
        }
        reset() {
            this.start.forEach((value, i) => {
                const name = ['variant', 'label'][i];
                if (value === null) this.removeAttribute(name);
                else this.setAttribute(name, value);
            });
            super.reset();
        }
        protected read() {
            return this.body.textContent ?? '';
        }
        protected write(value: unknown) {
            this.body.textContent = String(value ?? '');
        }
    }

    class RhResult extends RhMessage {
        protected tones = ['neutral', 'correct', 'incorrect'];
    }

    class RhLegend extends view.HTMLElement {
        connectedCallback() {
            if (this.firstElementChild) return;
            const list = make('ul');
            if (this.hasAttribute('label'))
                list.setAttribute('aria-label', this.getAttribute('label')!);
            for (const [i, item] of (this.getAttribute('items') ?? '')
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean)
                .entries()) {
                const swatch = make('i');
                swatch.setAttribute('aria-hidden', 'true');
                swatch.style.setProperty('--ink', `var(--color-text-${INKS[i % INKS.length]})`);
                list.append(make('li', {}, swatch, item));
            }
            this.replaceChildren(list);
        }
    }

    // The visual writes its own table; the label becomes its caption.
    class RhTable extends view.HTMLElement {
        connectedCallback() {
            const table = this.querySelector('table');
            if (table && !table.caption && this.hasAttribute('label'))
                table.createCaption().textContent = this.getAttribute('label');
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
        ['rh-readout', RhReadout],
        ['rh-result', RhResult],
        ['rh-status', RhMessage],
        ['rh-legend', RhLegend],
        ['rh-table', RhTable],
    ] as const)
        view.customElements.define(name, element);
}
