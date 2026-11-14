// Verify output folder: tracked docs/verification only with VERIFY_EVIDENCE=1 (release/design evidence), else ignored .verify-output.
import { mkdirSync } from 'node:fs';

export const verifyOut =
  process.env.VERIFY_EVIDENCE === '1' ? 'docs/verification' : '.verify-output';
mkdirSync(verifyOut, { recursive: true });
