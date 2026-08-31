/**
 * Generic API response / query types.
 *
 * Resource-specific response types should live with their feature when each
 * feature area is rebuilt. This file is intentionally minimal — only the
 * envelope shapes that all features share.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

export interface FilterParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** WebSocket envelope. Payload shape is feature-specific. */
export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp?: string;
}

/**
 * Used by the websocket service for typed events. Kept generic so the
 * device-management feature can extend it when it comes back online.
 */
export interface ConfigurationProgressMessage {
  device_id: string;
  status: 'in_progress' | 'completed' | 'failed';
  progress: number;
  total: number;
  current_operation?: string;
  error?: string;
}
