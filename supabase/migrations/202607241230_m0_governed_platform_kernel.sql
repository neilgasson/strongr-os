-- Strongr OS
-- Migration: M0 Governed Platform Kernel
-- File: 202607241230_m0_governed_platform_kernel.sql
-- Status: DRAFT FOR REVIEW — DO NOT RUN YET
-- Owner: Strongr Society / Neil Gasson
--
-- Purpose:
-- Establish the minimum organization, identity, membership, role, permission,
-- audit, idempotency, and outbox foundations required before M1 continues.
--
-- This migration intentionally does NOT create content, review, approval,
-- AI-generation, export, publishing, recommendation, journal, prayer, or
-- Strongr Daily 2.0 tables.

begin;

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 2. Shared helper function
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Organizations
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organizations_name_not_blank
    check (length(btrim(name)) between 1 and 160),

  constraint organizations_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),

  constraint organizations_status_allowed
    check (status in ('active', 'suspended', 'archived')),

  constraint organizations_slug_unique
    unique (slug),

  constraint organizations_tenant_identity_unique
    unique (id, id)
);

comment on table public.organizations is
  'Tenant root. Strongr Society is the first organization.';

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  preferred_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_display_name_not_blank
    check (length(btrim(display_name)) between 1 and 160),

  constraint profiles_preferred_name_length
    check (preferred_name is null or length(btrim(preferred_name)) between 1 and 100),

  constraint profiles_status_allowed
    check (status in ('active', 'disabled', 'deleted'))
);

comment on table public.profiles is
  'Application profile linked to the stable Supabase Auth user UUID. Email is not identity.';

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Memberships
-- ---------------------------------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint memberships_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint memberships_status_allowed
    check (status in ('invited', 'active', 'suspended', 'ended')),

  constraint memberships_end_consistency
    check (
      (status = 'ended' and ended_at is not null)
      or
      (status <> 'ended' and ended_at is null)
    ),

  constraint memberships_one_current_membership
    unique (organization_id, profile_id),

  constraint memberships_tenant_identity_unique
    unique (id, organization_id)
);

comment on table public.memberships is
  'Connects one profile to one organization. Roles are assigned to memberships.';

create index memberships_profile_idx
  on public.memberships (profile_id, status);

create index memberships_org_status_idx
  on public.memberships (organization_id, status);

create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Permissions
-- ---------------------------------------------------------------------------

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),

  constraint permissions_key_format
    check (key ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'),

  constraint permissions_name_not_blank
    check (length(btrim(name)) between 1 and 160),

  constraint permissions_key_unique
    unique (key)
);

comment on table public.permissions is
  'Stable permission definitions. Permission keys are the authorization contract.';

-- ---------------------------------------------------------------------------
-- 7. Roles
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint roles_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint roles_key_format
    check (key ~ '^[a-z][a-z0-9_]*$'),

  constraint roles_name_not_blank
    check (length(btrim(name)) between 1 and 160),

  constraint roles_key_unique_per_org
    unique (organization_id, key),

  constraint roles_tenant_identity_unique
    unique (id, organization_id)
);

comment on table public.roles is
  'Organization-scoped role definitions. Roles aggregate stable permissions.';

create index roles_org_active_idx
  on public.roles (organization_id, is_active);

create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Role permissions
-- ---------------------------------------------------------------------------

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  role_id uuid not null,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint role_permissions_role_tenant_fk
    foreign key (role_id, organization_id)
    references public.roles(id, organization_id)
    on delete cascade,

  constraint role_permissions_unique_assignment
    unique (organization_id, role_id, permission_id),

  constraint role_permissions_tenant_identity_unique
    unique (id, organization_id)
);

comment on table public.role_permissions is
  'Assigns stable permissions to organization-scoped roles.';

create index role_permissions_permission_idx
  on public.role_permissions (permission_id);

-- ---------------------------------------------------------------------------
-- 9. Membership roles
-- ---------------------------------------------------------------------------

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  created_at timestamptz not null default now(),

  constraint membership_roles_membership_tenant_fk
    foreign key (membership_id, organization_id)
    references public.memberships(id, organization_id)
    on delete cascade,

  constraint membership_roles_role_tenant_fk
    foreign key (role_id, organization_id)
    references public.roles(id, organization_id)
    on delete cascade,

  constraint membership_roles_unique_assignment
    unique (organization_id, membership_id, role_id),

  constraint membership_roles_tenant_identity_unique
    unique (id, organization_id)
);

comment on table public.membership_roles is
  'Assigns organization roles to organization memberships.';

create index membership_roles_role_idx
  on public.membership_roles (organization_id, role_id);

