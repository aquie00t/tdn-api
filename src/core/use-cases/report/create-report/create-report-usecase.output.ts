/**
 * Output DTO for the CreateReportUseCase.
 *
 * Deliberately thin. The reporter learns that the report was received and
 * nothing else: not how many others reported the same thing, not whether it
 * crossed a threshold, not what happened next. Any of those would turn the
 * endpoint into a way of measuring moderation from the outside.
 */
export interface CreateReportUseCaseOutput {
    /**
     * Whether this call is what filed the report, as opposed to finding one
     * this person had already filed. Reporting twice is not an error.
     */
    created: boolean;
}
