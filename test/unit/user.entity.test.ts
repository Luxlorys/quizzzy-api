import { describe, expect, it } from "vitest";
import { markOnboarded } from "@/modules/user/user.entity.js";
import { UserAlreadyOnboardedError } from "@/modules/user/user.errors.js";
import type { User } from "@/modules/user/user.entity.js";

const NOW = new Date("2026-08-21T12:00:00Z");

const freshUser = (overrides: Partial<User> = {}): User => ({
    id: 1,
    email: "andrei@example.com",
    name: "Andrei",
    avatarKey: null,
    onboardedAt: null,
    createdAt: NOW,
    ...overrides,
});

describe("markOnboarded", () => {
    it("stamps the onboarding time", () => {
        const onboarded = markOnboarded(freshUser(), NOW);

        expect(onboarded.onboardedAt).toEqual(NOW);
    });

    it("does not mutate the original user", () => {
        const user = freshUser();

        markOnboarded(user, NOW);

        expect(user.onboardedAt).toBeNull();
    });

    it("rejects onboarding twice", () => {
        const already = freshUser({
            onboardedAt: new Date("2026-08-20T09:00:00Z"),
        });

        expect(() => markOnboarded(already, NOW)).toThrow(UserAlreadyOnboardedError);
    });
});