-- ---------------------------------------------------------------------------
-- 10. Feature flags
-- ---------------------------------------------------------------------------

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  key text not null,
  description text,
  is_enabled boolean not null default false,
  owner_membership_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint feature_flags_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint feature_flags_owner_tenant_fk
    foreign key (owner_membership_id, organization_id)
    references public.memberships(id, organization_id)
    on delete restrict,

  constraint feature_flags_key_format
    check (key ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$'),

  constraint feature_flags_key_unique_per_org
    unique (organization_id, key),

  constraint feature_flags_tenant_identity_unique
    unique (id, organization_id)
);

comment on table public.feature_flags is
  'Organization-scoped release controls with explicit ownership and optional expiry.';

create trigger feature_flags_set_updated_at
before update on public.feature_flags
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. Idempotency keys
-- ---------------------------------------------------------------------------

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  operation text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  status text not null default 'started',
  response_code integer,
  response_reference jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,

  constraint idempotency_keys_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint idempotency_keys_operation_not_blank
    check (length(btrim(operation)) between 1 and 160),

  constraint idempotency_keys_key_not_blank
    check (length(btrim(idempotency_key)) between 8 and 255),

  constraint idempotency_keys_fingerprint_format
    check (request_fingerprint ~ '^[a-f0-9]{64}$'),

  constraint idempotency_keys_status_allowed
    check (status in ('started', 'completed', 'failed', 'expired')),

  constraint idempotency_keys_unique_operation
    unique (organization_id, operation, idempotency_key),

  constraint idempotency_keys_tenant_identity_unique
    unique (id, organization_id)
);

comment on table public.idempotency_keys is
  'Prevents duplicate side effects and detects key reuse with different request content.';

create index idempotency_keys_expiry_idx
  on public.idempotency_keys (expires_at)
  where expires_at is not null;

-- ---------------------------------------------------------------------------
-- 12. Outbox events
-- ---------------------------------------------------------------------------

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_type text not null,
  event_version integer not null default 1,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  correlation_id uuid not null,
  causation_id uuid,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error_code text,

  constraint outbox_events_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint outbox_events_event_type_format
    check (event_type ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'),

  constraint outbox_events_version_positive
    check (event_version > 0),

  constraint outbox_events_payload_object
    check (jsonb_typeof(payload) = 'object'),

  constraint outbox_events_status_allowed
    check (status in ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),

  constraint outbox_events_attempts_nonnegative
    check (attempts >= 0),

  constraint outbox_events_tenant_identity_unique
    unique (id, organization_id)
);

comment on table public.outbox_events is
  'Transactional outbox for reliable, idempotent asynchronous work.';

create index outbox_events_pending_idx
  on public.outbox_events (available_at, created_at, id)
  where status in ('pending', 'failed');

create index outbox_events_aggregate_idx
  on public.outbox_events (organization_id, aggregate_type, aggregate_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 13. Audit events
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  actor_membership_id uuid,
  action text not null,
  target_type text not null,
  target_id uuid,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  correlation_id uuid not null,
  source_channel text not null,
  created_at timestamptz not null default now(),

  constraint audit_events_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint audit_events_actor_membership_tenant_fk
    foreign key (actor_membership_id, organization_id)
    references public.memberships(id, organization_id)
    on delete restrict,

  constraint audit_events_action_format
    check (action ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'),

  constraint audit_events_target_type_not_blank
    check (length(btrim(target_type)) between 1 and 120),

  constraint audit_events_source_allowed
    check (source_channel in ('web', 'worker', 'api', 'system', 'migration', 'support')),

  constraint audit_events_previous_state_object
    check (previous_state is null or jsonb_typeof(previous_state) = 'object'),

  constraint audit_events_new_state_object
    check (new_state is null or jsonb_typeof(new_state) = 'object'),

  constraint audit_events_tenant_identity_unique
    unique (id, organization_id)
);

comment on table public.audit_events is
  'Append-only privileged action history. Sensitive free text must not be copied into state payloads.';

create index audit_events_org_time_idx
  on public.audit_events (organization_id, created_at desc, id desc);

create index audit_events_target_idx
  on public.audit_events (organization_id, target_type, target_id, created_at desc);

create index audit_events_actor_idx
  on public.audit_events (organization_id, actor_membership_id, created_at desc)
  where actor_membership_id is not null;

-- ---------------------------------------------------------------------------
-- 14. Authorization helper functions
-- ---------------------------------------------------------------------------

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid();
$$;

create or replace function public.is_active_organization_member(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
  );
$$;

revoke all on function public.is_active_organization_member(uuid) from public;
grant execute on function public.is_active_organization_member(uuid) to authenticated;

create or replace function public.has_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr
      on mr.membership_id = m.id
     and mr.organization_id = m.organization_id
    join public.roles r
      on r.id = mr.role_id
     and r.organization_id = mr.organization_id
     and r.is_active = true
    join public.role_permissions rp
      on rp.role_id = r.id
     and rp.organization_id = r.organization_id
    join public.permissions p
      on p.id = rp.permission_id
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and p.key = p_permission_key
  );
