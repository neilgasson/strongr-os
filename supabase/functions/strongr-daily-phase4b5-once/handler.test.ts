import assert from "node:assert/strict";
import test from "node:test";

import { createStrongrDailyPhase4b5OnceHandler } from "./handler.ts";

const origin = "https://strongr-studio-preview.meetwagon.chatgpt.site";

function request(body: unknown, init: { origin?: string; authorization?: string } = {}) {
  return new Request(
    "https://fifrlyddmjkogmdvyjdp.supabase.co/functions/v1/strongr-daily-phase4b5-once",
    {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        ...(init.origin === undefined ? { Origin: origin } : { Origin: init.origin }),
        ...(init.authorization === undefined
          ? { Authorization: "Bearer development-owner-review-token" }
          : { Authorization: init.authorization }),
      },
      method: "POST",
    },
  );
}

test("call-readiness endpoint permits no dispatch and exposes no provider path", async () => {
  const handler = createStrongrDailyPhase4b5OnceHandler();
  const ready = await handler(request({ request_identifier: "quiet_trust_development_pilot_v1" }));
  assert.equal(ready.status, 409);
  assert.deepEqual(await ready.json(), {
    brief_checksum: "ae6e4f069a094cf405cc98332a3d72a5a8e8ee216e5492cf4c22b10da924d49d",
    error_code: "phase_4b6_dispatch_not_authorized",
    job_checksum: "2682922d0f9216e8ad8176e27e08f499b9e65f591580ac41acacdff36b87548c",
    request_identifier: "quiet_trust_development_pilot_v1",
  });
});

test("call-readiness endpoint rejects another request, unauthenticated traffic, and another origin", async () => {
  const handler = createStrongrDailyPhase4b5OnceHandler();
  assert.equal((await handler(request({ request_identifier: "another_request" }))).status, 400);
  assert.equal(
    (
      await handler(
        request({ request_identifier: "quiet_trust_development_pilot_v1" }, { authorization: "" }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handler(
        request(
          { request_identifier: "quiet_trust_development_pilot_v1" },
          { origin: "https://example.com" },
        ),
      )
    ).status,
    403,
  );
});
