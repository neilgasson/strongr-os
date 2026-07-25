-- Strongr OS
-- Migration: M0 Governed Platform Kernel
-- Status: reviewed implementation; do not execute outside the isolated
-- strongr-os environment.
--
-- Forward repair: this migration is atomic. If it fails before commit, repair
-- the file and rerun against a clean database. Never edit it after production
-- execution; add a new forward-only migration instead.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create or replace function app_private.reject_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%I is append-only', tg_table_name);
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  preferred_name text
    check (preferred_name is null or length(btrim(preferred_name)) between 1 and 100),
  status text not null default 'active'
    check (status in ('active', 'disabled', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'ended')),
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id),
  unique (id, organization_id),
  unique (id, profile_id, organization_id),
  check (
    (status = 'ended' and ended_at is not null)
    or (status <> 'ended' and ended_at is null)
  )
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique
    check (key ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  description text,
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key),
  unique (id, organization_id)
);

create table public.role_permission_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  role_id uuid not null,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  granted_by_membership_id uuid,
  granted_at timestamptz not null default now(),
  foreign key (role_id, organization_id)
    references public.roles(id, organization_id) on delete restrict,
  foreign key (granted_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create table public.role_permission_revocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  grant_id uuid not null,
  revoked_by_membership_id uuid,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]*$'),
  revoked_at timestamptz not null default now(),
  foreign key (grant_id, organization_id)
    references public.role_permission_grants(id, organization_id) on delete restrict,
  foreign key (revoked_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (grant_id),
  unique (id, organization_id)
);

