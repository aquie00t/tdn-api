import type { LanguageDetectionPort } from "@core/ports/services/language-detection.port";
import type { SupportedLanguage } from "@core/domain/constants/language.constants";

/**
 * Letters that exist in the Turkish alphabet and in no English word.
 *
 * Only the four unambiguous ones. `ç`, `ö` and `ü` are left out here because
 * they reach English text through loanwords ("café", "über", "naïve") and
 * through the German and French quotes a developer feed carries plenty of.
 */
const STRONG_TURKISH_LETTERS = /[ışğİŞĞ]/gu;

/**
 * Turkish letters that also turn up in borrowed English spellings.
 * Worth a nudge, never enough to decide on their own.
 */
const WEAK_TURKISH_LETTERS = /[çöüÇÖÜ]/gu;

/**
 * Everything a language detector must not read.
 *
 * URLs, handles, hashtags and fenced or inline code are the same in every
 * language, and a post that is mostly a stack trace would otherwise be scored
 * on its identifiers. Stripped before tokenising so they cannot pad the token
 * count either.
 */
const NOISE_PATTERNS: RegExp[] = [
    /```[\s\S]*?```/g,
    /`[^`]*`/g,
    /https?:\/\/\S+/gi,
    /\bwww\.\S+/gi,
    /[@#]\p{L}[\p{L}\p{N}_]*/gu,
];

/**
 * Function words that carry a language even in heavily code-switched text.
 *
 * A Turkish post about React is still full of `ve`, `bir` and `için` while the
 * nouns stay English, which is exactly why the classifier leans on these
 * rather than on vocabulary.
 */
const TURKISH_STOPWORDS = new Set([
    "ve",
    "bir",
    "bu",
    "şu",
    "için",
    "ile",
    "ama",
    "çok",
    "daha",
    "gibi",
    "olarak",
    "var",
    "yok",
    "değil",
    "kadar",
    "sonra",
    "önce",
    "şey",
    "ben",
    "sen",
    "biz",
    "siz",
    "onlar",
    "ne",
    "nasıl",
    "neden",
    "evet",
    "hayır",
    "mı",
    "mi",
    "mu",
    "mü",
    "ki",
    "ise",
    "hem",
    "veya",
    "çünkü",
    "ancak",
    "artık",
    "şimdi",
    "bugün",
    "yeni",
    "iyi",
    "kötü",
    "büyük",
    "küçük",
    "oldu",
    "olur",
    "diye",
    "her",
    "hiç",
    "böyle",
    "şöyle",
    "sadece",
    "birlikte",
    "üzerine",
    "göre",
    "bile",
]);

/**
 * The English counterpart of {@link TURKISH_STOPWORDS}.
 */
const ENGLISH_STOPWORDS = new Set([
    "the",
    "and",
    "is",
    "are",
    "was",
    "were",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "that",
    "this",
    "it",
    "you",
    "we",
    "they",
    "have",
    "has",
    "had",
    "but",
    "not",
    "from",
    "as",
    "at",
    "by",
    "be",
    "been",
    "can",
    "will",
    "would",
    "should",
    "about",
    "just",
    "like",
    "what",
    "how",
    "why",
    "when",
    "which",
    "there",
    "their",
    "our",
    "your",
    "its",
    "all",
    "some",
    "more",
    "most",
    "other",
    "into",
    "than",
    "then",
    "also",
    "only",
    "over",
    "after",
    "before",
    "get",
    "make",
    "use",
    "using",
    "one",
    "does",
]);

/**
 * Suffixes that end a Turkish word and almost never end an English one.
 *
 * Scored far below a stopword hit on purpose: English has its own words
 * ending in `-ler` ("smaller") and `-den` ("garden"), so these break ties
 * rather than decide.
 */
const TURKISH_SUFFIXES =
    /(lar|ler|yor|mış|miş|muş|müş|dır|dir|dur|dür|dan|den|tan|ten|acak|ecek|ları|leri|ında|inde)$/u;

/** Below this many real words there is nothing to classify. */
const MIN_TOKENS = 4;

/** Total evidence below this is noise, whichever way it leans. */
const MIN_EVIDENCE = 2;

/**
 * How decisively one language must lead, as a share of the total evidence.
 *
 * A post that scores 5 to 4 is bilingual, not English, and labelling it either
 * way is worse than leaving it unknown - an unknown post is ranked neutrally
 * and still reaches everyone.
 */
const MIN_MARGIN = 0.25;

const STRONG_LETTER_WEIGHT = 1.5;
const WEAK_LETTER_WEIGHT = 0.5;
const STOPWORD_WEIGHT = 1;
const SUFFIX_WEIGHT = 0.5;

/** Caps how far a single wall of accented text can carry the score. */
const MAX_LETTER_HITS = 4;

/** Shortest word that can carry a Turkish suffix rather than be one. */
const MIN_SUFFIX_WORD_LENGTH = 5;

/**
 * Dependency-free language detector for post content.
 *
 * Classifies Turkish against English from function words, Turkish-only
 * letters and Turkish suffixes, and refuses to answer when the text is too
 * short or too evenly split. It runs in-process on every post write, which is
 * why it is a heuristic and not a call to DeepL: a post write must not wait on
 * a third party, and the ranker only needs to be right often enough to sort a
 * feed, not right on every sentence.
 */
export class HeuristicLanguageDetectionService implements LanguageDetectionPort {
    /**
     * Detects the language of the given text.
     *
     * @param text - The text to classify.
     * @returns The detected language code, or null when the text carries too
     * little signal to call.
     */
    detect(text: string): Promise<string | null> {
        return Promise.resolve(this.classify(text));
    }

    /**
     * Scores the text for each supported language and picks a winner.
     *
     * @param text - The raw post content.
     * @returns The winning language, or null when nothing wins clearly.
     */
    private classify(text: string): SupportedLanguage | null {
        const cleaned = this.stripNoise(text);
        const tokens = this.tokenize(cleaned);

        if (tokens.length < MIN_TOKENS) return null;

        let turkish = this.scoreTurkishLetters(cleaned);
        let english = 0;

        for (const token of tokens) {
            if (TURKISH_STOPWORDS.has(token)) {
                turkish += STOPWORD_WEIGHT;
                continue;
            }

            if (ENGLISH_STOPWORDS.has(token)) {
                english += STOPWORD_WEIGHT;
                continue;
            }

            // Only on words long enough that the suffix is a suffix and not
            // the whole word: "ten" and "den" are English words in their own
            // right, "veriler" is not.
            if (
                token.length >= MIN_SUFFIX_WORD_LENGTH &&
                TURKISH_SUFFIXES.test(token)
            ) {
                turkish += SUFFIX_WEIGHT;
            }
        }

        const total = turkish + english;
        if (total < MIN_EVIDENCE) return null;

        const margin = Math.abs(turkish - english) / total;
        if (margin < MIN_MARGIN) return null;

        return turkish > english ? "tr" : "en";
    }

    /**
     * Scores the Turkish-only letters in the text.
     *
     * @param text - The noise-stripped content.
     * @returns The Turkish evidence contributed by spelling alone.
     */
    private scoreTurkishLetters(text: string): number {
        const strong = Math.min(
            text.match(STRONG_TURKISH_LETTERS)?.length ?? 0,
            MAX_LETTER_HITS,
        );
        const weak = Math.min(
            text.match(WEAK_TURKISH_LETTERS)?.length ?? 0,
            MAX_LETTER_HITS,
        );

        return strong * STRONG_LETTER_WEIGHT + weak * WEAK_LETTER_WEIGHT;
    }

    /**
     * Removes the parts of a post that say nothing about its language.
     *
     * @param text - The raw post content.
     * @returns The content with code, links, handles and hashtags removed.
     */
    private stripNoise(text: string): string {
        return NOISE_PATTERNS.reduce(
            (acc, pattern) => acc.replace(pattern, " "),
            text,
        );
    }

    /**
     * Splits text into lowercase word tokens.
     *
     * Lowercasing is deliberately locale-independent: `toLocaleLowerCase("tr")`
     * would map the English pronoun "I" onto "ı" and hand every English post a
     * Turkish-only letter. Letter scoring runs on the original casing instead.
     *
     * @param text - The noise-stripped content.
     * @returns The word tokens, digits and punctuation dropped.
     */
    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .split(/[^\p{L}]+/u)
            .filter((token) => token.length > 1);
    }
}
