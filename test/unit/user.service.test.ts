import { describe, expect, it } from "vitest";
import { createUserService } from "@/modules/user/user.service.js";
import {
    EmailTakenError,
    EmptyAvatarError,
    UserAlreadyOnboardedError,
    UserNotFoundError,
} from "@/modules/user/user.errors.js";
import { fixedClock } from "../helpers/fixed-clock.js";
import { createInMemoryAvatarRepository } from "../helpers/in-memory-avatar-repository.js";
import { createInMemoryUserRepository } from "../helpers/in-memory-user-repository.js";

const NOW = "2026-08-21T12:00:00Z";

const makeService = () => {
    const clock = fixedClock(NOW);
    const repository = createInMemoryUserRepository(clock);
    const avatars = createInMemoryAvatarRepository();
    const service = createUserService({ repository, avatars, clock });

    return { service, repository, avatars };
};

describe("createUser", () => {
    it("persists and returns the user", async () => {
        const { service } = makeService();

        const user = await service.createUser({
            email: "andrei@example.com",
            name: "Andrei",
        });

        expect(user).toMatchObject({
            email: "andrei@example.com",
            name: "Andrei",
            onboardedAt: null,
        });
    });

    it("rejects a duplicate email with the port's contract error", async () => {
        const { service } = makeService();

        await service.createUser({ email: "a@example.com", name: "First" });

        await expect(
            service.createUser({ email: "a@example.com", name: "Second" }),
        ).rejects.toBeInstanceOf(EmailTakenError);
    });
});

describe("markOnboarded", () => {
    it("stamps the clock's time and persists it", async () => {
        const { service, repository } = makeService();
        const created = await service.createUser({
            email: "andrei@example.com",
            name: "Andrei",
        });

        const onboarded = await service.markOnboarded(created.id);

        expect(onboarded.onboardedAt).toEqual(new Date(NOW));
        expect(repository.rows()[0]?.onboardedAt).toEqual(new Date(NOW));
    });

    it("surfaces the domain rule on a second onboarding", async () => {
        const { service } = makeService();
        const created = await service.createUser({
            email: "andrei@example.com",
            name: "Andrei",
        });

        await service.markOnboarded(created.id);

        await expect(service.markOnboarded(created.id)).rejects.toBeInstanceOf(
            UserAlreadyOnboardedError,
        );
    });

    it("throws UserNotFoundError for an unknown id", async () => {
        const { service } = makeService();

        await expect(service.markOnboarded(999)).rejects.toBeInstanceOf(
            UserNotFoundError,
        );
    });
});

describe("setAvatar", () => {
    it("uploads through the storage port and persists the returned key", async () => {
        const { service, repository, avatars } = makeService();
        const created = await service.createUser({
            email: "andrei@example.com",
            name: "Andrei",
        });

        const updated = await service.setAvatar({
            id: created.id,
            body: Buffer.from("fake-png-bytes"),
            contentType: "image/png",
        });

        expect(updated.avatarKey).toMatch(new RegExp(`^avatars/${created.id}/`));
        expect(repository.rows()[0]?.avatarKey).toBe(updated.avatarKey);

        const stored = avatars.objects().get(updated.avatarKey ?? "");

        expect(stored?.contentType).toBe("image/png");
        expect(stored?.body.toString()).toBe("fake-png-bytes");
    });

    it("rejects an empty upload before touching storage", async () => {
        const { service, avatars } = makeService();
        const created = await service.createUser({
            email: "andrei@example.com",
            name: "Andrei",
        });

        await expect(
            service.setAvatar({
                id: created.id,
                body: Buffer.alloc(0),
                contentType: "image/png",
            }),
        ).rejects.toBeInstanceOf(EmptyAvatarError);

        expect(avatars.objects().size).toBe(0);
    });

    it("throws UserNotFoundError for an unknown user", async () => {
        const { service } = makeService();

        await expect(
            service.setAvatar({
                id: 999,
                body: Buffer.from("data"),
                contentType: "image/png",
            }),
        ).rejects.toBeInstanceOf(UserNotFoundError);
    });
});
