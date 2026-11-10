/**
 * Per-tool call rate limit (`max_calls_per_minute` in [[tools]]).
 *
 * Calls are counted per process and per registered tool name over a sliding
 * one-minute window. Over stdio each Claude Code session runs its own
 * process, so the limit applies per session. The counts live at module scope
 * rather than in a handler because the HTTP transport builds a fresh server,
 * and fresh handlers, for every request.
 */

const WINDOW_MS = 60_000;

/** Start times of the calls still inside the window, oldest first, per tool name. */
const callTimes = new Map<string, number[]>();

/**
 * Count a call to `toolName` if fewer than `limit` calls started in the last
 * minute. Returns undefined when the call may proceed, or how many
 * milliseconds remain until it would be allowed.
 */
export function takeCallSlot(
  toolName: string,
  limit: number,
  now: number = Date.now()
): number | undefined {
  const recent = (callTimes.get(toolName) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= limit) {
    callTimes.set(toolName, recent);
    // The call is allowed once enough of the counted calls have left the
    // window to bring the count below the limit. Usually that is the oldest
    // one; more when the limit was lowered by a config reload.
    return recent[recent.length - limit] + WINDOW_MS - now;
  }
  recent.push(now);
  callTimes.set(toolName, recent);
  return undefined;
}

/** Error text for a call refused by takeCallSlot, telling the agent when to retry. */
export function callRateLimitMessage(toolName: string, limit: number, waitMs: number): string {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  return `${limit} calls per minute reached for ${toolName}; retry in ${seconds}s`;
}

/** Forget every count (tests). */
export function resetCallRateLimits(): void {
  callTimes.clear();
}
