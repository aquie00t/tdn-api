import { describe, expect, it } from "vitest";
import { ProfilePrismaMapper } from "@infrastructure/persistence/mappers/profile-prisma.mapper";
import type { Profile as PrismaProfile } from "@generated/prisma/client";
import { PostCategory } from "@core/domain/enums/post-category-enum";

const now = new Date("2025-01-01T00:00:00.000Z");

type DbProfile = PrismaProfile & {
    user?: {
        username: string;
        _count?: { followers: number; following: number };
    };
};

function makeDbProfile(overrides: Partial<DbProfile> = {}): DbProfile {
    return {
        id: "profile-1",
        userId: "user-1",
        fullName: "Test User",
        bio: null,
        location: null,
        avatarUrl: "uploads/avatar.jpg",
        bannerUrl: "uploads/banner.jpg",
        socials: null,
        categories: [],
        createdAt: now,
        updatedAt: now,
        user: {
            username: "testuser",
            _count: { followers: 10, following: 5 },
        },
        ...overrides,
    } as DbProfile;
}

describe("ProfilePrismaMapper", () => {
    describe("toDomain", () => {
        it("should map all base fields correctly", () => {
            const profile = ProfilePrismaMapper.toDomain(makeDbProfile());

            expect(profile.id).toBe("profile-1");
            expect(profile.userId).toBe("user-1");
            expect(profile.fullName).toBe("Test User");
            expect(profile.avatarUrl).toBe("uploads/avatar.jpg");
            expect(profile.bannerUrl).toBe("uploads/banner.jpg");
            expect(profile.createdAt).toBe(now);
        });

        it("should map categories", () => {
            const profile = ProfilePrismaMapper.toDomain(
                makeDbProfile({
                    categories: [PostCategory.BACKEND, PostCategory.AI],
                }),
            );

            expect(profile.categories).toEqual([
                PostCategory.BACKEND,
                PostCategory.AI,
            ]);
        });

        it("should map followersCount and followingCount from _count", () => {
            const profile = ProfilePrismaMapper.toDomain(makeDbProfile());

            expect(profile.followersCount).toBe(10);
            expect(profile.followingCount).toBe(5);
        });

        it("should default followersCount and followingCount to 0 when _count is absent", () => {
            const profile = ProfilePrismaMapper.toDomain(
                makeDbProfile({ user: { username: "testuser" } }),
            );

            expect(profile.followersCount).toBe(0);
            expect(profile.followingCount).toBe(0);
        });

        it("should use 'unknown' as username when user relation is absent", () => {
            const profile = ProfilePrismaMapper.toDomain(
                makeDbProfile({ user: undefined }),
            );

            expect(profile.username).toBe("unknown");
        });

        it("should map username from user relation", () => {
            const profile = ProfilePrismaMapper.toDomain(makeDbProfile());

            expect(profile.username).toBe("testuser");
        });

        it("should handle null bio and location", () => {
            const profile = ProfilePrismaMapper.toDomain(makeDbProfile());

            expect(profile.bio).toBeNull();
            expect(profile.location).toBeNull();
        });

        it("should map null socials to empty object via entity getter", () => {
            const profile = ProfilePrismaMapper.toDomain(
                makeDbProfile({ socials: null }),
            );

            expect(profile.socials).toEqual({});
        });
    });

    describe("toResponse", () => {
        it("should expose userId as id (not profile.id)", () => {
            const profile = ProfilePrismaMapper.toDomain(makeDbProfile());
            const result = ProfilePrismaMapper.toResponse(profile);

            expect(result.id).toBe("user-1");
        });

        it("should map all response fields", () => {
            const profile = ProfilePrismaMapper.toDomain(makeDbProfile());
            const result = ProfilePrismaMapper.toResponse(profile);

            expect(result.username).toBe("testuser");
            expect(result.fullName).toBe("Test User");
            expect(result.bio).toBeNull();
            expect(result.location).toBeNull();
            expect(result.avatarUrl).toBe("uploads/avatar.jpg");
            expect(result.bannerUrl).toBe("uploads/banner.jpg");
            expect(result.followersCount).toBe(10);
            expect(result.followingCount).toBe(5);
            expect(result.categories).toEqual([]);
        });
    });

    describe("toPrismaUpdate", () => {
        it("should map fullName, bio, location, socials", () => {
            const result = ProfilePrismaMapper.toPrismaUpdate({
                userId: "user-1",
                fullName: "Updated Name",
                bio: "My bio",
                location: "Istanbul",
                socials: { twitter: "https://x.com/user" },
            });

            expect(result.fullName).toBe("Updated Name");
            expect(result.bio).toBe("My bio");
            expect(result.location).toBe("Istanbul");
            expect(result.socials).toEqual({ twitter: "https://x.com/user" });
        });

        it("should map categories when provided", () => {
            const result = ProfilePrismaMapper.toPrismaUpdate({
                userId: "user-1",
                categories: [PostCategory.BACKEND],
            });

            expect(result.categories).toEqual([PostCategory.BACKEND]);
        });

        it("should leave categories undefined when omitted so Prisma skips them", () => {
            const result = ProfilePrismaMapper.toPrismaUpdate({
                userId: "user-1",
            });

            expect(result.categories).toBeUndefined();
        });

        it("should automatically set updatedAt", () => {
            const before = new Date();
            const result = ProfilePrismaMapper.toPrismaUpdate({
                userId: "user-1",
            });
            const after = new Date();

            expect(result.updatedAt).toBeInstanceOf(Date);
            expect((result.updatedAt as Date).getTime()).toBeGreaterThanOrEqual(
                before.getTime(),
            );
            expect((result.updatedAt as Date).getTime()).toBeLessThanOrEqual(
                after.getTime(),
            );
        });

        it("should not include avatarUrl or bannerUrl", () => {
            const result = ProfilePrismaMapper.toPrismaUpdate({
                userId: "user-1",
            });

            expect(result).not.toHaveProperty("avatarUrl");
            expect(result).not.toHaveProperty("bannerUrl");
        });

        it("should allow null bio and location to clear values", () => {
            const result = ProfilePrismaMapper.toPrismaUpdate({
                userId: "user-1",
                bio: null,
                location: null,
            });

            expect(result.bio).toBeNull();
            expect(result.location).toBeNull();
        });
    });
});
