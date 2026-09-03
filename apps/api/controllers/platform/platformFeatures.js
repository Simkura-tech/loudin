/**
 * Platform feature flags — platform-admin read/write.
 *
 *   GET /api/platform/features        registry with effective on/off
 *   PUT /api/platform/features        { features: { key: boolean, … } }
 *
 * See services/platform/featureFlags.js for what a flag does.
 */

const featureFlags = require('../../services/platform/featureFlags');
const { recordAudit } = require('../../services/platform/audit');

async function list(req, res, next) {
  try {
    return res.json({ features: await featureFlags.list() });
  } catch (err) { return next(err); }
}

async function update(req, res, next) {
  try {
    const values = req.body?.features;
    try {
      await featureFlags.set(values);
    } catch (e) {
      return res.status(400).json({ error: 'Bad Request', message: e.message });
    }
    recordAudit(req, 'platform.features.update', {
      target_type: 'platform',
      target_id:   'features',
      metadata:    { features: values },
    });
    return res.json({ features: await featureFlags.list() });
  } catch (err) { return next(err); }
}

module.exports = { list, update };
