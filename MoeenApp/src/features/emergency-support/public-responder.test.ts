import assert from "node:assert/strict";
import test from "node:test";

import { buildEmergencyQrPayload } from "./qr-payload";
import {
  PublicEmergencyCardError,
  consumeEmergencyTokenFragment,
  fetchPublicEmergencyCard,
} from "./public-responder";

const token = "A".repeat(43);
const card = {
  patient: {
    firstName: "Maya",
    lastName: "Haddad",
    dateOfBirth: "1985-04-03",
    gender: "female",
    bloodType: "O+",
  },
  allergies: [{ name: "Penicillin", reaction: "Rash", severity: "moderate" }],
  chronicConditions: [{ name: "Asthma" }],
  medications: [
    {
      name: "Ventolin",
      normalizedName: "albuterol",
      dose: 2,
      unit: "puff",
      dosageForm: "inhaler",
      frequency: 0,
      instructions: "Use as directed",
      times: [],
    },
  ],
  emergencyContacts: [],
  lastUpdated: "2026-09-02T12:00:00.000Z",
};

test("builds a responder fragment URL and fails closed for unsafe configuration", () => {
  assert.equal(
    buildEmergencyQrPayload(token, "https://emergency.example"),
    `https://emergency.example/e#token=${token}`,
  );
  assert.equal(buildEmergencyQrPayload(token, undefined), null);
  assert.equal(buildEmergencyQrPayload(token, "javascript:alert(1)"), null);
  assert.equal(buildEmergencyQrPayload(token, "http://public.example"), null);
  assert.equal(buildEmergencyQrPayload(token, "https://[:::]"), null);
  assert.equal(buildEmergencyQrPayload(token, "https://example.com:65536"), null);
  assert.equal(
    buildEmergencyQrPayload("not-a-token", "https://example.com"),
    null,
  );
});

test("validates responder URLs without relying on the platform URL polyfill", () => {
  const platformUrl = globalThis.URL;
  Object.defineProperty(globalThis, "URL", {
    configurable: true,
    value: class BrokenPlatformUrl {
      constructor() {
        throw new Error("incomplete React Native URL polyfill");
      }
    },
  });

  try {
    assert.equal(
      buildEmergencyQrPayload(token, "https://emergency.example/responder/"),
      `https://emergency.example/responder/e#token=${token}`,
    );
    assert.equal(
      buildEmergencyQrPayload(token, "http://[::1]:8080"),
      `http://[::1]:8080/e#token=${token}`,
    );
  } finally {
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: platformUrl,
    });
  }
});

test("reads a canonical fragment token and removes it from browser history", () => {
  const replacements: string[] = [];
  const result = consumeEmergencyTokenFragment(
    { hash: `#token=${token}`, pathname: "/e", search: "" },
    {
      replaceState: (_data, _unused, url) => replacements.push(String(url)),
    },
  );

  assert.equal(result, token);
  assert.deepEqual(replacements, ["/e"]);
});

test("rejects an invalid fragment after removing it", () => {
  let replacement = "";
  assert.equal(
    consumeEmergencyTokenFragment(
      { hash: "#token=invalid", pathname: "/e", search: "?source=qr" },
      { replaceState: (_data, _unused, url) => (replacement = String(url)) },
    ),
    null,
  );
  assert.equal(replacement, "/e?source=qr");
});

test("uses Authorization without Firebase auth and returns every valid card section for rendering", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await fetchPublicEmergencyCard(token, async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ ...card, internalUserId: 42 }), {
      status: 200,
    });
  }, "https://emergency.example");

  assert.match(requestUrl, /\/api\/emergency\/public\/card$/);
  assert.equal(requestUrl.includes(token), false);
  assert.deepEqual(requestInit?.headers, {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  });
  assert.equal("internalUserId" in result, false);
  assert.deepEqual(result, card);
});

test("maps the generic backend 404 to unavailable", async () => {
  await assert.rejects(
    fetchPublicEmergencyCard(
      token,
      async () => new Response(null, { status: 404 }),
      "https://emergency.example",
    ),
    (error: unknown) =>
      error instanceof PublicEmergencyCardError && error.kind === "unavailable",
  );
});

test("supports controlled retry after a network failure", async () => {
  let attempts = 0;
  const fetcher: typeof fetch = async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("offline");
    return new Response(JSON.stringify(card), { status: 200 });
  };

  await assert.rejects(
    fetchPublicEmergencyCard(token, fetcher, "https://emergency.example"),
    (error: unknown) =>
      error instanceof PublicEmergencyCardError && error.kind === "retry",
  );
  assert.deepEqual(
    await fetchPublicEmergencyCard(
      token,
      fetcher,
      "https://emergency.example",
    ),
    card,
  );
  assert.equal(attempts, 2);
});

test("fails closed before fetching when the responder API origin is missing", async () => {
  let fetched = false;
  await assert.rejects(
    fetchPublicEmergencyCard(
      token,
      async () => {
        fetched = true;
        return new Response(JSON.stringify(card), { status: 200 });
      },
      "",
    ),
    (error: unknown) =>
      error instanceof PublicEmergencyCardError &&
      error.kind === "configuration",
  );
  assert.equal(fetched, false);
});
