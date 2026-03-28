-- Single RPC that returns the full analytics summary for a given period.
-- Replaces 8 sequential JS-side queries with one server-side call.

create or replace function analytics_summary(since timestamptz)
returns json
language sql
stable
as $$
  select json_build_object(
    'totalViews', (
      select count(*)
      from analytics_events
      where event_type = 'page_view' and created_at >= since
    ),
    'uniqueVisitors', (
      select count(distinct ip_hash)
      from analytics_events
      where event_type = 'page_view' and created_at >= since
    ),
    'topPage', (
      select json_build_object('path', coalesce(page_path, '(unknown)'), 'views', cnt)
      from (
        select page_path, count(*) as cnt
        from analytics_events
        where event_type = 'page_view' and created_at >= since
        group by page_path
        order by cnt desc
        limit 1
      ) t
    ),
    'topReferrer', (
      select json_build_object('source', referrer, 'count', cnt)
      from (
        select referrer, count(*) as cnt
        from analytics_events
        where event_type = 'page_view' and created_at >= since and referrer is not null
        group by referrer
        order by cnt desc
        limit 1
      ) t
    ),
    'contactSubmissions', (
      select count(*)
      from analytics_events
      where event_type = 'contact_submit' and created_at >= since
    ),
    'shopClicks', (
      select count(*)
      from analytics_events
      where event_type = 'shop_click' and created_at >= since
    ),
    'newsletterSubscribes', (
      select count(*)
      from analytics_events
      where event_type = 'newsletter_subscribe' and created_at >= since
    ),
    'shareClicks', (
      select count(*)
      from analytics_events
      where event_type = 'share_click' and created_at >= since
    )
  );
$$;

-- Restrict to service_role — matches table-level RLS (no public SELECT).
revoke execute on function analytics_summary(timestamptz) from public;
grant execute on function analytics_summary(timestamptz) to service_role;
