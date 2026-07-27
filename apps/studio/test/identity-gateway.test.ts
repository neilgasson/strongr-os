import assert from "node:assert/strict";
import test from "node:test";

import { createStudioIdentityGateway, studioCapabilityKeys } from "../src/identity-gateway.ts";
import type { StudioEnvironment } from "../src/environment.ts";

const userId = "00000000-0000-4000-8000-000000000001";
const membershipId = "00000000-0000-4000-8000-000000000002";
const organizationId = "00000000-0000-4000-8000-000000000003";
const environment: StudioEnvironment = Object.freeze({
  supabasePublishableKey: "sb_publishable_fixture_123456",
  supabaseUrl: "https://example.supabase.co",
});

test("identity discovery filters the authenticated profile and active memberships before organizations", async () => {
  const requests: { readonly input: string; readonly init?: RequestInit }[] = [];
  const gateway = createStudioIdentityGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch(input, init) {
      const url = new URL(String(input));
      requests.push({ input: String(input), ...(init ? { init } : {}) });
      if (url.pathname.endsWith("/profiles")) {
        return Promise.resolve(
          Response.json([
            {
              display_name: "Fixture Operator",
              id: userId,
              preferred_name: "Fixture",
              status: "active",
            },
          ]),
        );
      }
      if (url.pathname.endsWith("/memberships")) {
        return Promise.resolve(
          Response.json([
            {
              id: membershipId,
              organization_id: organizationId,
              profile_id: userId,
              status: "active",
            },
          ]),
        );
      }
      return Promise.resolve(
        Response.json([
          {
            id: organizationId,
            name: "Synthetic Society",
            slug: "synthetic-society",
            status: "active",
          },
        ]),
      );
    },
  });

  assert.deepEqual(await gateway.discover(userId), {
    organizations: [
      {
        id: organizationId,
        membershipId,
        name: "Synthetic Society",
        slug: "synthetic-society",
      },
    ],
    profile: {
      displayName: "Fixture Operator",
      id: userId,
      preferredName: "Fixture",
    },
  });

  const profileUrl = new URL(requests[0]?.input ?? "");
  const membershipUrl = new URL(requests[1]?.input ?? "");
  const organizationUrl = new URL(requests[2]?.input ?? "");
  assert.equal(profileUrl.searchParams.get("id"), `eq.${userId}`);
  assert.equal(profileUrl.searchParams.get("status"), "eq.active");
  assert.equal(membershipUrl.searchParams.get("profile_id"), `eq.${userId}`);
  assert.equal(membershipUrl.searchParams.get("status"), "eq.active");
  assert.equal(organizationUrl.searchParams.get("id"), `in.(${organizationId})`);
  assert.equal(organizationUrl.searchParams.get("status"), "eq.active");
  for (const request of requests) {
    const headers = request.init?.headers as Readonly<Record<string, string>>;
    assert.equal(headers.apikey, environment.supabasePublishableKey);
    assert.equal(headers.authorization, "Bearer authenticated-user-jwt");
    assert.equal(request.init?.method, "GET");
  }
});

test("identity discovery rejects an organization not linked to the current active memberships", async () => {
  const otherOrganizationId = "00000000-0000-4000-8000-000000000099";
  const gateway = createStudioIdentityGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch(input) {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/profiles")) {
        return Promise.resolve(
          Response.json([
            {
              display_name: "Fixture Operator",
              id: userId,
              preferred_name: null,
              status: "active",
            },
          ]),
        );
      }
      if (url.pathname.endsWith("/memberships")) {
        return Promise.resolve(
          Response.json([
            {
              id: membershipId,
              organization_id: organizationId,
              profile_id: userId,
              status: "active",
            },
          ]),
        );
      }
      return Promise.resolve(
        Response.json([
          {
            id: otherOrganizationId,
            name: "Other Tenant",
            slug: "other-tenant",
            status: "active",
          },
        ]),
      );
    },
  });

  await assert.rejects(() => gateway.discover(userId), /Invalid active organization response/);
});

test("permission guidance calls only the existing server-side permission function", async () => {
  const bodies: unknown[] = [];
  const gateway = createStudioIdentityGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch(input, init) {
      assert.equal(String(input), "https://example.supabase.co/rest/v1/rpc/has_permission");
      assert.equal(init?.method, "POST");
      bodies.push(JSON.parse(String(init?.body)));
      return Promise.resolve(Response.json(bodies.length % 2 === 1));
    },
  });

  const capabilities = await gateway.loadCapabilities(organizationId);
  assert.equal(Object.keys(capabilities).length, studioCapabilityKeys.length);
  assert.deepEqual(
    bodies,
    studioCapabilityKeys.map((permissionKey) => ({
      p_organization_id: organizationId,
      p_permission_key: permissionKey,
    })),
  );
});
