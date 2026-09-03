/**
 * Device-scoped credential assignments.
 *
 * Manages rows in `device_credentials` — the junction between an existing
 * credential (created via /api/credentials, owned by a person) and a
 * specific device. Tenant-scoped: both the device and the credential must
 * belong to the caller's company.
 *
 * Sync model (migrations 041 / 058 / 084):
 *   deleted_at IS NULL, submitted_at IS NULL       → pending addition
 *   deleted_at IS NULL, submitted_at IS NOT NULL,
 *                       synced_at IS NULL          → pushed; Simkura queued
 *                                                     the add, device hasn't
 *                                                     received it yet
 *   deleted_at IS NULL, synced_at IS NOT NULL      → in sync (delivered)
 *   deleted_at IS NOT NULL                          → pending removal
 *                                                     (firmware has — or is
 *                                                     about to get — it;
 *                                                     "Update device" fires
 *                                                     the remove then hard-
 *                                                     deletes the row.)
 *
 * Detach semantics: if a row was never submitted, we hard-delete it
 * directly — the firmware never knew about it, so there's nothing to
 * remove. Once it has been submitted (queued in Simkura, delivered or
 * not) we soft-delete (deleted_at set) so the next "Update device" push
 * removes it from the lock.
 */

const { query } = require('../../database/db');

function notFound(res, what = 'Device not found') {
  return res.status(404).json({ error: 'Not Found', message: what });
}

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

/** Verify the device belongs to the caller's company. Returns the row or null. */
async function loadDeviceForCaller(req) {
  const { rows } = await query(
    `SELECT id FROM devices
      WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [Number(req.params.id), req.user.company_id]
  );
  return rows[0] ?? null;
}

/**
 * Verify the credential belongs to the caller's company.
 * Returns the row or null.
 */
async function loadCredentialForCaller(req, credentialId) {
  const { rows } = await query(
    `SELECT id FROM credentials
      WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [Number(credentialId), req.user.company_id]
  );
  return rows[0] ?? null;
}

function publicAttachedCredential(row) {
  return {
    id:               row.id,
    person_id:        row.person_id,
    // Owner snapshot from the LEFT JOIN — null when the credential isn't
    // assigned to a person.
    person_first_name:  row.person_first_name ?? null,
    person_last_name:   row.person_last_name  ?? null,
    person_employee_id: row.person_employee_id ?? null,
    credential_name:  row.credential_name,
    credential_type:  row.credential_type,
    credential_value: row.credential_value,
    facility_code:    row.facility_code,
    card_number:      row.card_number,
    status:           row.status,
    // From the junction — the per-row sync trail (see the sync summary on
    // GET /api/devices/:id for the same three states in aggregate):
    //   applied_at    attached / last changed in Loudin
    //   submitted_at  accepted by Simkura (202), awaiting the device
    //   synced_at     confirmed on the lock
    applied_at:       row.applied_at   ?? null,
    submitted_at:     row.submitted_at ?? null,
    synced_at:        row.synced_at    ?? null,
  };
}

// SELECT shared between list() and the post-attach refresh — keep them in
// sync so the response shape is identical.
const ATTACHED_SELECT = `
  SELECT c.id, c.person_id,
         p.first_name  AS person_first_name,
         p.last_name   AS person_last_name,
         p.employee_id AS person_employee_id,
         c.credential_name, c.credential_type,
         c.credential_value, c.facility_code, c.card_number,
         c.status,
         dc.applied_at, dc.submitted_at, dc.synced_at
    FROM device_credentials dc
    JOIN credentials c ON c.id = dc.credential_id
    LEFT JOIN people p ON p.id = c.person_id AND p.deleted_at IS NULL
`;

