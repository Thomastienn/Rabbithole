// Shared by generation validation and the lazy browser renderer.
export function safeDiagramSource(source: string) {
  if (!source.trim()) throw new Error('Diagram worker returned no source.');
  if (new TextEncoder().encode(source).length > 16 * 1024) throw new Error('Diagram output exceeds 16 KiB.');
  if (/\b(?:click|href|script|javascript|vbscript|callback)\b|<\s*\/?\s*[a-z!]|(?:&|#)(?:#?x[0-9a-f]+|#?\d+|[a-z][a-z0-9]*);|%%\s*\{|^\s*---|\b(?:https?|data|file):|(?:^|[;\n])\s*(?:link|links|linkStyle|style|classDef|cssClass)\b|\b(?:img|image|icon)\s*:|\burl\s*\(|`|!?\[[^\]]*\]\s*\(/im.test(source)) throw new Error('Unsafe diagram source: interactive content, HTML, resources, styles and configuration are forbidden.');
  return source.trim();
}
