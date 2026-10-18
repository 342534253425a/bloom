import { describe, expect, it } from "vitest";
import { createCodeStore } from "./code-store";
import { registrationLetter } from "./letter";
import { createMailer } from "./mailer";

describe("registration codes", () => {
  it("accepts the code that was just issued", () => {
    let now = 1_000_000;
    const store = createCodeStore(() => now);
    const issued = store.issue("ada@bloom.test");
    expect(issued).toHaveProperty("code");
    if (!("code" in issued)) return;
    expect(store.verify("ada@bloom.test", issued.code)).toBe("ok");
    expect(store.verify("ada@bloom.test", issued.code)).toBe("invalid");
  });

  it("waits before sending another code to the same email", () => {
    let now = 1_000_000;
    const store = createCodeStore(() => now);
    expect("code" in store.issue("ada@bloom.test")).toBe(true);
    expect(store.issue("ada@bloom.test")).toEqual({ error: "limited" });
    now += 30_000;
    expect("code" in store.issue("ada@bloom.test")).toBe(true);
  });

  it("expires the code after ten minutes", () => {
    let now = 1_000_000;
    const store = createCodeStore(() => now);
    const issued = store.issue("ada@bloom.test");
    if (!("code" in issued)) throw new Error("expected a code");
    now += 10 * 60 * 1000 + 1;
    expect(store.verify("ada@bloom.test", issued.code)).toBe("expired");
  });

  it("forgets the code after five wrong tries", () => {
    const store = createCodeStore(() => 1_000_000);
    const issued = store.issue("ada@bloom.test");
    if (!("code" in issued)) throw new Error("expected a code");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(store.verify("ada@bloom.test", "000000")).toBe("invalid");
    }
    expect(store.verify("ada@bloom.test", issued.code)).toBe("invalid");
  });
});

describe("registration letter", () => {
  it("puts the code in the message", () => {
    const english = registrationLetter("en", "123456");
    const russian = registrationLetter("ru", "654321");
    expect(english.text.startsWith("123456")).toBe(true);
    expect(russian.subject).toBe("Код для Bloom");
    expect(russian.text.startsWith("654321")).toBe(true);
  });
});

describe("mailer", () => {
  it("stays off until mail settings exist", () => {
    expect(createMailer({})).toBeNull();
  });
});
