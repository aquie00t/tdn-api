import type { FeedCandidate } from "@core/domain/interfaces/feed-candidate.interface";

/**
 * The feed ranker.
 *
 * Pure and synchronous on purpose: ranking is the one part of the feed that
 * has to be reasoned about and tuned, so it takes plain data in and gives an
 * order out, with no repository, cache or clock of its own. Everything it
 * needs - the viewer, the weights, the current time - arrives as an argument.
 */

/**
 * The knobs the feed is tuned with.
 *
 * Sourced from environment configuration rather than hard-coded so the mix can
 * be changed without a deploy - the right weights are an empirical question,
 * and the first guess is certain to be wrong.
 */
export interface FeedRankingWeights {
    /** Added when the post is in a language the viewer reads. */
    language: number;

    /** Added when the viewer follows the author. */
    social: number;

    /** Multiplies the post's damped engagement score. */
    engagement: number;

    /** Hours after which a post's score has halved. */
    halfLifeHours: number;

    /** Most posts one author may hold in the ranked head. */
    maxPostsPerAuthor: number;

    /**
     * Largest share of the ranked head that may be in a language the viewer
     * does not read, between 0 and 1.
     */
    foreignLanguageQuota: number;
}

/**
 * Everything about the viewer that the ranker needs.
 */
export interface FeedRankingContext {
    /** The languages the viewer reads, already normalised to supported codes. */
    languages: string[];

    /** Ids of the accounts the viewer follows. */
    followingIds: Set<string>;

    /** The reference time decay is measured against. */
    now: Date;
}

/**
 * Baseline every candidate starts from.
 *
 * Without it a post that matches nothing would score zero and time decay would
 * have nothing to act on, collapsing the whole tail of the feed into an
 * arbitrary order.
 */
const BASE_SCORE = 1;

/**
 * What a language the ranker cannot read is worth, as a share of a match.
 *
 * An undetected post is genuinely unknown, not foreign: it is usually a link,
 * a screenshot or a snippet, which reads the same in any language. Scoring it
 * halfway keeps it in the feed without letting it outrank a real match.
 */
const UNKNOWN_LANGUAGE_FACTOR = 0.5;

/** A comment costs more than a like, and a quote more than a comment. */
const COMMENT_WEIGHT = 2;
const QUOTE_WEIGHT = 3;

/**
 * Scores one candidate for one viewer.
 *
 * The terms are added and the sum is then decayed, rather than each term being
 * decayed on its own: a post's relevance does not age, only its freshness
 * does, so age has to act on the whole score at once.
 *
 * Engagement is damped through `log1p` because raw counts are heavy-tailed -
 * without it a single post with a thousand likes outranks every fresh post in
 * the pool for as long as it stays in the candidate window.
 *
 * @param candidate - The post projection to score.
 * @param context - The viewer the score is computed for.
 * @param weights - The tuning weights.
 * @returns The candidate's score; higher ranks earlier.
 */
export function scoreCandidate(
    candidate: FeedCandidate,
    context: FeedRankingContext,
    weights: FeedRankingWeights,
): number {
    let score = BASE_SCORE;

    score +=
        weights.language * languageAffinity(candidate.lang, context.languages);

    if (context.followingIds.has(candidate.authorId)) {
        score += weights.social;
    }

    const engagement =
        candidate.likeCount +
        COMMENT_WEIGHT * candidate.commentCount +
        QUOTE_WEIGHT * candidate.quoteCount;
    score += weights.engagement * Math.log1p(Math.max(engagement, 0));

    return (
        score *
        timeDecay(candidate.createdAt, context.now, weights.halfLifeHours)
    );
}

/**
 * Rates a post's language against the languages the viewer reads.
 *
 * @param lang - The post's detected language, or null when unknown.
 * @param viewerLanguages - The languages the viewer reads.
 * @returns 1 for a match, 0 for a language the viewer does not read, and
 * {@link UNKNOWN_LANGUAGE_FACTOR} when the post's language was never detected.
 */
function languageAffinity(
    lang: string | null,
    viewerLanguages: string[],
): number {
    if (!lang) return UNKNOWN_LANGUAGE_FACTOR;
    return viewerLanguages.includes(lang) ? 1 : 0;
}

/**
 * Halves a post's score every `halfLifeHours`.
 *
 * @param createdAt - When the post was published.
 * @param now - The reference time.
 * @param halfLifeHours - Hours after which the score has halved.
 * @returns A multiplier in (0, 1].
 */
