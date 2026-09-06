/**
 * Port interface for caching operations.
 * Following Clean Architecture principles, this interface defines the contract
 * for caching operations without exposing implementation details.
 */
export interface CachePort {
    /**
     * Retrieves a value from the cache by its key.
     * @param key - The cache key.
     * @returns The cached value if found, otherwise null.
     */
    get(key: string): Promise<string | null>;

    /**
     * Stores a value in the cache with an optional TTL.
     * @param key - The cache key.
     * @param value - The value to store.
     * @param ttlSeconds - Optional time-to-live in seconds.
     */
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;

    /**
     * Deletes a single cache entry by its exact key.
     * @param key - The exact cache key to delete.
     */
    /**
     * Writes a value only when the key is not already taken.
     *
     * The claim primitive. Reading and then writing leaves a window two
     * concurrent callers both pass through, which is exactly the case this
     * exists to decide - a retry arriving while the first attempt is still in
     * flight. The store settles it in one operation instead.
     *
     * @param key - The key to claim.
     * @param value - The value to write if the claim succeeds.
     * @param ttlSeconds - How long the claim lives.
     * @returns True when this caller took the key, false when somebody held it.
     */
    setIfAbsent(
        key: string,
        value: string,
        ttlSeconds: number,
    ): Promise<boolean>;

    delete(key: string): Promise<void>;

    /**
     * Deletes cache entries matching a pattern.
     * @param pattern - The pattern to match cache keys against.
     */
    deleteByPattern(pattern: string): Promise<void>;
}
