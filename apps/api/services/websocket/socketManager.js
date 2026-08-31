/**
 * WebSocket Manager
 *
 * Manages Socket.io connections for real-time updates.
 * Provides channels for:
 * - Device configuration progress
 * - Command queue status
 * - Device events
 */

const { Server } = require('socket.io')
const { socketAuthMiddleware, canJoinCompanyRoom, canJoinDeviceRoom } = require('../../middleware/websocket/socketAuth')

class SocketManager {
  constructor() {
    this.io = null
    this.connections = new Map() // Track connections by company
  }

  /**
   * Initialize Socket.io with the HTTP server
   * @param {http.Server} server - HTTP server instance
   * @param {Object} options - Socket.io options
   */
  initialize(server, options = {}) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      ...options,
    })

    // Apply authentication middleware
    this.io.use(socketAuthMiddleware)

    this.io.on('connection', (socket) => {
      console.log(`[SOCKET] Client connected: ${socket.id} (user: ${socket.user?.user_id})`)

      // Handle room joining (company-specific channels)
      socket.on('join-company', (companyId) => {
        if (!canJoinCompanyRoom(socket, companyId)) {
          socket.emit('error', { message: 'Unauthorized to join this company room' })
          return
        }

        const room = `company-${companyId}`
        socket.join(room)
        console.log(`[SOCKET] ${socket.id} joined room: ${room}`)

        // Track connection
        if (!this.connections.has(companyId)) {
          this.connections.set(companyId, new Set())
        }
        this.connections.get(companyId).add(socket.id)
      })

      // Handle device-specific channel joining
      socket.on('join-device', async (deviceId) => {
        const allowed = await canJoinDeviceRoom(socket, deviceId)
        if (!allowed) {
          socket.emit('error', { message: 'Unauthorized to join this device room' })
          return
        }

        const room = `device-${deviceId}`
        socket.join(room)
        console.log(`[SOCKET] ${socket.id} joined room: ${room}`)
      })

      // Handle configuration progress subscription
      socket.on('subscribe-config-progress', async ({ deviceId, configJobId }) => {
        const allowed = await canJoinDeviceRoom(socket, deviceId)
        if (!allowed) {
          socket.emit('error', { message: 'Unauthorized to subscribe to this device' })
          return
        }

        const room = `config-${deviceId}-${configJobId}`
        socket.join(room)
        console.log(`[SOCKET] ${socket.id} subscribed to config progress: ${room}`)
      })

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`[SOCKET] Client disconnected: ${socket.id} (user: ${socket.user?.user_id})`)

        // Clean up connection tracking
        for (const [companyId, sockets] of this.connections.entries()) {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id)
            if (sockets.size === 0) {
              this.connections.delete(companyId)
            }
          }
        }
      })
    })

    console.log('[SOCKET] WebSocket manager initialized')
    return this.io
  }

  /**
   * Get the Socket.io instance
   * @returns {Server|null}
   */
  getIO() {
    return this.io
  }

  /**
   * Emit event to a specific company room
   * @param {number} companyId - Company ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToCompany(companyId, event, data) {
    if (!this.io) {
      console.warn('[SOCKET] Socket.io not initialized')
      return
    }
    this.io.to(`company-${companyId}`).emit(event, data)
  }

  /**
   * Emit event to a specific device room
   * @param {number} deviceId - Device ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToDevice(deviceId, event, data) {
    if (!this.io) {
      console.warn('[SOCKET] Socket.io not initialized')
      return
    }
    this.io.to(`device-${deviceId}`).emit(event, data)
  }

  /**
   * Emit configuration progress update
   * @param {number} companyId - Company ID
   * @param {number} deviceId - Device ID
   * @param {Object} progress - Progress data
   */
  emitConfigProgress(companyId, deviceId, progress) {
    if (!this.io) return

    // Emit to company room
    this.io.to(`company-${companyId}`).emit('config-progress', {
      deviceId,
      ...progress,
    })

    // Emit to device-specific room
    this.io.to(`device-${deviceId}`).emit('config-progress', progress)
  }

  /**
   * Emit bulk configuration progress update
   * @param {number} companyId - Company ID
   * @param {Object} progress - Bulk progress data
   */
  emitBulkConfigProgress(companyId, progress) {
    if (!this.io) return

    this.io.to(`company-${companyId}`).emit('bulk-config-progress', progress)
  }

  /**
   * Emit queue processing progress
   * @param {number} companyId - Company ID
   * @param {Object} progress - Queue progress data
   */
  emitQueueProgress(companyId, progress) {
    if (!this.io) return

    this.io.to(`company-${companyId}`).emit('queue-progress', progress)
  }

  /**
   * Emit device event (online/offline, access events, etc.)
   * @param {number} companyId - Company ID
   * @param {number} deviceId - Device ID
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   */
  emitDeviceEvent(companyId, deviceId, eventType, data) {
    if (!this.io) return

    const event = {
      deviceId,
      eventType,
      timestamp: Date.now(),
      ...data,
    }

    this.io.to(`company-${companyId}`).emit('device-event', event)
    this.io.to(`device-${deviceId}`).emit('device-event', event)
  }

  /**
   * Get connected client count for a company
   * @param {number} companyId - Company ID
   * @returns {number} Number of connected clients
   */
  getCompanyConnectionCount(companyId) {
    const sockets = this.connections.get(companyId)
    return sockets ? sockets.size : 0
  }

  /**
   * Check if Socket.io is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.io !== null
  }
}

// Export singleton instance
module.exports = new SocketManager()
