/**
 * Projection used wherever a mention relation is hydrated.
 *
 * A mention only ever renders as a linked handle, so the id and the current
 * username are the whole of it - pulling the full user row would drag the
 * profile join along for nothing. Shared by the post, comment and article
 * repositories so the three cannot drift into returning different shapes.
 */
export const MENTIONED_USERS_SELECT = {
    select: { id: true, username: true },
} as const;
