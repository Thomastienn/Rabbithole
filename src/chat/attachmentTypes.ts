// What a learner can attach, shared by the composer (refuses on add) and the server (prepares the file).

// Images the chat models read natively.
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// shortcut: the browser judges text files by MIME type only (e.g. .ts reads as video/mp2t and is refused); the server decodes the bytes and stays the backstop.
export const canAttach = (type: string) =>
  type === 'application/pdf' ||
  IMAGE_TYPES.includes(type) ||
  type === '' ||
  type.startsWith('text/') ||
  /^application\/(.+\+)?(json|xml|javascript|x-?yaml|toml|x-sh|x-tex|x-latex|sql)$/.test(type);

const list = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

export const refusalLine = (names: string[]) =>
  `${list(names)} ${names.length > 1 ? 'weren’t' : 'wasn’t'} added. Attach images, PDFs or text files.`;