// ── GET /api/devices/:id/credentials ──────────────────────────────────────────
// Only ACTIVE attachments (deleted_at IS NULL). Pending removals are visible
// via the sync summary on the device GET — they shouldn't pollute the roster.
async function list(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return notFound(res);

    const { rows } = await query(
      `${ATTACHED_SELECT}
        WHERE dc.device_id = $1
          AND dc.deleted_at IS NULL
          AND c.deleted_at IS NULL
        ORDER BY
          -- Owners first; unassigned creds fall to the bottom. Within an
          -- owner, sort by credential_name so multi-credential people stay
          -- grouped in a stable order.
          (p.last_name IS NULL),
          p.last_name, p.first_name,
          c.credential_name, c.id`,
      [device.id]
    );
    return res.json({ credentials: rows.map(publicAttachedCredential) });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/devices/:id/credentials ─────────────────────────────────────────
// Body: { credential_id }.
//
// If a previously-soft-deleted (pending-removal) row exists, we revive it
// instead of inserting a new row — cancelling the pending removal in one
// step. Otherwise we INSERT. 409 if the row is already active.
//
// Reviving must ONLY clear deleted_at. The sync stamps (applied_at /
// submitted_at / synced_at / simkura_command_id) describe what the lock
// already holds, and the removal was never sent — so the row is still in
// sync (or still awaiting its original delivery) and nothing needs pushing.
// Resetting the stamps would make the next push re-send credentials.add,
// and the firmware appends without checking for an existing record: the
// lock ends up with two copies, and a later credentials.remove only deletes
// one — the card keeps opening the door after Loudin shows it removed.
async function attach(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return notFound(res);

    const credentialId = Number(req.body?.credential_id);
    if (!Number.isInteger(credentialId) || credentialId <= 0) {
      return badRequest(res, 'credential_id is required (positive integer)');
    }

    const credential = await loadCredentialForCaller(req, credentialId);
    if (!credential) return notFound(res, 'Credential not found');

    // Step 1: is there already an ACTIVE row?
    const active = await query(
      `SELECT id FROM device_credentials
        WHERE device_id = $1 AND credential_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [device.id, credentialId]
    );
    if (active.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Credential is already attached to this device',
      });
    }

    // Step 2: revive a soft-deleted row if one exists (cancels pending
    // removal — stamps untouched, see note above); otherwise INSERT.
    const undeleted = await query(
      `UPDATE device_credentials
          SET deleted_at = NULL
        WHERE device_id = $1 AND credential_id = $2 AND deleted_at IS NOT NULL
      RETURNING id`,
      [device.id, credentialId]
    );
    if (undeleted.rowCount === 0) {
      await query(
        `INSERT INTO device_credentials (device_id, credential_id)
         VALUES ($1, $2)`,
        [device.id, credentialId]
      );
    }

    // Return the freshly attached row in the same shape as list().
    const { rows } = await query(
      `${ATTACHED_SELECT}
        WHERE dc.device_id = $1 AND dc.credential_id = $2 AND dc.deleted_at IS NULL`,
      [device.id, credentialId]
    );
    return res.status(201).json({ credential: publicAttachedCredential(rows[0]) });
  } catch (err) {
    return next(err);
  }
}

// ── DELETE /api/devices/:id/credentials/:credId ───────────────────────────────
// Never-synced rows are hard-deleted (firmware never knew about them — no
// deactivate needed). Synced rows are soft-deleted so the next "Update
// device" push knows to fire credentials.remove.
async function detach(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return notFound(res);

    const credentialId = Number(req.params.credId);
    if (!Number.isInteger(credentialId) || credentialId <= 0) {
      return badRequest(res, 'credential id must be a positive integer');
    }

    // Rows the lock holds — or has been queued to receive — become pending
    // removals.
    const softDel = await query(
      `UPDATE device_credentials
          SET deleted_at = NOW()
        WHERE device_id = $1 AND credential_id = $2
          AND deleted_at IS NULL
          AND (submitted_at IS NOT NULL OR synced_at IS NOT NULL)`,
      [device.id, credentialId]
    );
    if (softDel.rowCount > 0) return res.status(204).end();

    // Never-submitted active rows get hard-deleted — firmware never received
    // them, so there's nothing to remove.
    const hardDel = await query(
      `DELETE FROM device_credentials
        WHERE device_id = $1 AND credential_id = $2
          AND deleted_at IS NULL
          AND submitted_at IS NULL
          AND synced_at IS NULL`,
      [device.id, credentialId]
    );
    if (hardDel.rowCount > 0) return res.status(204).end();

    return notFound(res, 'Credential is not attached to this device');
  } catch (err) {
    return next(err);
  }
}

/**
 * Detach a set of credentials from a device using the same soft/hard rules
 * as single detach: submitted or synced rows become pending removals
 * (removed on the next push); never-submitted rows are hard-deleted (the
 * firmware never got them). Returns how many junction rows were affected.
 */
async function detachMany(deviceId, credentialIds) {
  if (credentialIds.length === 0) return 0;
  const { rowCount: softCount } = await query(
    `UPDATE device_credentials
        SET deleted_at = NOW()
      WHERE device_id = $1
        AND credential_id = ANY($2::int[])
        AND deleted_at IS NULL
        AND (submitted_at IS NOT NULL OR synced_at IS NOT NULL)`,
    [deviceId, credentialIds]
  );
  const { rowCount: hardCount } = await query(
    `DELETE FROM device_credentials
      WHERE device_id = $1
        AND credential_id = ANY($2::int[])
        AND deleted_at IS NULL
        AND submitted_at IS NULL
        AND synced_at IS NULL`,
    [deviceId, credentialIds]
  );
  return softCount + hardCount;
}

/** The active attachment list, shaped like list() — returned by the bulk
 *  detach endpoints so the UI can swap its roster in one round trip. */
async function refreshedList(deviceId) {
  const { rows } = await query(
    `${ATTACHED_SELECT}
      WHERE dc.device_id = $1
        AND dc.deleted_at IS NULL
        AND c.deleted_at IS NULL
      ORDER BY
        (p.last_name IS NULL),
        p.last_name, p.first_name,
        c.credential_name, c.id`,
    [deviceId]
  );
  return rows.map(publicAttachedCredential);
}

// ── POST /api/devices/:id/credentials/bulk-detach ─────────────────────────────
// Body: { person_id }. Detach every credential owned by `person_id` from
// this device. Idempotent — returns detached: 0 if none were attached.
// Deliberately does NOT filter soft-deleted credentials/people: this is a
// revocation, so anything of theirs still linked to the door comes off.
async function detachByPerson(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return notFound(res);

    const personId = Number(req.body?.person_id);
    if (!Number.isInteger(personId) || personId <= 0) {
      return badRequest(res, 'person_id is required (positive integer)');
    }

    const { rows: personRows } = await query(
      `SELECT id FROM people
        WHERE id = $1 AND company_id = $2
        LIMIT 1`,
      [personId, req.user.company_id]
    );
    if (personRows.length === 0) return notFound(res, 'Person not found');

    const { rows: creds } = await query(
      `SELECT id FROM credentials
        WHERE person_id = $1 AND company_id = $2`,
      [personId, req.user.company_id]
    );

    const detached = await detachMany(device.id, creds.map((c) => c.id));
    return res.json({ detached, credentials: await refreshedList(device.id) });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/devices/:id/credentials/bulk-group-detach ───────────────────────
// Body: { group_id }. Detach every credential owned by any member of the
// group from this device. Same idempotent + include-soft-deleted semantics
// as detachByPerson, fanned out across the group's members.
async function detachByGroup(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return notFound(res);

    const groupId = Number(req.body?.group_id);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return badRequest(res, 'group_id is required (positive integer)');
    }

    const { rows: groupRows } = await query(
      `SELECT id FROM people_groups
        WHERE id = $1 AND company_id = $2
        LIMIT 1`,
      [groupId, req.user.company_id]
    );
    if (groupRows.length === 0) return notFound(res, 'Group not found');

    const { rows: creds } = await query(
      `SELECT c.id
         FROM credentials c
         JOIN people p ON p.id = c.person_id
        WHERE p.group_id = $1
          AND p.company_id = $2`,
      [groupId, req.user.company_id]
    );

    const detached = await detachMany(device.id, creds.map((c) => c.id));
    return res.json({ detached, credentials: await refreshedList(device.id) });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/devices/:id/credentials/bulk ────────────────────────────────────
// Body: { person_id }. Attach every credential owned by `person_id` (in the
// caller's company). Already-active credentials are skipped silently; any
// soft-deleted rows are revived (cancels their pending removal).
async function attachByPerson(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return notFound(res);

    const personId = Number(req.body?.person_id);
    if (!Number.isInteger(personId) || personId <= 0) {
      return badRequest(res, 'person_id is required (positive integer)');
    }

    const { rows: personRows } = await query(
      `SELECT id FROM people
        WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [personId, req.user.company_id]
    );
    if (personRows.length === 0) return notFound(res, 'Person not found');

    const { rows: creds } = await query(
      `SELECT id FROM credentials
        WHERE person_id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        ORDER BY id`,
      [personId, req.user.company_id]
    );
    if (creds.length === 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'This person has no credentials yet',
      });
    }

    const credIds = creds.map((c) => c.id);

    // Already-active rows are skipped.
    const { rows: activeRows } = await query(
      `SELECT credential_id FROM device_credentials
        WHERE device_id = $1
          AND credential_id = ANY($2::int[])
          AND deleted_at IS NULL`,
      [device.id, credIds]
    );
    const activeIds = new Set(activeRows.map((r) => r.credential_id));

    // Revive any soft-deleted rows for the remaining credentials (stamps
    // untouched — see the note above attach()).
    const reviveCandidates = credIds.filter((id) => !activeIds.has(id));
    let revivedIds = [];
    if (reviveCandidates.length > 0) {
      const { rows: revived } = await query(
        `UPDATE device_credentials
            SET deleted_at = NULL
          WHERE device_id = $1
            AND credential_id = ANY($2::int[])
            AND deleted_at IS NOT NULL
        RETURNING credential_id`,
        [device.id, reviveCandidates]
      );
      revivedIds = revived.map((r) => r.credential_id);
    }
    const revivedSet = new Set(revivedIds);

    // Anything left needs a fresh INSERT.
    const insertIds = reviveCandidates.filter((id) => !revivedSet.has(id));
    if (insertIds.length > 0) {
      const values = insertIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await query(
        `INSERT INTO device_credentials (device_id, credential_id)
         VALUES ${values}`,
        [device.id, ...insertIds]
      );
    }

    const { rows } = await query(
      `${ATTACHED_SELECT}
        WHERE dc.device_id = $1
          AND dc.deleted_at IS NULL
          AND c.deleted_at IS NULL
        ORDER BY
          (p.last_name IS NULL),
          p.last_name, p.first_name,
          c.credential_name, c.id`,
      [device.id]
    );

    return res.status(201).json({
      attached:         revivedIds.length + insertIds.length,
      already_attached: activeIds.size,
      credentials:      rows.map(publicAttachedCredential),
    });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/devices/:id/credentials/bulk-group ──────────────────────────────
