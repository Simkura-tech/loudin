/**
 * /api/devices — list, read, update, command (end-user scope).
 */

const express = require('express');

const { authenticate } = require('../../middleware/core/auth');
const { requireAdmin } = require('../../middleware/core/rbac');
const { list, get, update, listEvents, listCompanyEvents, searchUnclaimed, claimDevice, releaseDevice } = require('../../controllers/access/devices');
const { sendCommand, pushDevice, clearDevice, getQueue } = require('../../controllers/access/deviceCommands');
const deviceShifts = require('../../controllers/access/deviceShifts');
const deviceHolidays = require('../../controllers/access/deviceHolidays');
const deviceCredentials = require('../../controllers/access/deviceCredentials');
const { requireFeature } = require('../../services/platform/featureFlags');

// Platform feature flags (services/platform/featureFlags.js): a feature a
// platform admin has turned off is refused here with 403 feature_disabled,
// whatever the UI shows. Commands are gated inside deviceCommands.
const schedulesOn = requireFeature('schedules');
const holidaysOn  = requireFeature('holidays');

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

router.get   ('/:id/shifts',             schedulesOn, deviceShifts.list);
router.post  ('/:id/shifts',             schedulesOn, requireAdmin, deviceShifts.create);
router.patch ('/:id/shifts/:shiftId',    schedulesOn, requireAdmin, deviceShifts.update);
router.delete('/:id/shifts/:shiftId',    schedulesOn, requireAdmin, deviceShifts.destroy);

router.get   ('/:id/holidays',             holidaysOn, deviceHolidays.list);
router.post  ('/:id/holidays',             holidaysOn, requireAdmin, deviceHolidays.create);
router.patch ('/:id/holidays/:holidayId',  holidaysOn, requireAdmin, deviceHolidays.update);
router.delete('/:id/holidays/:holidayId',  holidaysOn, requireAdmin, deviceHolidays.destroy);

router.get   ('/:id/credentials',                 deviceCredentials.list);
router.post  ('/:id/credentials',                 requireAdmin, deviceCredentials.attach);
router.post  ('/:id/credentials/bulk',              requireAdmin, deviceCredentials.attachByPerson);
router.post  ('/:id/credentials/bulk-group',        requireAdmin, deviceCredentials.attachByGroup);
router.post  ('/:id/credentials/bulk-detach',       requireAdmin, deviceCredentials.detachByPerson);
router.post  ('/:id/credentials/bulk-group-detach', requireAdmin, deviceCredentials.detachByGroup);
router.delete('/:id/credentials/:credId',           requireAdmin, deviceCredentials.detach);

module.exports = router;

