#!/usr/bin/env python3
"""Run destructive-but-self-cleaning M0.2 acceptance tests in strongr-os-dev.

This script creates two temporary Auth users and two temporary organizations,
uses real Supabase JWTs (including a verified TOTP factor), exercises the
governed M1 path and M0.2 outbox RPCs, then removes every fixture. It refuses
to run unless the operator names the isolated target exactly.
"""

from __future__ import annotations

import base64
import concurrent.futures
import hashlib
import hmac
import json
import os
import re
import secrets
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Any


class AcceptanceFailure(RuntimeError):
    pass


@dataclass
class HttpFailure(RuntimeError):
    status: int
    payload: Any

    def __str__(self) -> str:
        return f"HTTP {self.status}: {self.payload}"


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise AcceptanceFailure(f"{name} is required")
    return value


SUPABASE_URL = require_env("STRONGR_OS_SUPABASE_URL").rstrip("/")
ANON_KEY = require_env("STRONGR_OS_SUPABASE_ANON_KEY")
SERVICE_KEY = require_env("STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY")
DATABASE_URL = require_env("STRONGR_OS_DATABASE_URL")
TARGET = require_env("STRONGR_OS_REMOTE_ACCEPTANCE")
PROJECT_REF = require_env("STRONGR_OS_PROJECT_REF")

if TARGET != "strongr-os-dev":
    raise AcceptanceFailure(
        "STRONGR_OS_REMOTE_ACCEPTANCE must equal strongr-os-dev"
    )
if SUPABASE_URL == ANON_KEY or ANON_KEY == SERVICE_KEY:
    raise AcceptanceFailure("Supabase configuration values are invalid")
if not SUPABASE_URL.startswith("https://"):
    raise AcceptanceFailure("STRONGR_OS_SUPABASE_URL must use HTTPS")
if not re.fullmatch(r"[a-z0-9]{20}", PROJECT_REF):
    raise AcceptanceFailure(
        "STRONGR_OS_PROJECT_REF must be the 20-character strongr-os-dev ref"
    )
supabase_hostname = (urllib.parse.urlsplit(SUPABASE_URL).hostname or "").lower()
if supabase_hostname != f"{PROJECT_REF}.supabase.co":
    raise AcceptanceFailure(
        "STRONGR_OS_SUPABASE_URL does not match STRONGR_OS_PROJECT_REF"
    )
database_authority = DATABASE_URL.partition("://")[2].split("/", 1)[0]
database_userinfo, separator, database_hostport = database_authority.rpartition("@")
if not separator:
    raise AcceptanceFailure("STRONGR_OS_DATABASE_URL is not a PostgreSQL URL")
database_hostname = database_hostport.split(":", 1)[0].strip("[]").lower()
database_username = urllib.parse.unquote(database_userinfo.split(":", 1)[0])
database_matches_project = (
    database_hostname == f"db.{PROJECT_REF}.supabase.co"
    or database_username.endswith(f".{PROJECT_REF}")
)
if not database_matches_project:
    raise AcceptanceFailure(
        "STRONGR_OS_DATABASE_URL does not match STRONGR_OS_PROJECT_REF"
    )


results: list[dict[str, Any]] = []


def record(name: str, condition: bool, **evidence: Any) -> None:
    entry = {"test": name, "status": "pass" if condition else "fail", **evidence}
    results.append(entry)
    if not condition:
        raise AcceptanceFailure(f"{name} failed")


def http_json(
    method: str,
    path: str,
    *,
    api_key: str,
    bearer: str,
    body: Any | None = None,
    prefer: str | None = None,
) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {bearer}",
        "Accept": "application/json",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
            if not payload:
                return None
            return json.loads(payload.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload: Any = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"message": raw}
        raise HttpFailure(exc.code, payload) from exc


def admin_create_user(email: str, password: str) -> str:
    payload = http_json(
        "POST",
        "/auth/v1/admin/users",
        api_key=SERVICE_KEY,
        bearer=SERVICE_KEY,
        body={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"purpose": "strongr-os-m0-2-acceptance"},
        },
    )
    return str(payload["id"])


def admin_delete_user(user_id: str) -> None:
    try:
        http_json(
            "DELETE",
            f"/auth/v1/admin/users/{urllib.parse.quote(user_id)}",
            api_key=SERVICE_KEY,
            bearer=SERVICE_KEY,
        )
    except HttpFailure as exc:
        if exc.status != 404:
            raise


def sign_in(email: str, password: str) -> str:
    payload = http_json(
        "POST",
        "/auth/v1/token?grant_type=password",
        api_key=ANON_KEY,
        bearer=ANON_KEY,
        body={"email": email, "password": password},
    )
    return str(payload["access_token"])