// Body: { group_id }. Attach every credential owned by any active person in
// that people_group. Same idempotent + revive-soft-deleted semantics as
// attachByPerson, fanned out across the group's members.
async function attachByGroup(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return notFound(res);

    const groupId = Number(req.body?.group_id);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return badRequest(res, 'group_id is required (positive integer)');
    }

    // Confirm the group belongs to the caller's company.
    const { rows: groupRows } = await query(
      `SELECT id FROM people_groups
        WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [groupId, req.user.company_id]
    );
    if (groupRows.length === 0) return notFound(res, 'Group not found');

    // Pull every credential owned by an active member of the group.
    const { rows: creds } = await query(
      `SELECT c.id
         FROM credentials c
         JOIN people p ON p.id = c.person_id
        WHERE p.group_id = $1
          AND p.company_id = $2
          AND p.deleted_at IS NULL
          AND c.deleted_at IS NULL
        ORDER BY c.id`,
      [groupId, req.user.company_id]
    );
    if (creds.length === 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'No credentials in this group yet',
      });
    }

    const credIds = creds.map((c) => c.id);

    // Already-active rows are skipped.
    const { rows: activeRows } = await query(
      `SELECT credential_id FROM device_credentials
        WHERE device_id = $1
          AND credential_id = ANY($2::int[])
          AND deleted_at IS NULL`,
      [device.id, credIds]
    );
    const activeIds = new Set(activeRows.map((r) => r.credential_id));

    // Revive any soft-deleted rows (stamps untouched — see the note above
    // attach()).
    const reviveCandidates = credIds.filter((id) => !activeIds.has(id));
    let revivedIds = [];
    if (reviveCandidates.length > 0) {
      const { rows: revived } = await query(
        `UPDATE device_credentials
            SET deleted_at = NULL
          WHERE device_id = $1
            AND credential_id = ANY($2::int[])
            AND deleted_at IS NOT NULL
        RETURNING credential_id`,
        [device.id, reviveCandidates]
      );
      revivedIds = revived.map((r) => r.credential_id);
    }
    const revivedSet = new Set(revivedIds);

    // Anything left needs a fresh INSERT.
    const insertIds = reviveCandidates.filter((id) => !revivedSet.has(id));
    if (insertIds.length > 0) {
      const values = insertIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await query(
        `INSERT INTO device_credentials (device_id, credential_id)
         VALUES ${values}`,
        [device.id, ...insertIds]
      );
    }

    const { rows } = await query(
      `${ATTACHED_SELECT}
        WHERE dc.device_id = $1
          AND dc.deleted_at IS NULL
          AND c.deleted_at IS NULL
        ORDER BY
          (p.last_name IS NULL),
          p.last_name, p.first_name,
          c.credential_name, c.id`,
      [device.id]
    );

    return res.status(201).json({
      attached:         revivedIds.length + insertIds.length,
      already_attached: activeIds.size,
      credentials:      rows.map(publicAttachedCredential),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, attach, attachByPerson, attachByGroup, detach, detachByPerson, detachByGroup };
