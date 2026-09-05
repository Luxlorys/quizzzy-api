import { markOnboarded } from "./user.entity.js";
import { toUserDto } from "./user.dto.js";
import { EmptyAvatarError, UserNotFoundError } from "./user.errors.js";
import type { User } from "./user.entity.js";
import type { UserService, UserServiceDeps } from "./user.ports.js";

export const createUserService = ({
    repository,
    avatars,
    clock,
}: UserServiceDeps): UserService => {
    const loadUser = async (id: number): Promise<User> => {
        const user = await repository.findById(id);

        if (user === null) {
            throw new UserNotFoundError();
        }

        return user;
    };

    return {
        createUser: async (input) => toUserDto(await repository.create(input)),

        getUser: async (id) => toUserDto(await loadUser(id)),

        markOnboarded: async (id) =>
            toUserDto(
                await repository.save(
                    markOnboarded(await loadUser(id), clock.now()),
                ),
            ),

        setAvatar: async ({ id, body, contentType }) => {
            if (body.length === 0) {
                throw new EmptyAvatarError();
            }

            const user = await loadUser(id);

            const avatarKey = await avatars.uploadAvatar({
                userId: user.id,
                body,
                contentType,
            });

            return toUserDto(await repository.save({ ...user, avatarKey }));
        },
    };
};
