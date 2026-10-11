-- Snap-on Toolbox Tracker: database setup.
-- Already applied to the live project. Kept here as a record, and so the database can be rebuilt
-- by pasting this into a new Supabase project's SQL Editor.

-- ===== Tables =====

-- Each person's own tools: owned + wishlist
create table public.items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list          text not null check (list in ('owned', 'wishlist')),
  name          text not null default '' check (char_length(name) <= 200),
  part_number   text not null default '' check (char_length(part_number) <= 40),
  category      text not null default 'Other' check (char_length(category) <= 60),
  price         numeric(10,2) not null default 0 check (price >= 0 and price < 1000000),
  date_bought   date,
  condition     text check (condition in ('New', 'Good', 'Worn', 'Needs warranty')),
  location      text not null default '' check (char_length(location) <= 120),
  priority      text check (priority in ('Need', 'Want', 'Someday')),
  saved         numeric(10,2) not null default 0 check (saved >= 0 and saved < 1000000),
  notes         text not null default '' check (char_length(notes) <= 1000),
  photo_path    text check (char_length(photo_path) <= 300),
  photo_at      timestamptz,
  from_wishlist boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index items_user_id_idx on public.items (user_id);
create index items_part_number_idx on public.items (part_number);

-- Shared price list: one row per Snap-on part number, filled in by the price checker
create table public.catalog (
  part_number  text primary key check (part_number ~ '^[A-Z0-9][A-Z0-9./-]{0,39}$'),
  name         text,
  price        numeric(10,2),
  was_price    numeric(10,2),
  status       text not null default 'pending' check (status in ('pending', 'ok', 'not_found')),
  image_path   text,
  checked_at   timestamptz,
  requested_at timestamptz default now(),
  created_at   timestamptz not null default now()
);

-- Price history, one row per part number per day
create table public.catalog_prices (
  part_number text not null references public.catalog(part_number) on delete cascade,
  d           date not null,
  price       numeric(10,2) not null,
  primary key (part_number, d)
);

-- Price check runs, so the site can show a live progress bar
create table public.check_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'ok', 'failed')),
  total       int not null default 0,
  done        int not null default 0,
  current     text,
  changes     int not null default 0,
  error       text
);
create index check_runs_started_idx on public.check_runs (started_at desc);

-- ===== Triggers and functions =====

-- Tidy part numbers and stamp updated_at
create function public.items_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.part_number := upper(regexp_replace(coalesce(new.part_number, ''), '\s', '', 'g'));
  new.updated_at := now();
  return new;
end $$;
create trigger items_before_write before insert or update on public.items
  for each row execute function public.items_before_write();

-- Any new part number goes into the shared price list as pending
create function public.items_enqueue_part() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.part_number ~ '^[A-Z0-9][A-Z0-9./-]{0,39}$' then
    insert into public.catalog (part_number) values (new.part_number)
    on conflict (part_number) do nothing;
  end if;
  return new;
end $$;
create trigger items_enqueue_part after insert or update of part_number on public.items
  for each row execute function public.items_enqueue_part();
revoke execute on function public.items_enqueue_part() from public, anon, authenticated;

-- "Refresh prices": flag the caller's part numbers for the next check (at most every 10 minutes)
create function public.request_refresh() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then return 0; end if;
  update public.catalog c set requested_at = now()
   where c.part_number in (select i.part_number from public.items i where i.user_id = auth.uid())
     and (c.requested_at is null or c.requested_at < now() - interval '10 minutes');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.request_refresh() from public, anon;
grant execute on function public.request_refresh() to authenticated;

-- Which part numbers the price checker should visit (checker only)
create function public.parts_to_check(full_run boolean default false)
returns table (part_number text, has_image boolean, last_price numeric)
language sql stable set search_path = '' as $$
  select c.part_number, c.image_path is not null, c.price
    from public.catalog c
   where exists (select 1 from public.items i where i.part_number = c.part_number)
     and (full_run
          or c.status = 'pending'
          or c.requested_at > coalesce(c.checked_at, 'epoch'::timestamptz))
   order by (c.status = 'pending') desc, c.part_number;
