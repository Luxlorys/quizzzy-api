import type { User } from "./user.entity.js";
import type { CreateUserInput, SetAvatarInput, UserDto } from "./user.ports.js";

export const toCreateUserInput = (body: {
    email: string;
    name: string;
}): CreateUserInput => ({
    email: body.email,
    name: body.name,
});

export const toSetAvatarInput = (
    id: number,
    body: Buffer,
    contentType: string,
): SetAvatarInput => ({
    id,
    body,
    contentType,
});

export const toUserDto = (user: User): UserDto => ({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarKey: user.avatarKey,
    onboardedAt: user.onboardedAt,
    createdAt: user.createdAt,
});

export const toUserResponse = (dto: UserDto) => ({
    id: dto.id,
    email: dto.email,
    name: dto.name,
    avatarKey: dto.avatarKey,
    onboardedAt: dto.onboardedAt === null ? null : dto.onboardedAt.toISOString(),
    createdAt: dto.createdAt.toISOString(),
});