$$;

revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 15. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;
alter table public.feature_flags enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_events enable row level security;

-- Organizations: active members may read their organizations.
create policy organizations_member_select
on public.organizations
for select
to authenticated
using (public.is_active_organization_member(id));

-- Profiles: a user may read their own profile.
create policy profiles_self_select
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- Memberships: active members may read memberships in their organization.
create policy memberships_member_select
on public.memberships
for select
to authenticated
using (public.is_active_organization_member(organization_id));

-- Permissions: authenticated users may read definitions.
create policy permissions_authenticated_select
on public.permissions
for select
to authenticated
using (true);

-- Roles and role mappings: active members may read organization authorization data.
create policy roles_member_select
on public.roles
for select
to authenticated
using (public.is_active_organization_member(organization_id));

create policy role_permissions_member_select
on public.role_permissions
for select
to authenticated
using (public.is_active_organization_member(organization_id));

create policy membership_roles_member_select
on public.membership_roles
for select
to authenticated
using (public.is_active_organization_member(organization_id));

-- Feature flags: active members may read current organization flags.
create policy feature_flags_member_select
on public.feature_flags
for select
to authenticated
using (public.is_active_organization_member(organization_id));

-- Audit: only members with audit.read permission may read.
create policy audit_events_authorized_select
on public.audit_events
for select
to authenticated
using (public.has_permission(organization_id, 'audit.read'));

-- No browser policies are created for idempotency keys or outbox events.
-- No browser INSERT/UPDATE/DELETE policies are created for governed tables.
-- Server-side use cases and controlled worker/database functions will own writes.

-- ---------------------------------------------------------------------------
-- 16. Privilege hardening
-- ---------------------------------------------------------------------------

revoke all on public.organizations from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.memberships from anon, authenticated;
revoke all on public.permissions from anon, authenticated;
revoke all on public.roles from anon, authenticated;
revoke all on public.role_permissions from anon, authenticated;
revoke all on public.membership_roles from anon, authenticated;
revoke all on public.feature_flags from anon, authenticated;
revoke all on public.idempotency_keys from anon, authenticated;
revoke all on public.outbox_events from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;

grant select on public.organizations to authenticated;
grant select on public.profiles to authenticated;
grant select on public.memberships to authenticated;
grant select on public.permissions to authenticated;
grant select on public.roles to authenticated;
grant select on public.role_permissions to authenticated;
grant select on public.membership_roles to authenticated;
grant select on public.feature_flags to authenticated;
grant select on public.audit_events to authenticated;

-- Intentionally no authenticated grants on idempotency_keys or outbox_events.
-- Intentionally no browser write grants on any M0 governed table.

-- ---------------------------------------------------------------------------
-- 17. Seed stable permission definitions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, name, description)
values
  ('organization.read', 'Read organization', 'View organization information.'),
  ('membership.read', 'Read memberships', 'View organization memberships.'),
  ('membership.manage', 'Manage memberships', 'Invite, suspend, or end organization memberships.'),
  ('role.read', 'Read roles', 'View roles and permission assignments.'),
  ('role.manage', 'Manage roles', 'Create and administer organization roles.'),
  ('feature_flag.read', 'Read feature flags', 'View organization release controls.'),
  ('feature_flag.manage', 'Manage feature flags', 'Create and administer release controls.'),
  ('audit.read', 'Read audit history', 'View organization audit evidence.'),
  ('content.create', 'Create content', 'Create Strongr content identities and briefs.'),
  ('content.submit', 'Submit content versions', 'Submit immutable content versions for review.'),
  ('review.scripture', 'Review Scripture', 'Record Scripture verification decisions.'),
  ('review.theology', 'Review theology', 'Record theological and pastoral decisions.'),
  ('review.editorial', 'Review editorial quality', 'Record editorial decisions.'),
  ('approval.grant', 'Grant final approval', 'Grant approval to an exact evidence snapshot.'),
  ('export.request', 'Request production export', 'Request an approved production package.'),
  ('publication.schedule', 'Schedule publication', 'Schedule approved public resources.'),
  ('publication.execute', 'Execute publication', 'Publish approved resources to authorized destinations.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 18. Postconditions
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing integer;
begin
  select count(*)
  into v_missing
  from (
    values
      ('organizations'),
      ('profiles'),
      ('memberships'),
      ('permissions'),
      ('roles'),
      ('role_permissions'),
      ('membership_roles'),
      ('feature_flags'),
      ('idempotency_keys'),
      ('outbox_events'),
      ('audit_events')
  ) expected(table_name)
  where to_regclass('public.' || expected.table_name) is null;

  if v_missing <> 0 then
    raise exception 'M0 kernel verification failed: one or more required tables are missing';
  end if;
end;
$$;

commit;
