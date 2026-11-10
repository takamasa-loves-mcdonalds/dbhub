import { describe, it, expect, beforeEach } from "vitest";
import { takeCallSlot, callRateLimitMessage, resetCallRateLimits } from "../call-rate-limit.js";

describe("takeCallSlot", () => {
  beforeEach(() => {
    resetCallRateLimits();
  });

  it("should allow up to the limit within a minute and report the wait for the next call", () => {
    expect(takeCallSlot("execute_sql", 2, 0)).toBeUndefined();
    expect(takeCallSlot("execute_sql", 2, 10_000)).toBeUndefined();

    // The first call leaves the window at 60s.
    expect(takeCallSlot("execute_sql", 2, 15_000)).toBe(45_000);
  });

  it("should allow a call again once the oldest one leaves the window", () => {
    takeCallSlot("execute_sql", 1, 0);

    expect(takeCallSlot("execute_sql", 1, 59_999)).toBe(1);
    expect(takeCallSlot("execute_sql", 1, 60_000)).toBeUndefined();
  });

  it("should not count refused calls", () => {
    takeCallSlot("execute_sql", 1, 0);
    takeCallSlot("execute_sql", 1, 30_000);

    expect(takeCallSlot("execute_sql", 1, 60_000)).toBeUndefined();
  });

  it("should count each tool separately", () => {
    takeCallSlot("execute_sql_a", 1, 0);

    expect(takeCallSlot("execute_sql_b", 1, 0)).toBeUndefined();
  });

  it("should wait until the count is below a limit lowered by a reload", () => {
    takeCallSlot("execute_sql", 3, 0);
    takeCallSlot("execute_sql", 3, 10_000);
    takeCallSlot("execute_sql", 3, 20_000);

    // With a limit of 2, two of the three must leave the window, so the wait
    // runs until the second one does.
    expect(takeCallSlot("execute_sql", 2, 30_000)).toBe(40_000);
  });
});

describe("callRateLimitMessage", () => {
  it("should round the wait up to whole seconds", () => {
    expect(callRateLimitMessage("execute_sql", 60, 11_200)).toBe(
      "60 calls per minute reached for execute_sql; retry in 12s"
    );
    expect(callRateLimitMessage("execute_sql", 60, 1)).toContain("retry in 1s");
  });
});
