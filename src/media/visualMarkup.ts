// Both streamed and finished fragments keep the frame's resource restrictions.
export function visualMarkup(source: string, document: Document, complete = false) {
    const template = document.createElement('template');
    template.innerHTML = source;
    const resources = (value: string) =>
        /@import\b/i.test(value) ||
        [...value.matchAll(/\burl\(\s*([^)]*)\)/gi)].some(
            ([, target]) => !/^(["']?)#[\w-]+\1$/.test(target.trim()),
        );
    for (const element of template.content.querySelectorAll('*')) {
        if (
            /^(?:iframe|frame|frameset|link|meta|base|object|embed|img|image|a|audio|video|source|track|template)$/i.test(
                element.localName,
            ) ||
            (!complete && /^script$/i.test(element.localName)) ||
            (element.localName === 'style' && resources(element.textContent ?? ''))
        ) {
            element.remove();
            continue;
        }
        for (const { name, value } of [...element.attributes]) {
            if (
                (!complete && /^on/i.test(name)) ||
                /^(?:src|srcset|srcdoc)$/i.test(name) ||
                resources(value) ||
                (/^(?:href|xlink:href|action|formaction)$/i.test(name) && !/^#[\w-]+$/.test(value))
            )
                element.removeAttribute(name);
        }
    }
    return template.innerHTML;
}

// innerHTML keeps scripts inert; only a completed fragment gets executable script elements.
export function renderVisual(root: HTMLElement, source: string, complete: boolean) {
    root.innerHTML = visualMarkup(source, root.ownerDocument, complete);
    if (!complete) return;
    for (const old of root.querySelectorAll('script')) {
        const script = root.ownerDocument.createElement('script');
        for (const { name, value } of old.attributes) script.setAttribute(name, value);
        script.textContent = old.textContent;
        old.replaceWith(script);
    }
}
