import type { Uuid } from "../../../packages/contracts/src/index.ts";

import type { StudioEnvironment } from "./environment.ts";
import { StudioApiError, type StudioFetch } from "./supabase-http.ts";

type UnknownRecord = Readonly<Record<string, unknown>>;

export interface OperatorProfile {
  readonly id: Uuid;
  readonly displayName: string;
  readonly preferredName: string | null;
}

export interface OperatorOrganization {
  readonly id: Uuid;
  readonly membershipId: Uuid;
  readonly name: string;
  readonly slug: string;
}

export interface OperatorIdentity {
  readonly organizations: readonly OperatorOrganization[];
  readonly profile: OperatorProfile;
}

export const studioCapabilityKeys = [
  "content.create",
  "content.submit",
  "review.scripture",
  "review.theology",
  "review.editorial",
  "approval.grant",
  "approval.revoke",
  "export.request",
  "role.manage",
  "media.request",
  "media.review",
  "release.stage",
  "release.revoke",
] as const;

export type StudioCapabilityKey = (typeof studioCapabilityKeys)[number];
export type StudioCapabilities = Readonly<Record<StudioCapabilityKey, boolean>>;

function requireRecord(value: unknown, name: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${name} response`);
  }
  return value as UnknownRecord;
}

function requireString(record: UnknownRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid Studio identity field: ${key}`);
  }
  return value;
}

function requireNullableString(record: UnknownRecord, key: string): string | null {
  if (record[key] === null) {
    return null;
  }
  return requireString(record, key);
}

function requireUuid(record: UnknownRecord, key: string): Uuid {
  const value = requireString(record, key);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`Invalid Studio identity field: ${key}`);
  }
  return value;
}

function requireUserId(value: string): Uuid {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error("Invalid authenticated user identity");
  }
  return value;
}

async function readJson(response: Response): Promise<unknown> {
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const record =
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as UnknownRecord)
        : undefined;
    const code =
      typeof record?.code === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(record.code)
        ? record.code
        : "request_failed";
    throw new StudioApiError(response.status, code);
  }
  return value;
}

function requireRows(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${name} response`);
  }
  return value;
}

export class StudioIdentityGateway {
  readonly #accessToken: string;
  readonly #environment: StudioEnvironment;
  readonly #fetch: StudioFetch;

  constructor(input: {
    readonly accessToken: string;
    readonly environment: StudioEnvironment;
    readonly fetch?: StudioFetch;
  }) {
    if (input.accessToken.trim().length === 0) {
      throw new Error("Authenticated access token is required");
    }
    this.#accessToken = input.accessToken;
    this.#environment = input.environment;
    this.#fetch = input.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async discover(userIdInput: string): Promise<OperatorIdentity> {
    const userId = requireUserId(userIdInput);
    const [profilesValue, membershipsValue] = await Promise.all([
      this.#get(
        "profiles",
        new URLSearchParams({
          id: `eq.${userId}`,
          limit: "1",
          select: "id,display_name,preferred_name,status",
          status: "eq.active",
        }),
      ),
      this.#get(
        "memberships",
        new URLSearchParams({
          limit: "100",
          order: "joined_at.asc,id.asc",
          profile_id: `eq.${userId}`,
          select: "id,organization_id,profile_id,status",
          status: "eq.active",
        }),
      ),
    ]);

    const profileRows = requireRows(profilesValue, "profiles");
    const profileRow = requireRecord(profileRows[0], "profile");
    if (
      requireUuid(profileRow, "id") !== userId ||
      requireString(profileRow, "status") !== "active"
    ) {
      throw new Error("Authenticated operator profile is unavailable");
    }

    const memberships = requireRows(membershipsValue, "memberships").map((value) => {
      const row = requireRecord(value, "membership");
      if (requireUuid(row, "profile_id") !== userId || requireString(row, "status") !== "active") {
        throw new Error("Invalid active membership response");
      }
      return Object.freeze({
        id: requireUuid(row, "id"),
        organizationId: requireUuid(row, "organization_id"),
      });
    });

    const membershipByOrganization = new Map(
      memberships.map((membership) => [membership.organizationId, membership] as const),
    );
    const organizationIds = [...membershipByOrganization.keys()];
    const organizationRows =
      organizationIds.length === 0
        ? []
        : requireRows(
            await this.#get(
              "organizations",
              new URLSearchParams({
                id: `in.(${organizationIds.join(",")})`,
                limit: String(organizationIds.length),
                order: "name.asc,id.asc",
                select: "id,name,slug,status",
                status: "eq.active",
              }),
            ),
            "organizations",
          );

    const organizations = organizationRows.map((value): OperatorOrganization => {
      const row = requireRecord(value, "organization");
      const id = requireUuid(row, "id");
      const membership = membershipByOrganization.get(id);
      if (!membership || requireString(row, "status") !== "active") {
        throw new Error("Invalid active organization response");
      }
      return Object.freeze({
        id,
        membershipId: membership.id,
        name: requireString(row, "name"),
        slug: requireString(row, "slug"),
      });
    });

    return Object.freeze({
      organizations: Object.freeze(organizations),
      profile: Object.freeze({
        displayName: requireString(profileRow, "display_name"),
        id: userId,
        preferredName: requireNullableString(profileRow, "preferred_name"),
      }),
    });
  }

  async loadCapabilities(organizationId: Uuid): Promise<StudioCapabilities> {
    const results = await Promise.all(
      studioCapabilityKeys.map(async (permissionKey) => {
        const response = await this.#fetch(
          `${this.#environment.supabaseUrl}/rest/v1/rpc/has_permission`,
          {
            body: JSON.stringify({
              p_organization_id: organizationId,
              p_permission_key: permissionKey,
            }),
            headers: this.#headers(true),
            method: "POST",
          },
        );
        const value = await readJson(response);
        if (typeof value !== "boolean") {
          throw new Error("Invalid permission response");
        }
        return [permissionKey, value] as const;
      }),
    );
    return Object.freeze(Object.fromEntries(results)) as StudioCapabilities;
  }

  async #get(table: string, parameters: URLSearchParams): Promise<unknown> {
    const response = await this.#fetch(
      `${this.#environment.supabaseUrl}/rest/v1/${table}?${parameters.toString()}`,
      {
        headers: this.#headers(false),
        method: "GET",
      },
    );
    return readJson(response);
  }

  #headers(includeContentType: boolean): Readonly<Record<string, string>> {
    return Object.freeze({
      accept: "application/json",
      apikey: this.#environment.supabasePublishableKey,
      authorization: `Bearer ${this.#accessToken}`,
      ...(includeContentType ? { "content-type": "application/json" } : {}),
    });
  }
}

export function createStudioIdentityGateway(input: {
  readonly accessToken: string;
  readonly environment: StudioEnvironment;
  readonly fetch?: StudioFetch;
}): StudioIdentityGateway {
  return new StudioIdentityGateway(input);
}
