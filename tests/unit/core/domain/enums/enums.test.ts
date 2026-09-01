import { describe, it, expect } from "vitest";
import { PostType } from "@core/domain/enums/post-type.enum";
import { PostCategory } from "@core/domain/enums/post-category-enum";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { TokenType } from "@core/domain/enums/token-type.enum";

describe("Domain Enums", () => {
    describe("PostType", () => {
        it("should have COMMUNITY value", () => {
            expect(PostType.COMMUNITY).toBe("COMMUNITY");
        });

        it("should have TECH_NEWS value", () => {
            expect(PostType.TECH_NEWS).toBe("TECH_NEWS");
        });

        it("should have SYSTEM_UPDATE value", () => {
            expect(PostType.SYSTEM_UPDATE).toBe("SYSTEM_UPDATE");
        });

        it("should have JOB_POSTING value", () => {
            expect(PostType.JOB_POSTING).toBe("JOB_POSTING");
        });

        it("should have exactly 4 values", () => {
            expect(Object.keys(PostType)).toHaveLength(4);
        });
    });

    describe("PostCategory", () => {
        it("should have AI value", () => {
            expect(PostCategory.AI).toBe("AI");
        });

        it("should have GAME value", () => {
            expect(PostCategory.GAME).toBe("GAME");
        });

        it("should have MOBILE value", () => {
            expect(PostCategory.MOBILE).toBe("MOBILE");
        });

        it("should have BACKEND value", () => {
            expect(PostCategory.BACKEND).toBe("BACKEND");
        });

        it("should have FRONTEND value", () => {
            expect(PostCategory.FRONTEND).toBe("FRONTEND");
        });

        it("should have exactly 5 values", () => {
            expect(Object.keys(PostCategory)).toHaveLength(5);
        });
    });

    describe("NotificationType", () => {
        it("should have FOLLOW value", () => {
            expect(NotificationType.FOLLOW).toBe("FOLLOW");
        });

        it("should have NEW_POST value", () => {
            expect(NotificationType.NEW_POST).toBe("NEW_POST");
        });

        it("should have LIKE value", () => {
            expect(NotificationType.LIKE).toBe("LIKE");
        });

        it("should have COMMENT value", () => {
            expect(NotificationType.COMMENT).toBe("COMMENT");
        });

        it("should have COMMENT_LIKE value", () => {
            expect(NotificationType.COMMENT_LIKE).toBe("COMMENT_LIKE");
        });

        it("should have COMMENT_REPLY value", () => {
            expect(NotificationType.COMMENT_REPLY).toBe("COMMENT_REPLY");
        });

        it("should have QUOTE value", () => {
            expect(NotificationType.QUOTE).toBe("QUOTE");
        });

        it("should have MEDIA_REJECTED value", () => {
            expect(NotificationType.MEDIA_REJECTED).toBe("MEDIA_REJECTED");
        });

        it("should have exactly 8 values", () => {
            expect(Object.keys(NotificationType)).toHaveLength(8);
        });
    });

    describe("TokenType", () => {
        it("should have EMAIL_VERIFICATION value", () => {
            expect(TokenType.EMAIL_VERIFICATION).toBe("EMAIL_VERIFICATION");
        });

        it("should have PASSWORD_RESET value", () => {
            expect(TokenType.PASSWORD_RESET).toBe("PASSWORD_RESET");
        });

        it("should have exactly 2 values", () => {
            expect(Object.keys(TokenType)).toHaveLength(2);
        });
    });
});
