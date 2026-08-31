/**
 * OverviewPage — landing page after login.
 *
 * Pulls people and device counts from their respective list endpoints
 * (with limit=1 so the response is cheap), plus the company-wide recent
 * activity feed (GET /api/devices/events).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  IconArrowRight,
  IconLock,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { peopleApi } from '../../services/access/people';
import {
  devicesApi,
  type CompanyEvent,
  type EventSeverity,
} from '../../services/access/devices';
import { relativeTime, renderEvent } from '../../components/devices/deviceEventRendering';

const ACTIVITY_LIMIT = 8;

const PageHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 22px;

  h1 {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0;
  }
  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.text.secondary};
    font-size: 13px;
  }
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  padding: 14px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.background.primary};

  .label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.text.tertiary};
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .value {
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin-top: 6px;
    line-height: 1.1;
  }
  .skeleton {
    display: inline-block;
    width: 40px;
    height: 26px;
    background: ${({ theme }) => theme.colors.background.secondary};
    border-radius: 6px;
    margin-top: 6px;
  }
`;

const Section = styled.section`
  margin-bottom: 24px;
`;

const SectionTitle = styled.h2`
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 10px;
`;

const QuickGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
`;

const QuickLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.background.primary};
  text-decoration: none;
  color: ${({ theme }) => theme.colors.text.primary};
  transition: border-color 0.15s ease, transform 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.brand.primary};
    transform: translateY(-1px);
  }

  .icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.brand.primary}14;
    color: ${({ theme }) => theme.colors.brand.primary};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-weight: 600;
    font-size: 13px;
  }
  .sub {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.text.secondary};
    margin-top: 1px;
  }
  .arrow {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
`;

const ActivityCard = styled.section`
  background: ${({ theme }) => theme.colors.background.primary};
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  border-radius: 10px;
  overflow: hidden;
`;

const ActivityRow = styled(Link)`
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  text-decoration: none;
  color: inherit;

  &:last-child { border-bottom: none; }
  &:hover { background: ${({ theme }) => theme.colors.background.secondary}; }
`;

const EventIcon = styled.span<{ $tone: EventSeverity }>`
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

const EventBody = styled.div`
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

const EventStamp = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const ActivitySkeleton = styled.div`
  height: 48px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.light};
  background: linear-gradient(90deg,
    ${({ theme }) => theme.colors.background.primary} 0%,
    ${({ theme }) => theme.colors.background.secondary} 50%,
    ${({ theme }) => theme.colors.background.primary} 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  &:last-child { border-bottom: none; }
`;

const EmptyState = styled.div`
  padding: 22px;
  border: 1px dashed ${({ theme }) => theme.colors.border.medium ?? theme.colors.border.light};
  border-radius: 10px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 13px;
  background: ${({ theme }) => theme.colors.background.primary};

  a {
    color: ${({ theme }) => theme.colors.brand.primary};
    text-decoration: none;
    font-weight: 500;
    margin-left: 4px;
  }
  a:hover { text-decoration: underline; }
`;

export function OverviewPage() {
  const { user } = useAuth();
  const [peopleCount, setPeopleCount]   = useState<number | null>(null);
  const [devicesCount, setDevicesCount] = useState<number | null>(null);
  const [recentEvents, setRecentEvents] = useState<CompanyEvent[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, d] = await Promise.all([
          peopleApi.list({ limit: 1 }),
          devicesApi.list({ limit: 1 }),
        ]);
        setPeopleCount(p.total);
        setDevicesCount(d.total);
      } catch {
        setPeopleCount(0);
        setDevicesCount(0);
      }
    })();
    (async () => {
      try {
        const r = await devicesApi.recentEvents({ limit: ACTIVITY_LIMIT });
        setRecentEvents(r.events);
      } catch {
        setRecentEvents([]);
      }
    })();
  }, []);

  if (!user) return null;

  return (
    <>
      <PageHeader>
        <h1>Welcome back, {user.first_name}.</h1>
        <p>Here&apos;s what&apos;s happening at {user.company_name}.</p>
      </PageHeader>

      <StatGrid>
        <StatCard>
          <span className="label"><IconUsers size={14} /> People</span>
          {peopleCount === null ? (
            <span className="skeleton" />
          ) : (
            <div className="value">{peopleCount}</div>
          )}
        </StatCard>
        <StatCard>
          <span className="label"><IconLock size={14} /> Devices</span>
          {devicesCount === null ? (
            <span className="skeleton" />
          ) : (
            <div className="value">{devicesCount}</div>
          )}
        </StatCard>
      </StatGrid>

      <Section>
        <SectionTitle>Quick actions</SectionTitle>
        <QuickGrid>
          <QuickLink to="/app/people">
            <span className="icon"><IconUserPlus size={20} strokeWidth={1.75} /></span>
            <span className="body">
              <div className="title">Add a person</div>
              <div className="sub">Create a credential holder for door access.</div>
            </span>
            <IconArrowRight size={18} className="arrow" />
          </QuickLink>
          <QuickLink to="/app/devices">
            <span className="icon"><IconLock size={20} strokeWidth={1.75} /></span>
            <span className="body">
              <div className="title">View devices</div>
              <div className="sub">Status and battery for every lock.</div>
            </span>
            <IconArrowRight size={18} className="arrow" />
          </QuickLink>
        </QuickGrid>
      </Section>

      <Section>
        <SectionTitle>Recent activity</SectionTitle>
        {recentEvents === null ? (
          <ActivityCard>
            <ActivitySkeleton /><ActivitySkeleton /><ActivitySkeleton />
          </ActivityCard>
        ) : recentEvents.length === 0 ? (
          <EmptyState>
            Activity log will appear here once devices are reporting events.
            <Link to="/app/devices">View devices</Link>
          </EmptyState>
        ) : (
          <ActivityCard>
            {recentEvents.map((e) => {
              const rendered = renderEvent(e.event_type, e.event_data || {}, e);
              return (
                <ActivityRow key={e.id} to={`/app/devices/${e.device_pk}`}>
                  <EventIcon $tone={e.severity}>{rendered.icon}</EventIcon>
                  <EventBody>
                    <div className="title">{rendered.title}</div>
                    <div className="detail">
                      {e.device_name}
                      {rendered.detail ? ` · ${rendered.detail}` : ''}
                    </div>
                  </EventBody>
                  <EventStamp title={new Date(e.received_at).toLocaleString()}>
                    {relativeTime(e.received_at)}
                  </EventStamp>
                </ActivityRow>
              );
            })}
          </ActivityCard>
        )}
      </Section>
    </>
  );
}

export default OverviewPage;
