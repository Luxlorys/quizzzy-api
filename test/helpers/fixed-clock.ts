import type { Clock } from "@/lib/clock.js";

/** A Clock frozen at a known instant, so time-dependent rules are deterministic. */
export const fixedClock = (iso: string): Clock => {
    const frozen = new Date(iso);

    return { now: () => new Date(frozen.getTime()) };
};
