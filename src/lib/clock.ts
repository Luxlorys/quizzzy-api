/**
 * Time as a port. Code that needs "now" takes a Clock instead of calling
 * new Date() directly, so tests can freeze time (see test/helpers/fixed-clock.ts)
 * and time-dependent rules become deterministic.
 */
export type Clock = {
    now: () => Date;
};

export const systemClock: Clock = {
    now: () => new Date(),
};
