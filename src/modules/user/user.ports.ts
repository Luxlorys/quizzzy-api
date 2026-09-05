import type { NewUser, User } from "./user.entity.js";
import type { Clock } from "@/lib/clock.js";

export type UserRepository = {
    create: (data: NewUser) => Promise<User>;
    findById: (id: number) => Promise<User | null>;
    save: (user: User) => Promise<User>;
};

export type AvatarRepository = {
    uploadAvatar: (input: {
        userId: number;
        body: Buffer;
        contentType: string;
    }) => Promise<string>;
};

export type UserDto = {
    id: number;
    email: string;
    name: string;
    avatarKey: string | null;
    onboardedAt: Date | null;
    createdAt: Date;
};

export type CreateUserInput = {
    email: string;
    name: string;
};

export type SetAvatarInput = {
    id: number;
    body: Buffer;
    contentType: string;
};

export type UserService = {
    createUser: (input: CreateUserInput) => Promise<UserDto>;
    getUser: (id: number) => Promise<UserDto>;
    markOnboarded: (id: number) => Promise<UserDto>;
    setAvatar: (input: SetAvatarInput) => Promise<UserDto>;
};

export type UserServiceDeps = {
    repository: UserRepository;
    avatars: AvatarRepository;
    clock: Clock;
};

export type UserPublicApi = {
    markOnboarded: (userId: number) => Promise<{ id: number; name: string }>;
};
