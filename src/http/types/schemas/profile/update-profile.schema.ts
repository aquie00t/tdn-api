import { type Static, Type } from "@fastify/type-provider-typebox";
import { PostCategory } from "@core/domain/enums/post-category-enum";
import { SUPPORTED_LANGUAGES } from "@core/domain/constants/language.constants";

export const UpdateProfileBodySchema = Type.Object(
    {
        fullName: Type.Optional(
            Type.String({
                minLength: 2,
                maxLength: 100,
                description: "User's full name",
            }),
        ),
        bio: Type.Optional(
            Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
        ),
        location: Type.Optional(
            Type.Union([Type.String({ maxLength: 100 }), Type.Null()]),
        ),
        socials: Type.Optional(
            Type.Union([
                Type.Record(Type.String(), Type.String({ format: "uri" })),
                Type.Null(),
            ]),
        ),
        categories: Type.Optional(
            Type.Array(Type.Enum(PostCategory), {
                maxItems: 5,
                uniqueItems: true,
                description:
                    "Discovery categories. Bot accounts only — non-bot accounts get a 403.",
            }),
        ),
        languages: Type.Optional(
            Type.Array(
                Type.Union(
                    SUPPORTED_LANGUAGES.map((code) => Type.Literal(code)),
                ),
                {
                    maxItems: SUPPORTED_LANGUAGES.length,
                    uniqueItems: true,
                    description:
                        "Feed languages, most preferred first. An empty array hands the choice back to Accept-Language.",
                },
            ),
        ),
    },
    { additionalProperties: false },
);

export type UpdateProfileBody = Static<typeof UpdateProfileBodySchema>;
