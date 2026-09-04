import type { MentionedUser } from "@core/domain/interfaces/mentioned-user.interface";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import { extractMentionHandles } from "./extract-mentions";

/**
 * Resolves the @handles written in a body into real accounts.
 *
 * A handle that matches nothing is dropped without complaint. Unlike media,
 * where an unresolvable URL means the client is trying to attach something it
 * does not own, an unresolvable handle is usually just prose - an email-like
 * fragment, a deleted account, or a typo - and failing the write over it would
 * make the platform unpleasant to type in.
 *
 * @param params - The body to read and the repository to look accounts up in
 * @returns The mentioned users, at most MAX_MENTIONS of them
 *
 * @throws MentionLimitExceededError - When the body names too many handles
 */
export async function resolveMentions(params: {
    content: string;
    userRepository: IUserRepository;
}): Promise<MentionedUser[]> {
    const handles = extractMentionHandles(params.content);

    if (handles.length === 0) return [];

    return params.userRepository.findManyByUsernames(handles);
}
