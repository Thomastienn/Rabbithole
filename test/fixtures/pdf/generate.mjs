// Tiny, deterministic PDFs with real text/image operators; no PDF writer dependency.
import { writeFileSync } from 'node:fs';

function pdf(pages) {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', null];
  const add = (s) => (objects.push(s), objects.length - 1);
  const stream = (data, dict = '') =>
    add(`<< ${dict} /Length ${Buffer.byteLength(data, 'latin1')} >>\nstream\n${data}\nendstream`);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const rgb = stream('\xff\x00\x00\x00\xff\x00\x00\x00\xff\xff\xff\xff',
    '/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8');
  const gray = stream('\xaa\x55',
    '/Type /XObject /Subtype /Image /Width 8 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 1');
  const stencil = stream('\xaa\x55',
    '/Type /XObject /Subtype /Image /Width 8 /Height 2 /ImageMask true /BitsPerComponent 1');
  const form = stream('q 100 0 0 100 0 0 cm /Figure Do Q',
    `/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Matrix [1 0 0 1 10 10] /Resources << /XObject << /Figure ${rgb} 0 R >> >>`);
  const kids = pages.map((content) => {
    const contents = stream(content);
    return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Figure ${rgb} 0 R /Gray ${gray} 0 R /Stencil ${stencil} 0 R /Form ${form} 0 R >> >> /Contents ${contents} 0 R >>`);
  });
  objects[2] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.7\n', offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(`${out}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1');
}

const text = (value, mode = 0, y = 170) =>
  `BT /F1 12 Tf ${mode} Tr 10 ${y} Td (${value}) Tj ET\n`;
const typed = text('Binary heaps') + 'BT /F1 12 Tf 10 140 Td [(Parent) -300 (child)] TJ ET\n';
const figure = text('A large figure') +
  'q 160 0 0 120 20 30 cm /Figure Do Q\n' +
  text('Figure caption', 0, 15) +
  'q 10 0 0 10 180 180 cm /Figure Do Q\n';
const scan = 'q 200 0 0 200 0 0 cm /Figure Do Q\n' + text('WRONG hidden OCR', 3);
const vector = '10 10 m 180 180 l S\n20 30 100 80 re S\n' + text('Vector label');
const cases = {
  typed: [typed],
  figure: [figure],
  scan: [scan],
  vector: [vector],
  empty: ['10 10 m 180 180 l S\n'],
  ordered: [typed, figure, scan, vector],
  visibility: [text('Visible before') + 'q\n' + text('Hidden', 3) +
    text('Clip only', 7) + 'Q\nBT /F1 12 Tf 10 40 Td (Visible after) Tj ET\n'],
  threshold: ['q 40 0 0 100 0 0 cm /Figure Do Q\n' +
    'q 39 0 0 100 50 0 cm /Figure Do Q\n' + 'q /Form Do Q\n' +
    'q 200 0 0 200 500 500 cm /Figure Do Q\n'],
  inline: ['q 100 0 0 100 0 0 cm BI /W 2 /H 1 /CS /RGB /BPC 8 ID \xff\x00\x00\x00\xff\x00 EI Q\n'],
  gray: ['q 200 0 0 200 0 0 cm /Gray Do Q\n'],
  stencil: ['q 0.2 0.5 0.1 rg 200 0 0 200 0 0 cm /Stencil Do Q\n'],
  repeated: [Array.from({length: 5}, (_, i) => `q 80 0 0 80 ${i * 20} 0 cm /Figure Do Q\n`).join('')],
};
for (const [name, pages] of Object.entries(cases))
  writeFileSync(new URL(`${name}.pdf`, import.meta.url), pdf(pages));
