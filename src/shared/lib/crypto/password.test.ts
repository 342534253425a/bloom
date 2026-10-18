import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("accepts the original password and rejects a different one", async () => {
    const stored = await hashPassword("small-steps");
    expect(await verifyPassword("small-steps", stored.hash, stored.salt)).toBe(true);
    expect(await verifyPassword("small-step", stored.hash, stored.salt)).toBe(false);
  });
});
