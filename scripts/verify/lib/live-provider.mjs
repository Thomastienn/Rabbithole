// Live checks spend real usage: one provider, on its cheapest model unless RABBITHOLE_TEST_MODEL names one.
// When one provider's usage runs out, rerun with RABBITHOLE_TEST_PROVIDER set to the other.
import { quickDefault } from '../../../server/suggestions.mjs';

export const liveProvider = process.env.RABBITHOLE_TEST_PROVIDER ?? 'claude';
if (!['claude', 'codex'].includes(liveProvider))
  throw new Error(`RABBITHOLE_TEST_PROVIDER must be claude or codex, not ${liveProvider}.`);

export const liveModel = (provider, models) =>
  process.env.RABBITHOLE_TEST_MODEL ??
  quickDefault({ provider }, models) ??
  models.find((m) => m.isDefault)?.model;
