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
