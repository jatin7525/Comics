import { it } from "node:test";
import assert from "node:assert/strict";
import { knownMcpOrigin } from "../../src/domain/mcp/origins";

it("recognizes hosted AI origins without admitting lookalike sites", () => {
  const admin = "https://comics-admin.vercel.app";
  for (const origin of [
    admin,
    "https://claude.ai",
    "https://claude.com",
    "https://chatgpt.com",
    "https://grok.com",
  ])
    assert.equal(knownMcpOrigin(origin, admin), true);
  for (const origin of [
    "null",
    "http://claude.ai",
    "https://claude.ai.evil.example",
    "https://evil.example",
    "https://claude.ai:444",
  ])
    assert.equal(knownMcpOrigin(origin, admin), false);
});
