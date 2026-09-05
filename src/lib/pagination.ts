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

/**
 * The cursor protocol itself, in one place: a repository reads `limit + 1`
 * rows, and this decides where the page ends and what the next cursor is.
 * Shared so an in-memory implementation cannot drift from the real one on the
 * off-by-one — the whole point of the fake is to honor the same contract.
 */
export const pageOf = <TRow, TItem extends { id: number }>(
    rows: TRow[],
    limit: number,
    toItem: (row: TRow) => TItem,
): Page<TItem> => {
    const items = rows.slice(0, limit).map(toItem);
    const last = items.at(-1);

    return {
        items,
        nextCursor: rows.length > limit && last ? last.id : null,
    };
};
