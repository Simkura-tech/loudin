/**
 * WebSocket Authentication Middleware
 * Authenticates Socket.io connections using JWT tokens
 * and provides room-level authorization checks
 */

const { verifyToken } = require('../../utils/jwt')
const { COOKIE_NAME } = require('../../utils/authCookie')
const cookie = require('cookie')

/**
 * Socket.io authentication middleware
 * Extracts JWT from handshake auth token or httpOnly cookie.
 * Blocks user_type_id === 4 (Users have no software access)
 *
 * @param {import('socket.io').Socket} socket
 * @param {Function} next
 */
function socketAuthMiddleware(socket, next) {
  try {
    // Try auth.token first, then fall back to httpOnly cookie
    let token = socket.handshake.auth?.token

    if (!token && socket.handshake.headers?.cookie) {
      const cookies = cookie.parse(socket.handshake.headers.cookie)
      token = cookies[COOKIE_NAME]
    }

    if (!token) {
      return next(new Error('Authentication required'))
    }

    const decoded = verifyToken(token)

    // Block Users (user_type_id 4) - no software access
    if (decoded.user_type_id === 4) {
      return next(new Error('Access denied'))
    }

    // Attach user info to socket (same fields as REST auth middleware)
    socket.user = {
      user_id: decoded.user_id,
      company_id: decoded.company_id,
      user_type_id: decoded.user_type_id,
      active_company_id: decoded.active_company_id,
      accessible_companies: decoded.accessible_companies || [],
      impersonation: decoded.impersonation || null,
    }

    next()
  } catch (error) {
    next(new Error('Authentication failed: ' + error.message))
  }
}

/**
 * Check if a socket can join a company room
 * @param {import('socket.io').Socket} socket - Authenticated socket
 * @param {number|string} companyId - Company ID to join
 * @returns {boolean}
 */
function canJoinCompanyRoom(socket, companyId) {
  const id = parseInt(companyId, 10)

  // Super Admin can join any company room
  if (socket.user.user_type_id === 1) return true

  // Check accessible companies
  if (Array.isArray(socket.user.accessible_companies) &&
    socket.user.accessible_companies.includes(id)) {
    return true
  }

  // Check active company
  if (id === socket.user.active_company_id) return true

  return false
}

/**
 * Check if a socket can join a device room.
 *
 * TODO: device-level ownership check used to query the devices table to confirm
 * the device belongs to the user's active company. The DB layer was removed
 * during the rewrite — wire this back up against a new device model when the
 * device-management feature comes back online. Until then, this is a soft
 * allow for platform admins only.
 *
 * @param {import('socket.io').Socket} socket
 * @param {number|string} deviceId
 * @returns {Promise<boolean>}
 */
async function canJoinDeviceRoom(socket, _deviceId) {
  // Platform admins (Admin in a platform-type company) can join any room.
  // Everyone else: denied until the device-ownership check is reattached.
  if (socket.user?.user_type_id === 1 && socket.user?.company_type === 'platform') {
    return true
  }
  return false
}

module.exports = {
  socketAuthMiddleware,
  canJoinCompanyRoom,
  canJoinDeviceRoom,
}
