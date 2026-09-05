/**
 * Cursor pagination vocabulary shared by repository ports.
 * Framework-free: these are the types a port speaks, not an HTTP contract —
 * each module's *.schema.ts declares how the cursor appears on the wire.
 */
export type Page<T> = {
    items: T[];
    /** Pass back as `cursor` to fetch the next page; null when this is the last page. */
    nextCursor: number | null;
};

export type PageQuery = {
    limit: number;
    cursor?: number;
};
