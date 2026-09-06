export type GenerationLock = {
    acquire: (token: string) => Promise<boolean>;
    renew: (token: string) => Promise<boolean>;
    release: (token: string) => Promise<void>;
    holder: () => Promise<string | null>;
};
