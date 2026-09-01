import { describe, expect, it, beforeEach } from "vitest";
import { HeuristicLanguageDetectionService } from "@infrastructure/external/heuristic-language-detection.service";

describe("HeuristicLanguageDetectionService", () => {
    let detector: HeuristicLanguageDetectionService;

    beforeEach(() => {
        detector = new HeuristicLanguageDetectionService();
    });

    describe("Turkish", () => {
        it.each([
            "Bugün yeni bir proje üzerinde çalışmaya başladım ve çok keyifliydi",
            "Bu hatayı çözmek için ne yapmam gerektiğini bilmiyorum, yardım eder misiniz",
            "Yeni sürüm çıktı, herkese iyi çalışmalar dilerim",
        ])("should detect %s as Turkish", async (text) => {
            await expect(detector.detect(text)).resolves.toBe("tr");
        });

        it("should still detect Turkish in a post full of English tech terms", async () => {
            // The common case on a developer network: Turkish function words
            // carrying English nouns. Vocabulary would call this English;
            // function words do not.
            await expect(
                detector.detect(
                    "React Query ile server state yönetimi için yeni bir hook yazdım, cache invalidation çok daha temiz oldu",
                ),
            ).resolves.toBe("tr");
        });
    });

    describe("English", () => {
        it.each([
            "I have been working on a new project and it has been a lot of fun",
            "Does anyone know how to fix this error, I have tried everything",
            "The new release is out, thanks to everyone who contributed",
        ])("should detect %s as English", async (text) => {
            await expect(detector.detect(text)).resolves.toBe("en");
        });

        it("should not read the pronoun I as a Turkish letter", async () => {
            // Lowercasing with the Turkish locale maps "I" onto "ı", which
            // would hand every English sentence a Turkish-only letter.
            await expect(
                detector.detect(
                    "I think I will refactor this service and I will ship it today",
                ),
            ).resolves.toBe("en");
        });
    });

    describe("refusing to guess", () => {
        it("should return null for a link-only post", async () => {
            await expect(
                detector.detect("https://github.com/anthropics/claude-code"),
            ).resolves.toBeNull();
        });

        it("should return null for an emoji-only post", async () => {
            await expect(detector.detect("🚀🚀🚀")).resolves.toBeNull();
        });

        it("should return null for text too short to judge", async () => {
            await expect(detector.detect("merhaba")).resolves.toBeNull();
        });

        it("should return null for an empty post", async () => {
            await expect(detector.detect("")).resolves.toBeNull();
        });

        it("should return null for a post that is only a code block", async () => {
            await expect(
                detector.detect(
                    "```ts\nconst server = fastify();\nawait server.listen({ port: 3000 });\n```",
                ),
            ).resolves.toBeNull();
        });

        it("should return null when both languages are equally represented", async () => {
            // A bilingual post labelled either way is pushed out of the feed
            // it half belongs to; unknown keeps it in both.
            await expect(
                detector.detect("this is a test bu bir test"),
            ).resolves.toBeNull();
        });
    });

    describe("noise", () => {
        it("should ignore handles and hashtags when judging", async () => {
            // The mentions are Turkish-looking but the sentence is not; only
            // the sentence should count.
            await expect(
                detector.detect(
                    "@gunesyasin #yazılım #geliştirici I will be shipping the new release today and it should be fine",
                ),
            ).resolves.toBe("en");
        });

        it("should ignore a stack trace wrapped around a Turkish sentence", async () => {
            await expect(
                detector.detect(
                    "`TypeError: cannot read property of undefined` hatası alıyorum ve bu sorunu bir türlü çözemedim",
                ),
            ).resolves.toBe("tr");
        });
    });
});