$$;
revoke execute on function public.parts_to_check(boolean) from public, anon, authenticated;
grant execute on function public.parts_to_check(boolean) to service_role;

-- ===== Access rules =====

alter table public.items enable row level security;
alter table public.catalog enable row level security;
alter table public.catalog_prices enable row level security;
alter table public.check_runs enable row level security;

create policy "Read own items"   on public.items for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own items"    on public.items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Change own items" on public.items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own items" on public.items for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Anyone can read prices"        on public.catalog        for select to anon, authenticated using (true);
create policy "Anyone can read price history" on public.catalog_prices for select to anon, authenticated using (true);
create policy "Anyone can read check runs"    on public.check_runs     for select to anon, authenticated using (true);

grant select, insert, update, delete on public.items to authenticated;
grant select on public.catalog, public.catalog_prices, public.check_runs to anon, authenticated;
revoke all on public.items from anon;
revoke insert, update, delete, truncate, references, trigger on public.catalog, public.catalog_prices, public.check_runs from anon, authenticated;
revoke truncate, references, trigger on public.items from authenticated;

-- ===== Photo storage =====

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalog',     'catalog',     true, 1048576, array['image/webp', 'image/jpeg', 'image/png']),
  ('tool-photos', 'tool-photos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png']);

create policy "Upload own tool photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'tool-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "See own tool photo files" on storage.objects for select to authenticated
  using (bucket_id = 'tool-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Replace own tool photos" on storage.objects for update to authenticated
  using (bucket_id = 'tool-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own tool photos" on storage.objects for delete to authenticated
  using (bucket_id = 'tool-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ===== Community prices (added after the automatic checker was retired) =====

create table public.price_reports (
  id          bigint generated always as identity primary key,
  part_number text not null references public.catalog(part_number) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  price       numeric(10,2) not null,
  was_price   numeric(10,2),
  created_at  timestamptz not null default now()
);
create index price_reports_part_idx on public.price_reports (part_number, created_at desc);
create index price_reports_user_idx on public.price_reports (user_id, created_at desc);
alter table public.price_reports enable row level security;
revoke all on public.price_reports from anon, authenticated;

create function public.submit_price(pn text, new_price numeric, regular_price numeric default null)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  clean text := upper(regexp_replace(coalesce(pn, ''), '\s', '', 'g'));
  last numeric;
  recent int;
begin
  if uid is null then raise exception 'Sign in to add store prices.'; end if;
  if new_price is null or new_price <= 0 or new_price >= 100000 then raise exception 'Enter a price between $0.01 and $99,999.'; end if;
  if regular_price is not null and (regular_price <= new_price or regular_price >= 100000) then
    raise exception 'The regular price should be higher than the sale price.';
  end if;
  if not exists (select 1 from public.items i where i.user_id = uid and i.part_number = clean) then
    raise exception 'Add % to your box or wishlist first.', clean;
  end if;
  select count(*) into recent from public.price_reports r where r.user_id = uid and r.created_at > now() - interval '1 hour';
  if recent >= 60 then raise exception 'That''s a lot of price updates in an hour. Try again later.'; end if;
  select c.price into last from public.catalog c where c.part_number = clean;
  if last is not null and (new_price > last * 4 or new_price < last / 4) then
    raise exception 'That''s very different from the last price ($%). Double-check it on Snap-on''s store.', last;
  end if;
  insert into public.catalog (part_number) values (clean) on conflict (part_number) do nothing;
  update public.catalog
     set price = round(new_price, 2), was_price = round(regular_price, 2), status = 'ok', checked_at = now()
   where part_number = clean;
  insert into public.catalog_prices (part_number, d, price)
  values (clean, (now() at time zone 'utc')::date, round(new_price, 2))
  on conflict (part_number, d) do update set price = excluded.price;
  insert into public.price_reports (part_number, user_id, price, was_price) values (clean, uid, round(new_price, 2), round(regular_price, 2));
  return json_build_object('part_number', clean, 'price', round(new_price, 2), 'was_price', round(regular_price, 2));
end $$;
revoke execute on function public.submit_price(text, numeric, numeric) from public, anon;
grant execute on function public.submit_price(text, numeric, numeric) to authenticated;

-- ===== Price rules and account limits (added October 11, 2026) =====
-- Replaces submit_price above with the stricter version, and adds limits per account.

-- ===== Store prices: one update per person per part number per day =====

-- Remember what the price was before each update, so a bad update can be judged against
-- (and walked back to) the price before it.
alter table public.price_reports add column if not exists prev_price numeric(10,2);

create or replace function public.submit_price(pn text, new_price numeric, regular_price numeric default null)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  clean text := upper(regexp_replace(coalesce(pn, ''), '\s', '', 'g'));
  cur numeric;
  latest record;
  mine record;
  recent int;
  ok boolean;
  within4 constant numeric := 4;
begin
  if uid is null then raise exception 'Sign in to add store prices.'; end if;
  if new_price is null or new_price <= 0 or new_price >= 100000 then raise exception 'Enter a price between $0.01 and $99,999.'; end if;
  if regular_price is not null and (regular_price <= new_price or regular_price >= 100000) then
    raise exception 'The regular price should be higher than the sale price.';
  end if;
  if not exists (select 1 from public.items i where i.user_id = uid and i.part_number = clean) then
    raise exception 'Add % to your box or wishlist first.', clean;
  end if;

  -- one price update at a time per part number
  perform pg_advisory_xact_lock(hashtext('submit_price:' || clean));

  select count(*) into recent from public.price_reports r where r.user_id = uid and r.created_at > now() - interval '1 hour';
  if recent >= 60 then raise exception 'That''s a lot of price updates in an hour. Try again later.'; end if;

  select c.price into cur from public.catalog c where c.part_number = clean;
  select r.* into latest from public.price_reports r where r.part_number = clean order by r.created_at desc, r.id desc limit 1;
  select r.* into mine from public.price_reports r
   where r.part_number = clean and r.user_id = uid and r.created_at > now() - interval '24 hours'
   order by r.created_at desc, r.id desc limit 1;

  if mine.id is not null and latest.id = mine.id and mine.created_at > now() - interval '10 minutes' then
    -- Fixing your own typo within 10 minutes: judged against the price from before your update.
    ok := mine.prev_price is null
          or (new_price <= mine.prev_price * within4 and new_price >= mine.prev_price / within4);
    if not ok then
      raise exception 'That''s very different from the price before your update ($%). Double-check it on Snap-on''s store.', mine.prev_price;
    end if;
  elsif mine.id is not null then
    raise exception 'You already updated the price of % today. You can update it again tomorrow.', clean;
  else
    -- Close to the current price, or close to the price before the latest update
    -- (so anyone can undo a bad update), or the latest update was the very first price.
    ok := cur is null
          or (new_price <= cur * within4 and new_price >= cur / within4)
          or (latest.id is not null and (latest.prev_price is null
              or (new_price <= latest.prev_price * within4 and new_price >= latest.prev_price / within4)));
    if not ok then
      raise exception 'That''s very different from the last price ($%). Double-check it on Snap-on''s store.', cur;
    end if;
  end if;

  insert into public.catalog (part_number) values (clean) on conflict (part_number) do nothing;
  update public.catalog
     set price = round(new_price, 2), was_price = round(regular_price, 2), status = 'ok', checked_at = now()
   where part_number = clean;
  insert into public.catalog_prices (part_number, d, price)
  values (clean, (now() at time zone 'utc')::date, round(new_price, 2))
  on conflict (part_number, d) do update set price = excluded.price;
  insert into public.price_reports (part_number, user_id, price, was_price, prev_price)
  values (clean, uid, round(new_price, 2), round(regular_price, 2),
          case when mine.id is not null and latest.id = mine.id then mine.prev_price else cur end);
  return json_build_object('part_number', clean, 'price', round(new_price, 2), 'was_price', round(regular_price, 2));
end $$;
revoke execute on function public.submit_price(text, numeric, numeric) from public, anon;
grant execute on function public.submit_price(text, numeric, numeric) to authenticated;

-- ===== Per-account limits =====

-- At most 2,000 tools (box + wishlist) per account
create or replace function public.items_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.items i where i.user_id = new.user_id) >= 2000 then
    raise exception 'You''ve reached the limit of 2,000 tools per account. Delete some to add more.';
  end if;
  return new;
end $$;
revoke execute on function public.items_limit() from public, anon, authenticated;
drop trigger if exists items_limit on public.items;
create trigger items_limit before insert on public.items
  for each row execute function public.items_limit();

-- At most 300 uploaded photos per account, up to 3 MB each (the site shrinks photos well under that)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
create or replace function private.photo_count(uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from storage.objects o
   where o.bucket_id = 'tool-photos' and (storage.foldername(o.name))[1] = uid::text;
$$;
revoke execute on function private.photo_count(uuid) from public, anon;
grant execute on function private.photo_count(uuid) to authenticated;

drop policy if exists "Upload own tool photos" on storage.objects;
create policy "Upload own tool photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'tool-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and private.photo_count((select auth.uid())) < 300);
update storage.buckets set file_size_limit = 3145728 where id = 'tool-photos';

-- ===== Shared photos (added October 11, 2026) =====
-- People can share the photo of a tool in their box with everyone tracking the same part number.
-- The earliest shared photo for a part number is the one shown. Anyone tracking that part number
-- can report a wrong photo: it's hidden for them at once, and for everyone after 2 different reports.

alter table public.items add column if not exists photo_shared boolean not null default false;

create table if not exists public.photo_reports (
  item_id    uuid not null references public.items(id) on delete cascade,
  photo_path text not null,
  reporter   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, photo_path, reporter)
);
create index if not exists photo_reports_reporter_idx on public.photo_reports (reporter, created_at desc);
alter table public.photo_reports enable row level security;
revoke all on public.photo_reports from anon, authenticated;

create index if not exists items_shared_photo_idx on public.items (part_number, photo_at)
  where photo_shared and photo_path is not null and list = 'owned';

-- The shared photo for each part number asked about (at most 500 at a time).
-- Your own photos aren't included (you already see those), nor ones you reported.
create or replace function public.shared_photos(pns text[])
returns table (part_number text, item_id uuid, photo_path text)
language sql stable security definer set search_path = '' as $$
  select distinct on (i.part_number) i.part_number, i.id, i.photo_path
    from public.items i
   where i.part_number = any (pns[1:500])
     and i.list = 'owned'
     and i.photo_shared
     and i.photo_path is not null
     and i.user_id is distinct from auth.uid()
     and (select count(*) from public.photo_reports r
           where r.item_id = i.id and r.photo_path = i.photo_path) < 2
     and not exists (select 1 from public.photo_reports r
                      where r.item_id = i.id and r.photo_path = i.photo_path and r.reporter = auth.uid())
   order by i.part_number, i.photo_at nulls last, i.created_at, i.id;
$$;
revoke execute on function public.shared_photos(text[]) from public;
grant execute on function public.shared_photos(text[]) to anon, authenticated;

-- "Wrong photo?": only people tracking that part number, at most 30 reports an hour.
create or replace function public.report_photo(item uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  it record;
begin
  if uid is null then raise exception 'Sign in to report a photo.'; end if;
  select i.id, i.user_id, i.part_number, i.photo_path, i.photo_shared, i.list into it from public.items i where i.id = item;
  if it.id is null or not it.photo_shared or it.photo_path is null or it.list <> 'owned' then
    raise exception 'That photo isn''t shared anymore.';
  end if;
  if it.user_id = uid then raise exception 'That''s your own photo. Replace or remove it instead.'; end if;
  if not exists (select 1 from public.items i where i.user_id = uid and i.part_number = it.part_number) then
    raise exception 'Only people tracking % can report its photo.', it.part_number;
  end if;
  if (select count(*) from public.photo_reports r where r.reporter = uid and r.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'That''s a lot of reports in an hour. Try again later.';
  end if;
  insert into public.photo_reports (item_id, photo_path, reporter) values (it.id, it.photo_path, uid)
  on conflict do nothing;
end $$;
revoke execute on function public.report_photo(uuid) from public, anon;
grant execute on function public.report_photo(uuid) to authenticated;
