/**
 * /api/devices — list, read, update, command (end-user scope).
 */

const express = require('express');

const { authenticate } = require('../../middleware/core/auth');
const { requireAdmin } = require('../../middleware/core/rbac');
const { list, get, update, listEvents, listCompanyEvents, searchUnclaimed, claimDevice, releaseDevice } = require('../../controllers/access/devices');
const { sendCommand, pushDevice, clearDevice, getQueue } = require('../../controllers/access/deviceCommands');
const deviceShifts = require('../../controllers/access/deviceShifts');
const deviceCredentials = require('../../controllers/access/deviceCredentials');

const router = express.Router();

router.use(authenticate);

// Static routes must be registered BEFORE the dynamic /:id patterns so that
// "unclaimed" / "claim" aren't matched as a hardware id.
router.get   ('/unclaimed',              requireAdmin, searchUnclaimed);
router.post  ('/claim',                  requireAdmin, claimDevice);
router.get   ('/events',                 listCompanyEvents);

router.get   ('/',                       list);
router.get   ('/:id',                    get);
router.patch ('/:id',                    requireAdmin, update);
router.get   ('/:id/events',             listEvents);
router.get   ('/:id/queue',              getQueue);
router.post  ('/:hwId/commands',         requireAdmin, sendCommand);
router.post  ('/:id/push',               requireAdmin, pushDevice);
router.post  ('/:id/clear',              requireAdmin, clearDevice);
router.post  ('/:id/release',            requireAdmin, releaseDevice);

router.get   ('/:id/shifts',             deviceShifts.list);
router.post  ('/:id/shifts',             requireAdmin, deviceShifts.create);
router.patch ('/:id/shifts/:shiftId',    requireAdmin, deviceShifts.update);
router.delete('/:id/shifts/:shiftId',    requireAdmin, deviceShifts.destroy);

router.get   ('/:id/credentials',                 deviceCredentials.list);
router.post  ('/:id/credentials',                 requireAdmin, deviceCredentials.attach);
router.post  ('/:id/credentials/bulk',              requireAdmin, deviceCredentials.attachByPerson);
router.post  ('/:id/credentials/bulk-group',        requireAdmin, deviceCredentials.attachByGroup);
router.post  ('/:id/credentials/bulk-detach',       requireAdmin, deviceCredentials.detachByPerson);
router.post  ('/:id/credentials/bulk-group-detach', requireAdmin, deviceCredentials.detachByGroup);
router.delete('/:id/credentials/:credId',           requireAdmin, deviceCredentials.detach);

module.exports = router;

