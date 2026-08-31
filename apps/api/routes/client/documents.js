/**
 * /api/documents — public self-service document library.
 *
 * No authentication: the support page lists published spec sheets / guides /
 * manuals and links straight to the download endpoint. Admin management lives
 * under /api/platform/documents (routes/internal/platform.js).
 */

const express = require('express');

const { publicList, download } = require('../../controllers/support/documents');

const router = express.Router();

router.get('/',              publicList);
router.get('/:id/download',  download);

module.exports = router;
