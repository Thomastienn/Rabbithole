import { constants, openSync, closeSync, readFileSync, fchmodSync, fstatSync } from 'node:fs';

// Validation of saved custom endpoint settings and their owner-only credential file.
export class EndpointError extends Error {}

export function settings(body) {
  const invalid = () => {
    throw new EndpointError(
      'Enter an HTTP(S) API base URL without credentials, query or fragment, and a nonempty API key.',
    );
  };
  if (
    typeof body?.baseUrl !== 'string' ||
    body.baseUrl.length > 2048 ||
    typeof body.apiKey !== 'string' ||
    !/^[\x21-\x7e]{1,8192}$/.test(body.apiKey)
  )
    invalid();
  let url;
  try {
    url = new URL(body.baseUrl);
  } catch {
    invalid();
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    /[?#]/.test(url.href) ||
    /[\x00-\x20\x7f]/.test(body.baseUrl)
  )
    invalid();
  const baseUrl = url.href.replace(/\/+$/, '');
  // The public URL must never double as a credential field.
  try {
    if (decodeURIComponent(baseUrl).includes(body.apiKey)) invalid();
  } catch {
    invalid();
  }
  return { baseUrl, apiKey: body.apiKey };
}

export function readOwned(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1)
      throw new EndpointError('Credential file is not an owner-only regular file.');
    fchmodSync(fd, 0o600);
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}

export function lastTest(t) {
  return (
    t &&
    typeof t.at === 'string' &&
    (t.ok === true ? Number.isInteger(t.models) : t.ok === false && typeof t.error === 'string')
  );
}

export function endpointName(name, apiKey) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 80 ||
    /[\x00-\x1f\x7f]/.test(name) ||
    name.includes(apiKey)
  )
    throw new EndpointError('Enter an endpoint name of up to 80 characters.');
  return name.trim();
}
