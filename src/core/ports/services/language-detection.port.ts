/**
 * Port interface for detecting the language a piece of text was written in.
 *
 * Following Clean Architecture principles, this interface defines the contract
 * without exposing implementation details. The shipped implementation is a
 * dependency-free heuristic; the contract is async so it can be swapped for a
 * network-backed detector without touching a single caller.
 */
export interface LanguageDetectionPort {
    /**
     * Detects the language of the given text.
     *
     * @param text - The text to classify.
     * @returns The detected language code, or null when the text carries too
     * little signal to call - a link-only or emoji-only post, for instance.
     * Callers must treat null as "unknown", never as a default language.
     */
    detect(text: string): Promise<string | null>;
}