def jwt_claims(token: str) -> dict[str, Any]:
    part = token.split(".")[1]
    part += "=" * (-len(part) % 4)
    return json.loads(base64.urlsafe_b64decode(part).decode("utf-8"))


def generate_totp(secret: str, timestamp: int | None = None) -> str:
    normalized = secret.replace(" ", "").upper()
    normalized += "=" * (-len(normalized) % 8)
    key = base64.b32decode(normalized)
    counter = int((timestamp or int(time.time())) // 30)
    digest = hmac.new(
        key,
        struct.pack(">Q", counter),
        hashlib.sha1,
    ).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF)
    return f"{code % 1_000_000:06d}"


def promote_to_aal2(token: str, friendly_name: str) -> str:
    enroll = http_json(
        "POST",
        "/auth/v1/factors",
        api_key=ANON_KEY,
        bearer=token,
        body={"factor_type": "totp", "friendly_name": friendly_name},
    )
    factor_id = str(enroll["id"])
    secret = str(enroll["totp"]["secret"])

    challenge = http_json(
        "POST",
        f"/auth/v1/factors/{urllib.parse.quote(factor_id)}/challenge",
        api_key=ANON_KEY,
        bearer=token,
        body={},
    )
    challenge_id = str(challenge["id"])

    remaining = 30 - (int(time.time()) % 30)
    if remaining <= 3:
        time.sleep(remaining + 1)

    verified = http_json(
        "POST",
        f"/auth/v1/factors/{urllib.parse.quote(factor_id)}/verify",
        api_key=ANON_KEY,
        bearer=token,
        body={
            "challenge_id": challenge_id,
            "code": generate_totp(secret),
        },
    )
    return str(verified["access_token"])


def rpc(
    function_name: str,
    body: dict[str, Any],
    *,
    token: str,
    service: bool = False,
) -> Any:
    key = SERVICE_KEY if service else ANON_KEY
    return http_json(
        "POST",
        f"/rest/v1/rpc/{function_name}",
        api_key=key,
        bearer=token,
        body=body,
    )


def rest_get(
    table: str,
    query: str,
    *,
    token: str,
    service: bool = False,
) -> Any:
    key = SERVICE_KEY if service else ANON_KEY
    return http_json(
        "GET",
        f"/rest/v1/{table}?{query}",
        api_key=key,
        bearer=token,
    )


def rest_patch(
    table: str,
    query: str,
    body: dict[str, Any],
    *,
    token: str,
    service: bool = False,
) -> Any:
    key = SERVICE_KEY if service else ANON_KEY
    return http_json(
        "PATCH",
        f"/rest/v1/{table}?{query}",
        api_key=key,
        bearer=token,
        body=body,
        prefer="return=representation",
    )


