import { Type, type Static } from "@fastify/type-provider-typebox";
import { ReportReason, ReportTargetKind } from "@core/domain/enums";
import { REPORT_DETAILS_MAX_LENGTH } from "@core/domain/constants/report.constants";

/**
 * What may be reported, and why.
 *
 * The enums are spelled out from the domain rather than re-typed, so a reason
 * added to the schema cannot be one the queue does not understand.
 */
export const CreateReportBodySchema = Type.Object({
    targetKind: Type.Enum(ReportTargetKind),
    targetId: Type.String({ format: "uuid" }),
    reason: Type.Enum(ReportReason),
    details: Type.Optional(
        Type.String({ minLength: 1, maxLength: REPORT_DETAILS_MAX_LENGTH }),
    ),
});

export type CreateReportBody = Static<typeof CreateReportBodySchema>;

/**
 * What a reporter is told back.
 *
 * `received` is always true, and deliberately says nothing else - not how many
 * others reported the same thing, not whether it crossed a threshold, not what
 * happened next. Reporting the same content twice answers the same way as
 * reporting it once, so the endpoint cannot be used to find out whether an
 * earlier report was acted on.
 */
export const CreateReportResponseSchema = Type.Object({
    data: Type.Object({
        received: Type.Boolean(),
    }),
    meta: Type.Object({ timestamp: Type.String({ format: "date-time" }) }),
});

export type CreateReportResponse = Static<typeof CreateReportResponseSchema>;
