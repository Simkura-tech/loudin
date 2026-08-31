/**
 * WebSocket Service
 *
 * Manages Socket.io connection for real-time updates:
 * - Device configuration progress
 * - Bulk operation progress
 * - Device events
 */

import { io, Socket } from 'socket.io-client';
import type { ConfigurationProgressMessage } from '../../types';

// Event types for the socket service
type SocketEventType =
  | 'config-progress'
  | 'bulk-config-progress'
  | 'queue-progress'
  | 'device-event';

// Callback type for event listeners
type EventCallback<T = unknown> = (data: T) => void;

// Bulk configuration progress data
interface BulkConfigProgressData {
  job_id: string;
  total_devices: number;
  completed_devices: number;
  failed_devices: number;
  status: 'in_progress' | 'completed' | 'failed';
  current_device_id?: string;
  error?: string;
}

// Queue progress data
interface QueueProgressData {
  queue_id: string;
  total_commands: number;
  processed_commands: number;
  status: 'processing' | 'completed' | 'failed';
  current_operation?: string;
}

// Device event data
interface DeviceEventData {
  device_id: string;
  event_type: string;
  event_data?: Record<string, unknown>;
  timestamp: string;
}

// Configuration subscription options
interface ConfigSubscriptionOptions {
  deviceId: number | string;
  configJobId?: number | string | null;
}

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private companyId: number | string | null = null;

  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.companyId = null;
  }

  /**
   * Connect to the WebSocket server
   * @param serverUrl - Server URL (defaults to API URL)
   * @returns Connection success
   */
  connect(serverUrl: string | null = null): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve(true);
        return;
      }

      const url = serverUrl || import.meta.env.VITE_API_URL || '';

      this.socket = io(url, {
        transports: ['websocket', 'polling'],
        withCredentials: true,    // Send httpOnly cookie for auth
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('[SOCKET] Connected:', this.socket?.id);

        // Rejoin company room if we have a companyId
        if (this.companyId) {
          this.joinCompany(this.companyId);
        }

        resolve(true);
      });

      this.socket.on('disconnect', (reason: string) => {
        console.log('[SOCKET] Disconnected:', reason);
      });

      this.socket.on('connect_error', (error: Error) => {
        if (error.message.includes('Authentication')) {
          console.error('[SOCKET] Authentication failed:', error.message);
        } else {
          console.error('[SOCKET] Connection error:', error.message);
        }
        reject(error);
      });

      // Set up default event listeners
      this._setupDefaultListeners();
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
    }
  }

  /**
   * Join a company room to receive company-specific events
   * @param companyId - Company ID
   */
  joinCompany(companyId: number | string): void {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot join company room');
      this.companyId = companyId; // Store for later
      return;
    }

    this.companyId = companyId;
    this.socket.emit('join-company', companyId);
    console.log('[SOCKET] Joined company room:', companyId);
  }

  /**
   * Join a device room for device-specific events
   * @param deviceId - Device ID
   */
  joinDevice(deviceId: number | string): void {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot join device room');
      return;
    }

    this.socket.emit('join-device', deviceId);
    console.log('[SOCKET] Joined device room:', deviceId);
  }

  /**
   * Subscribe to configuration progress for a specific device
   * @param deviceId - Device ID
   * @param configJobId - Configuration job ID (optional)
   */
  subscribeToConfigProgress(deviceId: number | string, configJobId: number | string | null = null): void {
    if (!this.socket?.connected) {
      console.warn('[SOCKET] Not connected, cannot subscribe to config progress');
      return;
    }

    const options: ConfigSubscriptionOptions = { deviceId, configJobId };
    this.socket.emit('subscribe-config-progress', options);
  }

  /**
   * Set up default event listeners
   * @private
   */
  private _setupDefaultListeners(): void {
    if (!this.socket) return;

    // Configuration progress events
    this.socket.on('config-progress', (data: ConfigurationProgressMessage) => {
      this._notifyListeners('config-progress', data);
    });

    // Bulk configuration progress events
    this.socket.on('bulk-config-progress', (data: BulkConfigProgressData) => {
      this._notifyListeners('bulk-config-progress', data);
    });

    // Queue processing progress
    this.socket.on('queue-progress', (data: QueueProgressData) => {
      this._notifyListeners('queue-progress', data);
    });

    // Device events (online/offline, access events)
    this.socket.on('device-event', (data: DeviceEventData) => {
      this._notifyListeners('device-event', data);
    });
  }

  /**
   * Add a listener for a specific event
   * @param event - Event name
   * @param callback - Callback function
   * @returns Unsubscribe function
   */
  on<T = unknown>(event: SocketEventType, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback);
    };
  }

  /**
   * Remove a listener for a specific event
   * @param event - Event name
   * @param callback - Callback function
   */
  off<T = unknown>(event: SocketEventType, callback: EventCallback<T>): void {
    this.listeners.get(event)?.delete(callback as EventCallback);
  }

  /**
   * Remove all listeners for an event
   * @param event - Event name (optional, removes all if not provided)
   */
  removeAllListeners(event: SocketEventType | null = null): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Notify all listeners for an event
   * @param event - Event name
   * @param data - Event data
   * @private
   */
  private _notifyListeners<T>(event: string, data: T): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[SOCKET] Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Check if connected
   * @returns Connection status
   */
  isSocketConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Get the socket instance
   * @returns Socket instance or null
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

// Export singleton instance
const socketService = new SocketService();
export default socketService;

// Export types for external use
export type {
  SocketEventType,
  EventCallback,
  BulkConfigProgressData,
  QueueProgressData,
  DeviceEventData,
  ConfigSubscriptionOptions,
};