def psql(sql: str) -> str:
    completed = subprocess.run(
        [
            "psql",
            DATABASE_URL,
            "-X",
            "-q",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
        ],
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise AcceptanceFailure(
            f"Database command failed: {completed.stderr.strip()[:1000]}"
        )
    return completed.stdout.strip()


def returned_uuid(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, list) and len(payload) == 1:
        item = payload[0]
        if isinstance(item, str):
            return item
        if isinstance(item, dict) and len(item) == 1:
            return str(next(iter(item.values())))
    if isinstance(payload, dict) and len(payload) == 1:
        return str(next(iter(payload.values())))
    raise AcceptanceFailure(f"RPC did not return one UUID: {payload}")


run_id = uuid.uuid4().hex
worker_prefix = f"m02-{run_id}"
org_one = str(uuid.uuid4())
org_two = str(uuid.uuid4())
membership_one = str(uuid.uuid4())
membership_two = str(uuid.uuid4())
role_one = str(uuid.uuid4())
role_two = str(uuid.uuid4())
user_ids: list[str] = []


def seed_sql(user_one: str, user_two: str) -> str:
    return f"""
begin;
insert into public.organizations (id, name, slug)
values
  ('{org_one}', 'M0.2 remote tenant one', 'm02-remote-{run_id}-one'),
  ('{org_two}', 'M0.2 remote tenant two', 'm02-remote-{run_id}-two');

insert into public.profiles (id, display_name)
values
  ('{user_one}', 'M0.2 remote owner one'),
  ('{user_two}', 'M0.2 remote owner two');

insert into public.memberships (id, organization_id, profile_id)
values
  ('{membership_one}', '{org_one}', '{user_one}'),
  ('{membership_two}', '{org_two}', '{user_two}');

insert into public.roles (id, organization_id, key, name)
values
  ('{role_one}', '{org_one}', 'owner', 'Owner'),
  ('{role_two}', '{org_two}', 'owner', 'Owner');

insert into public.membership_role_grants (
  organization_id, membership_id, role_id, granted_by_membership_id
)
values
  ('{org_one}', '{membership_one}', '{role_one}', '{membership_one}'),
  ('{org_two}', '{membership_two}', '{role_two}', '{membership_two}');

insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select seed.organization_id, seed.role_id, p.id, seed.membership_id
from (
  values
    ('{org_one}'::uuid, '{role_one}'::uuid, '{membership_one}'::uuid),
    ('{org_two}'::uuid, '{role_two}'::uuid, '{membership_two}'::uuid)
) seed(organization_id, role_id, membership_id)
cross join public.permissions p;
commit;
"""


def cleanup_sql() -> str:
    users = ",".join(f"'{user_id}'::uuid" for user_id in user_ids) or "null::uuid"
    return f"""
select set_config('m0_2.org_ids', '{org_one},{org_two}', false);
set session_replication_role = replica;
do $cleanup$
declare
  v_table record;
  v_org uuid;
begin
  foreach v_org in array string_to_array(
    current_setting('m0_2.org_ids'), ','
  )::uuid[]
  loop
    for v_table in
      select distinct c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
      where c.table_schema = 'public'
        and c.column_name = 'organization_id'
        and t.table_type = 'BASE TABLE'
      order by c.table_name
    loop
      execute format(
        'delete from public.%I where organization_id = $1',
        v_table.table_name
      ) using v_org;
    end loop;
    delete from public.organizations where id = v_org;
  end loop;
end;
$cleanup$;
delete from public.worker_heartbeats
where worker_id like '{worker_prefix}%';
delete from public.profiles where id in ({users});
set session_replication_role = origin;
"""


try:
    if subprocess.run(
        ["psql", "--version"], capture_output=True, check=False
    ).returncode != 0:
        raise AcceptanceFailure("psql is required")

    ready_count = int(
        psql(
            """
            select count(*)
            from public.outbox_events
            where (
              status in ('pending', 'failed')
              and available_at <= statement_timestamp()
            ) or (
              status = 'processing'
              and lease_expires_at <= statement_timestamp()
            );
            """
        )
        or "0"
    )
    record(
        "remote_preflight_isolated_outbox",
        ready_count == 0,
        ready_events=ready_count,
    )

    password_one = secrets.token_urlsafe(24) + "aA1!"
    password_two = secrets.token_urlsafe(24) + "aA1!"
    email_one = f"m02-{run_id}-one@example.invalid"
    email_two = f"m02-{run_id}-two@example.invalid"
    user_one = admin_create_user(email_one, password_one)
    user_ids.append(user_one)
    user_two = admin_create_user(email_two, password_two)
    user_ids.append(user_two)
    psql(seed_sql(user_one, user_two))

    token_one_aal1 = sign_in(email_one, password_one)
    token_two_aal1 = sign_in(email_two, password_two)
    record(
        "real_auth_sessions_are_aal1",
        jwt_claims(token_one_aal1).get("aal") == "aal1"
        and jwt_claims(token_two_aal1).get("aal") == "aal1",
    )

    one_orgs = rest_get(
        "organizations", "select=id&order=id", token=token_one_aal1
    )
    two_orgs = rest_get(
        "organizations", "select=id&order=id", token=token_two_aal1
    )
    record(
        "two_user_tenant_isolation",
        [row["id"] for row in one_orgs] == [org_one]
        and [row["id"] for row in two_orgs] == [org_two],
        user_one_visible_organizations=len(one_orgs),
        user_two_visible_organizations=len(two_orgs),
    )
    record(
        "same_tenant_positive_access",
        len(one_orgs) == 1
        and one_orgs[0]["id"] == org_one
        and len(two_orgs) == 1
        and two_orgs[0]["id"] == org_two,
    )

    try:
        rpc(
            "m1_create_audio_brief",
            {
                "p_organization_id": org_two,
                "p_title": "cross tenant",
                "p_payload": {"purpose": "must fail"},
                "p_correlation_id": str(uuid.uuid4()),
            },
            token=token_one_aal1,
        )
    except HttpFailure as exc:
        record(
            "cross_tenant_command_denied",
            isinstance(exc.payload, dict)
            and exc.payload.get("code") == "42501",
            http_status=exc.status,
        )
    else:
        record("cross_tenant_command_denied", False)

    psql(
        f"""
        update public.memberships
        set status = 'suspended'
        where id = '{membership_two}'
          and organization_id = '{org_two}';
        """
    )
    suspended_orgs = rest_get(
        "organizations", "select=id&order=id", token=token_two_aal1
    )
    try:
        rpc(
            "m1_create_audio_brief",
            {
                "p_organization_id": org_two,
                "p_title": "suspended membership must fail",
                "p_payload": {"purpose": "must fail"},
                "p_correlation_id": str(uuid.uuid4()),
            },
            token=token_two_aal1,
        )
    except HttpFailure as exc:
        suspended_command_denied = (
            isinstance(exc.payload, dict)
            and exc.payload.get("code") == "42501"
        )
    else:
        suspended_command_denied = False
    record(
        "inactive_membership_denied",
        suspended_orgs == [] and suspended_command_denied,
        visible_organizations=len(suspended_orgs),
    )
    psql(
        f"""
        update public.memberships
        set status = 'active'
        where id = '{membership_two}'
          and organization_id = '{org_two}';
        """
    )

    psql(
        f"""
        insert into public.membership_role_revocations (
          organization_id, grant_id, revoked_by_membership_id, reason_code
        )
        select
          organization_id, id, '{membership_two}', 'acceptance_revoked'
        from public.membership_role_grants
        where organization_id = '{org_two}'
          and membership_id = '{membership_two}';
        """
    )
    revoked_role_orgs = rest_get(
        "organizations", "select=id&order=id", token=token_two_aal1
    )
    try:
        rpc(
            "m1_create_audio_brief",
            {
                "p_organization_id": org_two,
                "p_title": "revoked role must fail",
                "p_payload": {"purpose": "must fail"},
                "p_correlation_id": str(uuid.uuid4()),
            },
            token=token_two_aal1,
        )
    except HttpFailure as exc:
        revoked_role_command_denied = (
            isinstance(exc.payload, dict)
            and exc.payload.get("code") == "42501"
        )
    else:
        revoked_role_command_denied = False
    record(
        "revoked_role_denied",
        [row["id"] for row in revoked_role_orgs] == [org_two]
        and revoked_role_command_denied,
        membership_read_preserved=len(revoked_role_orgs) == 1,
    )

    policy_body = {
        "p_organization_id": org_one,
        "p_key": f"m02_remote_{run_id}",
        "p_version": 1,
        "p_correlation_id": str(uuid.uuid4()),
    }
    try:
        rpc(
            "m1_create_review_policy",
            policy_body,
            token=token_one_aal1,
        )
    except HttpFailure as exc:
        record(
            "real_aal1_privileged_command_denied",
            isinstance(exc.payload, dict)
            and exc.payload.get("code") == "42501"
            and "aal2" in str(exc.payload.get("message", "")).lower(),
            http_status=exc.status,
        )
    else:
        record("real_aal1_privileged_command_denied", False)

    token_one_aal2 = promote_to_aal2(
        token_one_aal1, f"Strongr OS M0.2 {run_id}"
    )
    record(
        "real_mfa_session_is_aal2",
        jwt_claims(token_one_aal2).get("aal") == "aal2",
    )

    policy_id = returned_uuid(
        rpc(
            "m1_create_review_policy",
            policy_body,
            token=token_one_aal2,
        )
    )
    record("real_aal2_privileged_command_succeeds", bool(policy_id))

    stale_policy_body = {
        "p_organization_id": org_one,
        "p_key": f"m02_stale_{run_id}",
        "p_version": 1,
        "p_correlation_id": str(uuid.uuid4()),
    }
    try:
        rpc(
            "m1_create_review_policy",
            stale_policy_body,
            token=token_one_aal1,
        )
    except HttpFailure as exc:
        record(
            "stale_or_downgraded_session_denied",
            isinstance(exc.payload, dict)
            and exc.payload.get("code") == "42501"
            and "aal2" in str(exc.payload.get("message", "")).lower(),
            http_status=exc.status,
        )
    else:
        record("stale_or_downgraded_session_denied", False)

    brief_response = rpc(
        "m1_create_audio_brief",
        {
            "p_organization_id": org_one,
            "p_title": f"M0.2 remote governed path {run_id}",
            "p_payload": {
                "purpose": "remote acceptance",
                "scripture": "Psalm 46:10",
            },
            "p_correlation_id": str(uuid.uuid4()),
        },
        token=token_one_aal2,
    )
    brief_row = brief_response[0]
    content_item_id = str(brief_row["content_item_id"])
    brief_id = str(brief_row["brief_id"])

    version_id = returned_uuid(
        rpc(
            "m1_create_manual_version",
            {
                "p_organization_id": org_one,
                "p_content_item_id": content_item_id,
                "p_brief_id": brief_id,
                "p_payload": {
                    "title": "Be Still",
                    "script": "Be still, and know that I am God.",
                },
                "p_supersedes_version_id": None,
                "p_correlation_id": str(uuid.uuid4()),
            },
            token=token_one_aal2,
        )
    )
    rpc(
        "m1_submit_version",
        {
            "p_organization_id": org_one,
            "p_content_version_id": version_id,
            "p_correlation_id": str(uuid.uuid4()),
        },
        token=token_one_aal2,
    )
    scripture_id = returned_uuid(
        rpc(
            "m1_record_scripture_evidence",
            {
                "p_organization_id": org_one,
                "p_content_version_id": version_id,
                "p_reference": "Psalm 46:10",
                "p_translation": "KJV",
                "p_source_citation": "Authorized KJV source",
                "p_verification_status": "verified",
                "p_correlation_id": str(uuid.uuid4()),
            },
            token=token_one_aal2,
        )
    )
    rights_id = returned_uuid(
        rpc(
            "m1_record_rights_snapshot",
            {
                "p_organization_id": org_one,
                "p_content_version_id": version_id,
                "p_status": "cleared",
                "p_source_summary": "KJV source reviewed for remote acceptance",
                "p_correlation_id": str(uuid.uuid4()),
            },
            token=token_one_aal2,
        )
    )

    definitions = rest_get(
        "check_definitions",
        "select=id,key,version&order=key.asc,version.asc",
        token=SERVICE_KEY,
        service=True,
    )
    check_results = [
        {
            "check_definition_id": row["id"],
            "outcome": "pass",
            "detail_code": "m0_2.remote_pass",
            "evidence": {"source": "remote_acceptance"},
        }
        for row in definitions
    ]
    check_run_id = returned_uuid(
        rpc(
            "m1_record_check_run",
            {
                "p_organization_id": org_one,
                "p_content_version_id": version_id,
                "p_engine_key": "m0_2_remote",
                "p_engine_version": "1.0.0",
                "p_status": "completed",
                "p_results": check_results,
                "p_correlation_id": str(uuid.uuid4()),
            },
            token=SERVICE_KEY,
            service=True,
        )
    )

    try:
        rpc(
            "m1_record_check_run",
            {
                "p_organization_id": org_one,
                "p_content_version_id": version_id,
                "p_engine_key": "browser_must_fail",
                "p_engine_version": "1.0.0",
                "p_status": "completed",
                "p_results": check_results,
                "p_correlation_id": str(uuid.uuid4()),
            },
            token=token_one_aal2,
        )
    except HttpFailure as exc:
        record(
            "remote_check_worker_role_boundary",
            exc.status in {401, 403, 404},
            http_status=exc.status,
        )
    else:
        record("remote_check_worker_role_boundary", False)

    review_ids: dict[str, str] = {}
    for lane in ("scripture", "theology", "editorial"):
        review_ids[lane] = returned_uuid(
            rpc(
                "m1_record_review",
                {
                    "p_organization_id": org_one,
                    "p_content_version_id": version_id,
                    "p_lane": lane,
                    "p_decision": "approved",
                    "p_reason_code": "m0_2_remote",
                    "p_evidence": {
                        "source": "remote_acceptance",
                        "lane": lane,
                    },
                    "p_correlation_id": str(uuid.uuid4()),
                },
                token=token_one_aal2,
            )
        )

    approval_id = returned_uuid(
        rpc(
            "m1_approve_version",
            {
                "p_organization_id": org_one,
                "p_content_version_id": version_id,
                "p_review_policy_id": policy_id,
                "p_check_run_id": check_run_id,
                "p_scripture_evidence_id": scripture_id,
                "p_rights_snapshot_id": rights_id,
                "p_scripture_review_id": review_ids["scripture"],
                "p_theology_review_id": review_ids["theology"],
                "p_editorial_review_id": review_ids["editorial"],
                "p_reason_code": "m0_2_remote",
                "p_correlation_id": str(uuid.uuid4()),
            },
            token=token_one_aal2,
        )
    )
    package_id = returned_uuid(
        rpc(
            "m1_create_production_package",
            {
                "p_organization_id": org_one,
                "p_approval_snapshot_id": approval_id,
                "p_correlation_id": str(uuid.uuid4()),
            },
            token=token_one_aal2,
        )
    )
    record(
        "governed_command_end_to_end",
        all(
            (
                content_item_id,
                brief_id,
                version_id,
                scripture_id,
                rights_id,
                check_run_id,
                approval_id,
                package_id,
            )
        )
        and len(review_ids) == 3
        and len(check_results) == 8,
        human_reviews=len(review_ids),
        automated_checks=len(check_results),
    )

    approval_rows = rest_get(
        "approval_snapshots",
        "select=id,authentication_assurance,version_payload_hash,"
        "evidence_bundle_hash"
        f"&id=eq.{urllib.parse.quote(approval_id)}",
        token=SERVICE_KEY,
        service=True,
    )
    package_rows = rest_get(
        "production_packages",
        "select=id,manifest_hash,manifest"
        f"&id=eq.{urllib.parse.quote(package_id)}",
        token=SERVICE_KEY,
        service=True,
    )
    version_rows = rest_get(
        "content_versions",
        "select=id,payload_hash"
        f"&id=eq.{urllib.parse.quote(version_id)}",
        token=SERVICE_KEY,
        service=True,
    )
    approval_evidence = approval_rows[0]
    package_evidence = package_rows[0]
    version_evidence = version_rows[0]
    record(
        "approval_assurance_and_hash_evidence",
        approval_evidence["authentication_assurance"] == "aal2"
        and len(approval_evidence["version_payload_hash"]) == 64
        and len(approval_evidence["evidence_bundle_hash"]) == 64
        and approval_evidence["version_payload_hash"]
        == version_evidence["payload_hash"]
        and package_evidence["manifest"]["evidence_bundle_hash"]
        == approval_evidence["evidence_bundle_hash"]
        and package_evidence["manifest"]["content_payload_hash"]
        == version_evidence["payload_hash"]
        and len(package_evidence["manifest_hash"]) == 64,
        authentication_assurance=approval_evidence[
            "authentication_assurance"
        ],
        version_payload_hash=approval_evidence["version_payload_hash"],
        evidence_bundle_hash=approval_evidence["evidence_bundle_hash"],
        production_manifest_hash=package_evidence["manifest_hash"],
    )

    immutable_results: list[bool] = []
    for table_name, row_id, mutation in (
        (
            "approval_snapshots",
            approval_id,
            {"reason_code": "tamper_attempt"},
        ),
        (
            "production_packages",
            package_id,
            {"manifest_hash": "0" * 64},
        ),
    ):
        try:
            rest_patch(
                table_name,
                f"id=eq.{urllib.parse.quote(row_id)}",
                mutation,
                token=SERVICE_KEY,
                service=True,
            )
        except HttpFailure as exc:
            immutable_results.append(
                isinstance(exc.payload, dict)
                and exc.payload.get("code") == "55000"
            )
        else:
            immutable_results.append(False)
    record(
        "remote_approval_and_package_immutability",
        immutable_results == [True, True],
        guarded_records=len(immutable_results),
    )

    idempotency_key = f"m0-2-remote-{run_id}"

    def request_generation(_: int) -> str:
        return returned_uuid(
            rpc(
                "m1_request_generation",
                {
                    "p_organization_id": org_one,
                    "p_brief_id": brief_id,
                    "p_prompt_key": "m0_2.remote",
                    "p_prompt_version": 1,
                    "p_idempotency_key": idempotency_key,
                    "p_correlation_id": str(uuid.uuid4()),
                },
                token=token_one_aal2,
            )
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        job_ids = list(executor.map(request_generation, range(8)))
    generation_job_id = job_ids[0]
    outbox_rows = rest_get(
        "outbox_events",
        "select=id,aggregate_id,status,attempts"
        f"&aggregate_id=eq.{urllib.parse.quote(generation_job_id)}",
        token=SERVICE_KEY,
        service=True,
    )
    record(
        "remote_concurrent_idempotency",
        len(set(job_ids)) == 1 and len(outbox_rows) == 1,
        parallel_requests=8,
        unique_job_ids=len(set(job_ids)),
        outbox_events=len(outbox_rows),
    )
    try:
        returned_uuid(
            rpc(
                "m1_request_generation",
                {
                    "p_organization_id": org_one,
                    "p_brief_id": brief_id,
                    "p_prompt_key": "m0_2.remote",
                    "p_prompt_version": 2,
                    "p_idempotency_key": idempotency_key,
                    "p_correlation_id": str(uuid.uuid4()),
                },
                token=token_one_aal2,
            )
        )
    except HttpFailure as exc:
        record(
            "remote_changed_request_idempotency_denied",
            isinstance(exc.payload, dict)
            and exc.payload.get("code") == "22023",
            http_status=exc.status,
        )
    else:
        record("remote_changed_request_idempotency_denied", False)

    outbox_event_id = str(outbox_rows[0]["id"])
    first_claim = rpc(
        "m0_claim_outbox_events",
        {
            "p_worker_id": f"{worker_prefix}-retry",
            "p_batch_size": 1,
            "p_lease_seconds": 60,
        },
        token=SERVICE_KEY,
        service=True,
    )[0]
    record(
        "outbox_initial_lease",
        first_claim["event_id"] == outbox_event_id
        and first_claim["attempt_number"] == 1,
    )
    failed_status = rpc(
        "m0_fail_outbox_event",
        {
            "p_event_id": outbox_event_id,
            "p_worker_id": f"{worker_prefix}-retry",
            "p_lease_token": first_claim["lease_token"],
            "p_error_code": "m0_2.transient",
            "p_retry_after_seconds": 0,
            "p_max_attempts": 5,
        },
        token=SERVICE_KEY,
        service=True,
    )
    record("outbox_retry_transition", failed_status == "failed")

    crash_claim = rpc(
        "m0_claim_outbox_events",
        {
            "p_worker_id": f"{worker_prefix}-crash",
            "p_batch_size": 1,
            "p_lease_seconds": 1,
        },
        token=SERVICE_KEY,
        service=True,
    )[0]
    time.sleep(1.25)
    recovery_claim = rpc(
        "m0_claim_outbox_events",
        {
            "p_worker_id": f"{worker_prefix}-recovery",
            "p_batch_size": 1,
            "p_lease_seconds": 60,
        },
        token=SERVICE_KEY,
        service=True,
    )[0]
    record(
        "outbox_crash_recovery",
        crash_claim["event_id"] == recovery_claim["event_id"]
        and recovery_claim["attempt_number"] == 3
        and crash_claim["lease_token"] != recovery_claim["lease_token"],
    )

    delivery_key = f"delivery-{outbox_event_id}"
    receipt_one = returned_uuid(
        rpc(
            "m0_ack_outbox_event",
            {
                "p_event_id": outbox_event_id,
                "p_worker_id": f"{worker_prefix}-recovery",
                "p_lease_token": recovery_claim["lease_token"],
                "p_delivery_key": delivery_key,
            },
            token=SERVICE_KEY,
            service=True,
        )
    )
    receipt_two = returned_uuid(
        rpc(
            "m0_ack_outbox_event",
            {
                "p_event_id": outbox_event_id,
                "p_worker_id": f"{worker_prefix}-recovery",
                "p_lease_token": recovery_claim["lease_token"],
                "p_delivery_key": delivery_key,
            },
            token=SERVICE_KEY,
            service=True,
        )
    )
    receipt_rows = rest_get(
        "outbox_delivery_receipts",
        f"select=id&outbox_event_id=eq.{urllib.parse.quote(outbox_event_id)}",
        token=SERVICE_KEY,
        service=True,
    )
    record(
        "outbox_duplicate_delivery_receipt",
        receipt_one == receipt_two and len(receipt_rows) == 1,
        durable_receipts=len(receipt_rows),
    )

    health = rpc(
        "m0_operational_health",
        {},
        token=SERVICE_KEY,
        service=True,
    )
    record(
        "remote_operational_health",
        health.get("status") == "ok"
        and int(health.get("outbox_expired_leases", -1)) == 0
        and int(health.get("outbox_dead_letters", -1)) == 0,
        health_status=health.get("status"),
    )

    psql(
        f"""
        insert into public.outbox_events (
          organization_id, event_type, aggregate_type, aggregate_id,
          payload, correlation_id
        )
        select
          '{org_one}',
          'acceptance.remote_concurrent.v1',
          'acceptance',
          gen_random_uuid(),
          jsonb_build_object('request_number', request_number),
          gen_random_uuid()
        from generate_series(1, 8) request_number;
        """
    )

    def claim_concurrent_outbox(worker_number: int) -> dict[str, Any]:
        claimed = rpc(
            "m0_claim_outbox_events",
            {
                "p_worker_id": (
                    f"{worker_prefix}-concurrent-{worker_number}"
                ),
                "p_batch_size": 1,
                "p_lease_seconds": 60,
            },
            token=SERVICE_KEY,
            service=True,
        )
        if len(claimed) != 1:
            raise AcceptanceFailure(
                f"concurrent worker {worker_number} claimed {len(claimed)} rows"
            )
        return {
            **claimed[0],
            "worker_id": f"{worker_prefix}-concurrent-{worker_number}",
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        concurrent_claims = list(
            executor.map(claim_concurrent_outbox, range(1, 9))
        )
    concurrent_event_ids = {
        str(claim["event_id"]) for claim in concurrent_claims
    }
    concurrent_lease_tokens = {
        str(claim["lease_token"]) for claim in concurrent_claims
    }
    record(
        "remote_concurrent_outbox_leasing",
        len(concurrent_claims) == 8
        and len(concurrent_event_ids) == 8
        and len(concurrent_lease_tokens) == 8
        and all(
            int(claim["attempt_number"]) == 1
            for claim in concurrent_claims
        ),
        parallel_workers=8,
        unique_events=len(concurrent_event_ids),
        unique_lease_tokens=len(concurrent_lease_tokens),
    )
    for claim in concurrent_claims:
        returned_uuid(
            rpc(
                "m0_ack_outbox_event",
                {
                    "p_event_id": claim["event_id"],
                    "p_worker_id": claim["worker_id"],
                    "p_lease_token": claim["lease_token"],
                    "p_delivery_key": f"delivery-{claim['event_id']}",
                },
                token=SERVICE_KEY,
                service=True,
            )
        )

    poison_event_id = str(uuid.uuid4())
    psql(
        f"""
        insert into public.outbox_events (
          id, organization_id, event_type, aggregate_type, aggregate_id,
          payload, correlation_id, attempts
        ) values (
          '{poison_event_id}',
          '{org_one}',
          'acceptance.poison_message.v1',
          'acceptance',
          gen_random_uuid(),
          '{{"case":"poison"}}',
          gen_random_uuid(),
          4
        );
        """
    )
    poison_claim = rpc(
        "m0_claim_outbox_events",
        {
            "p_worker_id": f"{worker_prefix}-poison",
            "p_batch_size": 1,
            "p_lease_seconds": 60,
        },
        token=SERVICE_KEY,
        service=True,
    )[0]
    poison_status = rpc(
        "m0_fail_outbox_event",
        {
            "p_event_id": poison_event_id,
            "p_worker_id": f"{worker_prefix}-poison",
            "p_lease_token": poison_claim["lease_token"],
            "p_error_code": "m0_2.poison",
            "p_retry_after_seconds": 0,
            "p_max_attempts": 5,
        },
        token=SERVICE_KEY,
        service=True,
    )
    poison_health = rpc(
        "m0_operational_health",
        {},
        token=SERVICE_KEY,
        service=True,
    )
    poison_metrics = rpc(
        "m0_operational_metrics",
        {},
        token=SERVICE_KEY,
        service=True,
    )
    metric_values = {
        row["metric_name"]: float(row["metric_value"])
        for row in poison_metrics
    }
    record(
        "poison_message_dead_letter_and_operator_visibility",
        poison_claim["event_id"] == poison_event_id
        and int(poison_claim["attempt_number"]) == 5
        and poison_status == "dead_letter"
        and poison_health.get("status") == "unhealthy"
        and int(poison_health.get("outbox_dead_letters", 0)) >= 1
        and metric_values.get("strongr_os_outbox_dead_letters", 0) >= 1,
        attempt_number=poison_claim["attempt_number"],
        terminal_status=poison_status,
        health_status=poison_health.get("status"),
        dead_letter_metric=metric_values.get(
            "strongr_os_outbox_dead_letters"
        ),
    )

except Exception as exc:
    if not results or results[-1].get("status") != "fail":
        results.append(
            {
                "test": "remote_acceptance_execution",
                "status": "fail",
                "error_type": type(exc).__name__,
                "error": str(exc)[:1000],
            }
        )
finally:
    try:
        if user_ids:
            psql(cleanup_sql())
    except Exception as exc:  # Cleanup evidence must be visible without secrets.
        results.append(
            {
                "test": "remote_fixture_database_cleanup",
                "status": "fail",
                "error": str(exc)[:500],
            }
        )
    for user_id in reversed(user_ids):
        try:
            admin_delete_user(user_id)
        except Exception as exc:
            results.append(
                {
                    "test": "remote_fixture_auth_cleanup",
                    "status": "fail",
                    "user_id": user_id,
                    "error": str(exc)[:500],
                }
            )

for result in results:
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))

failures = [result for result in results if result["status"] != "pass"]
summary = {
    "test": "strongr_os_m0_2_remote_acceptance",
    "status": "pass" if not failures else "fail",
    "passed": len(results) - len(failures),
    "failed": len(failures),
    "target": TARGET,
}
print(json.dumps(summary, separators=(",", ":"), sort_keys=True))
raise SystemExit(0 if not failures else 1)
