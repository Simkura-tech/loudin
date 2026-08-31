/**
 * DeviceActivityFeed — recent events for one device.
 *
 * Reads from /api/devices/:id/events (which joins device_events by hardware
 * id under the hood). Most-recent first, paginated via "Load more". Each
 * event renders with an icon + label + brief data summary + relative time.
 *
 * If new Simkura event types appear the feed falls back to a generic row
 * rather than rendering blank.
 */

import { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { IconActivity, IconRefresh } from '@tabler/icons-react';
import {
  devicesApi,
  type DeviceEvent,
  type EventSeverity,
} from '../../services/access/devices';
import { relativeTime, renderEvent } from './deviceEventRendering';

const PAGE_SIZE = 25;

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Description = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const RefreshButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.primary};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Card = styled.section`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  overflow: hidden;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};

  &:last-child { border-bottom: none; }
`;

const Icon = styled.span<{ $tone: EventSeverity }>`
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ $tone, theme }) =>
    $tone === 'error'   ? '#fee2e2'
  : $tone === 'warning' ? '#fef3c7'
  :                       `${theme.colors.brand.primary}14`};
  color: ${({ $tone, theme }) =>
    $tone === 'error'   ? '#b91c1c'
  : $tone === 'warning' ? '#92400e'
  :                       theme.colors.brand.primary};
`;

const Body = styled.div`
  min-width: 0;

  .title {
    font-weight: 600;
    font-size: 13px;
    color: ${({ theme }) => theme.colors.text.primary};
  }
  .detail {
    margin-top: 1px;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.tertiary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Stamp = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const Empty = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};

  .crest {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.background.secondary};
    color: ${({ theme }) => theme.colors.text.tertiary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }
  h3 { color: ${({ theme }) => theme.colors.text.primary}; margin: 0 0 4px; font-size: 15px; }
  p  { margin: 0; font-size: 13px; }
`;

const SkeletonRow = styled.div`
  height: 48px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  background: linear-gradient(90deg,
    ${({ theme }) => theme.colors.background.primary} 0%,
    ${({ theme }) => theme.colors.background.secondary} 50%,
    ${({ theme }) => theme.colors.background.primary} 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;

const LoadMore = styled.button`
  align-self: center;
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  background: ${({ theme }) => theme.colors.background.primary};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;

  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const ErrorBanner = styled.div`
  padding: 8px 10px;
  border-radius: 7px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 12px;
`;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  deviceId: number;
  /** Bumped by the parent (e.g., on Refresh) to force a reload. */
  refreshKey?: number;
}

export function DeviceActivityFeed({ deviceId, refreshKey = 0 }: Props) {
  const [events, setEvents] = useState<DeviceEvent[] | null>(null);
  const [total, setTotal]   = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const fetchPage = useCallback(async (off: number, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const r = await devicesApi.events(deviceId, { limit: PAGE_SIZE, offset: off });
      setTotal(r.total);
      setEvents((prev) => (append && prev ? [...prev, ...r.events] : r.events));
      setOffset(off + r.events.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
      if (!append) setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage, refreshKey]);

  const hasMore = events != null && events.length < total;

  return (
    <Wrap>
      <Description>
        Everything this lock reports back: who opened the door (and denied
        attempts), lock and unlock events, and battery or status check-ins.
        Battery-powered locks send events when they wake, so entries can lag
        a few minutes behind real time.
      </Description>
      <Toolbar>
        <span>
          {events === null
            ? 'Loading…'
            : `${total} ${total === 1 ? 'event' : 'events'}`}
        </span>
        <RefreshButton
          type="button"
          onClick={() => fetchPage(0, false)}
          disabled={loading}
          title="Refresh"
        >
          <IconRefresh size={14} />
          Refresh
        </RefreshButton>
      </Toolbar>

      {error && <ErrorBanner role="alert">{error}</ErrorBanner>}

      <Card>
        {events === null ? (
          <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        ) : events.length === 0 ? (
          <Empty>
            <span className="crest"><IconActivity size={22} strokeWidth={1.5} /></span>
            <h3>No activity yet</h3>
            <p>Events appear here when the device reports them — access reads, lock state changes, wake/sleep cycles.</p>
          </Empty>
        ) : (
          events.map((e) => {
            const rendered = renderEvent(e.event_type, e.event_data || {}, e);
            return (
              <Row key={e.id}>
                <Icon $tone={e.severity}>{rendered.icon}</Icon>
                <Body>
                  <div className="title">{rendered.title}</div>
                  {rendered.detail && <div className="detail">{rendered.detail}</div>}
                </Body>
                <Stamp title={new Date(e.received_at).toLocaleString()}>
                  {relativeTime(e.received_at)}
                </Stamp>
              </Row>
            );
          })
        )}
      </Card>

      {hasMore && (
        <LoadMore
          type="button"
          onClick={() => fetchPage(offset, true)}
          disabled={loading}
        >
          {loading ? 'Loading…' : `Load more (${total - (events?.length ?? 0)} remaining)`}
        </LoadMore>
      )}
    </Wrap>
  );
}

export default DeviceActivityFeed;