create table public.membership_role_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  granted_by_membership_id uuid,
  granted_at timestamptz not null default now(),
  foreign key (membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  foreign key (role_id, organization_id)
    references public.roles(id, organization_id) on delete restrict,
  foreign key (granted_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create table public.membership_role_revocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  grant_id uuid not null,
  revoked_by_membership_id uuid,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]*$'),
  revoked_at timestamptz not null default now(),
  foreign key (grant_id, organization_id)
    references public.membership_role_grants(id, organization_id) on delete restrict,
  foreign key (revoked_by_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (grant_id),
  unique (id, organization_id)
);

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  key text not null
    check (key ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$'),
  description text,
  is_enabled boolean not null default false,
  owner_membership_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_membership_id, organization_id)
    references public.memberships(id, organization_id) on delete restrict,
  unique (organization_id, key),
  unique (id, organization_id)
);

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operation text not null check (length(btrim(operation)) between 1 and 160),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 255),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'started'
    check (status in ('started', 'completed', 'failed', 'expired')),
  response_code integer,
  response_reference jsonb
    check (response_reference is null or jsonb_typeof(response_reference) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  unique (organization_id, operation, idempotency_key),
  unique (id, organization_id)
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null
    check (event_type ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'),
  event_version integer not null default 1 check (event_version > 0),
  aggregate_type text not null check (length(btrim(aggregate_type)) between 1 and 120),
  aggregate_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  correlation_id uuid not null,
  causation_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error_code text,
  unique (id, organization_id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  actor_membership_id uuid,
  action text not null
    check (action ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'),
  target_type text not null check (length(btrim(target_type)) between 1 and 120),
  target_id uuid,
  previous_state jsonb
    check (previous_state is null or jsonb_typeof(previous_state) = 'object'),
  new_state jsonb
    check (new_state is null or jsonb_typeof(new_state) = 'object'),
  reason_code text check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_]*$'),
  correlation_id uuid not null,
  source_channel text not null
    check (source_channel in ('web', 'worker', 'api', 'system', 'migration', 'support')),
  created_at timestamptz not null default now(),
  foreign key (actor_membership_id, actor_profile_id, organization_id)
    references public.memberships(id, profile_id, organization_id) on delete restrict,
  unique (id, organization_id),
  check (
    (actor_membership_id is null and actor_profile_id is null)
    or (actor_membership_id is not null and actor_profile_id is not null)
  )
);

create index memberships_profile_status_idx
  on public.memberships (profile_id, status);
create index roles_org_active_idx
  on public.roles (organization_id, is_active);
create index role_permission_grants_role_idx
  on public.role_permission_grants (organization_id, role_id, permission_id);
create index membership_role_grants_member_idx
  on public.membership_role_grants (organization_id, membership_id, role_id);
create index idempotency_keys_expiry_idx
  on public.idempotency_keys (expires_at) where expires_at is not null;
create index outbox_events_ready_idx
  on public.outbox_events (available_at, created_at, id)
  where status in ('pending', 'failed');
create index audit_events_org_time_idx
  on public.audit_events (organization_id, created_at desc, id desc);
create index audit_events_target_idx
  on public.audit_events (organization_id, target_type, target_id, created_at desc);

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function app_private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function app_private.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
for each row execute function app_private.set_updated_at();
create trigger roles_set_updated_at before update on public.roles
for each row execute function app_private.set_updated_at();
create trigger feature_flags_set_updated_at before update on public.feature_flags
for each row execute function app_private.set_updated_at();

create trigger permissions_immutable before update or delete on public.permissions
for each row execute function app_private.reject_mutation();
create trigger role_permission_grants_immutable before update or delete on public.role_permission_grants
for each row execute function app_private.reject_mutation();
create trigger role_permission_revocations_immutable before update or delete on public.role_permission_revocations
for each row execute function app_private.reject_mutation();
create trigger membership_role_grants_immutable before update or delete on public.membership_role_grants
for each row execute function app_private.reject_mutation();
create trigger membership_role_revocations_immutable before update or delete on public.membership_role_revocations
for each row execute function app_private.reject_mutation();
create trigger audit_events_immutable before update or delete on public.audit_events
for each row execute function app_private.reject_mutation();

create or replace function public.is_active_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.current_membership_id(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.id
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.profile_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.has_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.memberships m
    join public.membership_role_grants mrg
      on mrg.membership_id = m.id
     and mrg.organization_id = m.organization_id
    left join public.membership_role_revocations mrr
      on mrr.grant_id = mrg.id
    join public.roles r
      on r.id = mrg.role_id
     and r.organization_id = mrg.organization_id
     and r.is_active
    join public.role_permission_grants rpg
      on rpg.role_id = r.id
     and rpg.organization_id = r.organization_id
    left join public.role_permission_revocations rpr
      on rpr.grant_id = rpg.id
    join public.permissions p on p.id = rpg.permission_id
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and mrr.id is null
      and rpr.id is null
      and p.key = p_permission_key
  );
$$;

create or replace function app_private.require_permission(
  p_organization_id uuid,
  p_permission_key text,
  p_require_aal2 boolean default false
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_membership_id uuid;
  v_aal text;
begin
  v_membership_id := public.current_membership_id(p_organization_id);
  if v_membership_id is null
     or not public.has_permission(p_organization_id, p_permission_key) then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  if p_require_aal2 then
    v_aal := coalesce(auth.jwt() ->> 'aal', '');
    if v_aal <> 'aal2' then
      raise exception using errcode = '42501', message = 'aal2 authentication required';
    end if;
  end if;

  return v_membership_id;
end;
$$;

create or replace function app_private.bootstrap_first_owner(
  p_profile_id uuid,
  p_organization_name text,
  p_organization_slug text,
  p_display_name text
)
returns table (organization_id uuid, membership_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_organization_id uuid;
  v_membership_id uuid;
  v_role_id uuid;
  v_correlation_id uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext('strongr-os:first-owner'));

  if exists (select 1 from public.organizations) then
    raise exception using errcode = '55000', message = 'first owner is already bootstrapped';
  end if;
  if not exists (select 1 from auth.users where id = p_profile_id) then
    raise exception using errcode = '23503', message = 'auth user does not exist';
  end if;

  insert into public.organizations (name, slug)
  values (p_organization_name, p_organization_slug)
  returning id into v_organization_id;

  insert into public.profiles (id, display_name)
  values (p_profile_id, p_display_name);

  insert into public.memberships (organization_id, profile_id)
  values (v_organization_id, p_profile_id)
  returning id into v_membership_id;

  insert into public.roles (organization_id, key, name, description, is_system)
  values (v_organization_id, 'owner', 'Owner', 'Full owner authority.', true)
  returning id into v_role_id;

  insert into public.membership_role_grants (
    organization_id, membership_id, role_id, granted_by_membership_id
  ) values (
    v_organization_id, v_membership_id, v_role_id, v_membership_id
  );

  insert into public.role_permission_grants (
    organization_id, role_id, permission_id, granted_by_membership_id
  )
  select v_organization_id, v_role_id, p.id, v_membership_id
  from public.permissions p;

  insert into public.audit_events (
    organization_id, actor_profile_id, actor_membership_id, action,
    target_type, target_id, reason_code, correlation_id, source_channel
  ) values (
    v_organization_id, p_profile_id, v_membership_id,
    'organization.owner_bootstrapped', 'organization', v_organization_id,
    'initial_bootstrap', v_correlation_id, 'migration'
  );

  return query select v_organization_id, v_membership_id;
end;
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;
revoke all on function public.is_active_organization_member(uuid) from public;
revoke all on function public.current_membership_id(uuid) from public;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.is_active_organization_member(uuid) to authenticated;
grant execute on function public.current_membership_id(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;

insert into public.permissions (key, name, description)
values
  ('organization.read', 'Read organization', 'View organization information.'),
  ('membership.read', 'Read memberships', 'View organization memberships.'),
  ('membership.manage', 'Manage memberships', 'Manage organization memberships.'),
  ('role.read', 'Read roles', 'View roles and permission assignments.'),
  ('role.manage', 'Manage roles', 'Manage roles and permission assignments.'),
  ('feature_flag.read', 'Read feature flags', 'View release controls.'),
  ('feature_flag.manage', 'Manage feature flags', 'Manage release controls.'),
  ('audit.read', 'Read audit history', 'View organization audit evidence.'),
  ('content.create', 'Create content', 'Create content identities, briefs, and drafts.'),
  ('content.submit', 'Submit content', 'Submit an immutable content version.'),
  ('review.scripture', 'Review Scripture', 'Record Scripture review decisions.'),
  ('review.theology', 'Review theology', 'Record theology and pastoral decisions.'),
  ('review.editorial', 'Review editorial', 'Record editorial decisions.'),
  ('approval.grant', 'Grant approval', 'Approve an exact evidence snapshot.'),
  ('approval.revoke', 'Revoke approval', 'Revoke an approval with a reason.'),
  ('export.request', 'Request export', 'Create an approved production package.'),
  ('job.read', 'Read jobs', 'View organization job status.'),
  ('publication.schedule', 'Schedule publication', 'Schedule approved content.'),
  ('publication.execute', 'Execute publication', 'Publish to an approved destination.');

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permission_grants enable row level security;
alter table public.role_permission_revocations enable row level security;
alter table public.membership_role_grants enable row level security;
alter table public.membership_role_revocations enable row level security;
alter table public.feature_flags enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_member_select on public.organizations
for select to authenticated using (public.is_active_organization_member(id));
create policy profiles_self_select on public.profiles
for select to authenticated using (id = auth.uid());
create policy memberships_member_select on public.memberships
for select to authenticated using (public.is_active_organization_member(organization_id));
create policy permissions_authenticated_select on public.permissions
for select to authenticated using (true);
create policy roles_member_select on public.roles
for select to authenticated using (public.is_active_organization_member(organization_id));
create policy role_permission_grants_member_select on public.role_permission_grants
for select to authenticated using (public.is_active_organization_member(organization_id));
create policy role_permission_revocations_member_select on public.role_permission_revocations
for select to authenticated using (public.is_active_organization_member(organization_id));
create policy membership_role_grants_member_select on public.membership_role_grants
for select to authenticated using (public.is_active_organization_member(organization_id));
create policy membership_role_revocations_member_select on public.membership_role_revocations
for select to authenticated using (public.is_active_organization_member(organization_id));
create policy feature_flags_member_select on public.feature_flags
for select to authenticated using (public.is_active_organization_member(organization_id));
create policy audit_events_authorized_select on public.audit_events
for select to authenticated using (public.has_permission(organization_id, 'audit.read'));

revoke all on public.organizations, public.profiles, public.memberships,
  public.permissions, public.roles, public.role_permission_grants,
  public.role_permission_revocations, public.membership_role_grants,
  public.membership_role_revocations, public.feature_flags,
  public.idempotency_keys, public.outbox_events, public.audit_events
from anon, authenticated;
grant select on public.organizations, public.profiles, public.memberships,
  public.permissions, public.roles, public.role_permission_grants,
  public.role_permission_revocations, public.membership_role_grants,
  public.membership_role_revocations, public.feature_flags, public.audit_events
to authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER')
  ) then
    raise exception 'M0 verification failed: browser write grant found';
  end if;
end;
$$;

commit;
