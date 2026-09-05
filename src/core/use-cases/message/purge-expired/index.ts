/**
 * This module exports the output DTO for one retention pass.
 */
export { PurgeExpiredMessagesOutput } from "./purge-expired-messages.output";
/**
 * This module exports the PurgeExpiredMessagesUseCase, which destroys message
 * history past the retention window along with the media attached to it.
 */
export { PurgeExpiredMessagesUseCase } from "./purge-expired-messages.usecase";