function timeDecay(createdAt: Date, now: Date, halfLifeHours: number): number {
    // Clamped at zero so a post whose timestamp is slightly ahead of this
    // process - clock skew between instances is normal - cannot score above a
    // brand new one.
    const ageHours = Math.max(
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60),
        0,
    );

    return Math.pow(0.5, ageHours / halfLifeHours);
}

/**
 * Orders a candidate pool into the feed the viewer sees.
 *
 * Scoring alone cannot express the two rules that keep a feed readable, so
 * ranking runs in two stages. Candidates are scored and sorted, then merged
 * back together under those rules: no author may hold more than
 * `maxPostsPerAuthor` slots, and posts in a language the viewer does not read
 * take at most `foreignLanguageQuota` of the slots.
 *
 * The quota is applied by interleaving rather than by filtering the sorted
 * list. Filtering would have made the quota a ceiling that is never reached -
 * a burst of highly engaged foreign posts sorts ahead of everything, gets
 * turned away for being early, and never comes back. Interleaving spends the
 * quota deliberately: the best foreign candidate is admitted exactly when
 * doing so keeps the share within budget.
 *
 * Constrained candidates are deferred to the tail, never dropped. The ranked
 * list is what the viewer pages through, so removing a post here would make it
 * unreachable rather than merely late.
 *
 * @param candidates - The pool to rank; not mutated.
 * @param context - The viewer to rank for.
 * @param weights - The tuning weights.
 * @returns Every candidate, in the order the feed should serve them.
 */
export function rankFeed(
    candidates: FeedCandidate[],
    context: FeedRankingContext,
    weights: FeedRankingWeights,
): FeedCandidate[] {
    const sorted = candidates
        .map((candidate) => ({
            candidate,
            score: scoreCandidate(candidate, context, weights),
        }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            // Ties are broken deterministically, newest first. Two posts with
            // identical scores are common - same author, same age bucket, no
            // engagement - and an unstable order there would reshuffle the
            // feed on every rebuild for no reason.
            const byDate =
                b.candidate.createdAt.getTime() -
                a.candidate.createdAt.getTime();
            return byDate !== 0
                ? byDate
                : a.candidate.id.localeCompare(b.candidate.id);
        })
        .map(({ candidate }) => candidate);

    const foreign = sorted.filter((candidate) =>
        isForeign(candidate.lang, context.languages),
    );
    const native = sorted.filter(
        (candidate) => !isForeign(candidate.lang, context.languages),
    );

    const selected: FeedCandidate[] = [];
    const deferred: FeedCandidate[] = [];
    const perAuthor = new Map<string, number>();
    let foreignSelected = 0;
    let nativeIndex = 0;
    let foreignIndex = 0;

    /**
     * Whether one more foreign post would still fit inside the quota.
     *
     * Measured against the slot it would take, so the budget holds from the
     * very first position instead of only after the head has already filled
     * with foreign posts.
     */
    const foreignFitsQuota = (): boolean =>
        (foreignSelected + 1) / (selected.length + 1) <=
        weights.foreignLanguageQuota;

    /**
     * Places one candidate, or defers it when its author is already at the cap.
     */
    const place = (candidate: FeedCandidate): void => {
        const authorCount = perAuthor.get(candidate.authorId) ?? 0;
        if (authorCount >= weights.maxPostsPerAuthor) {
            deferred.push(candidate);
            return;
        }

        perAuthor.set(candidate.authorId, authorCount + 1);
        if (isForeign(candidate.lang, context.languages)) foreignSelected++;
        selected.push(candidate);
    };

    while (nativeIndex < native.length || foreignIndex < foreign.length) {
        const nativeLeft = nativeIndex < native.length;
        const foreignLeft = foreignIndex < foreign.length;

        // With nothing else left the quota stops applying: it exists to keep a
        // feed mixed, not to withhold the only content there is.
        const takeForeign = foreignLeft && (!nativeLeft || foreignFitsQuota());

        place(takeForeign ? foreign[foreignIndex++] : native[nativeIndex++]);
    }

    return [...selected, ...deferred];
}

/**
 * Checks whether a post is in a language the viewer does not read.
 *
 * An undetected language is not foreign - see {@link UNKNOWN_LANGUAGE_FACTOR}.
 *
 * @param lang - The post's detected language, or null when unknown.
 * @param viewerLanguages - The languages the viewer reads.
 * @returns True when the post is known to be in another language.
 */
function isForeign(lang: string | null, viewerLanguages: string[]): boolean {
    return lang !== null && !viewerLanguages.includes(lang);
}
