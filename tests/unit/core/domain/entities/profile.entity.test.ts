import { describe, it, expect } from "vitest";
import { Profile } from "@core/domain/entities/profile.entity";
import type { ProfileProps } from "@core/domain/interfaces/profile-props.interface";

function buildProps(overrides: Partial<ProfileProps> = {}): ProfileProps {
    return {
        id: "profile-1",
        userId: "user-1",
        username: "johndoe",
        fullName: "John Doe",
        bio: null,
        location: null,
        avatarUrl: "https://cdn.example.com/default-avatar.jpg",
        bannerUrl: "https://cdn.example.com/default-banner.jpg",
        socials: null,
        categories: [],
        languages: [],
        followersCount: 0,
        followingCount: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    };
}

describe("Profile Entity", () => {
    describe("Getters", () => {
        it("should return correct id", () => {
            const profile = Profile.with(buildProps());
            expect(profile.id).toBe("profile-1");
        });

        it("should return correct userId", () => {
            const profile = Profile.with(buildProps());
            expect(profile.userId).toBe("user-1");
        });

        it("should return correct username", () => {
            const profile = Profile.with(buildProps());
            expect(profile.username).toBe("johndoe");
        });

        it("should return correct fullName", () => {
            const profile = Profile.with(buildProps());
            expect(profile.fullName).toBe("John Doe");
        });

        it("should return bio as null when not set", () => {
            const profile = Profile.with(buildProps({ bio: null }));
            expect(profile.bio).toBeNull();
        });

        it("should return bio when set", () => {
            const profile = Profile.with(
                buildProps({ bio: "Software engineer" }),
            );
            expect(profile.bio).toBe("Software engineer");
        });

        it("should return location as null when not set", () => {
            const profile = Profile.with(buildProps({ location: null }));
            expect(profile.location).toBeNull();
        });

        it("should return location when set", () => {
            const profile = Profile.with(
                buildProps({ location: "Istanbul, TR" }),
            );
            expect(profile.location).toBe("Istanbul, TR");
        });

        it("should return correct avatarUrl", () => {
            const profile = Profile.with(buildProps());
            expect(profile.avatarUrl).toBe(
                "https://cdn.example.com/default-avatar.jpg",
            );
        });

        it("should return correct bannerUrl", () => {
            const profile = Profile.with(buildProps());
            expect(profile.bannerUrl).toBe(
                "https://cdn.example.com/default-banner.jpg",
            );
        });

        it("should return empty object for socials when null", () => {
            const profile = Profile.with(buildProps({ socials: null }));
            expect(profile.socials).toEqual({});
        });

        it("should return socials when set", () => {
            const socials = {
                github: "https://github.com/johndoe",
                twitter: "https://twitter.com/johndoe",
            };
            const profile = Profile.with(buildProps({ socials }));
            expect(profile.socials).toEqual(socials);
        });

        it("should return correct followersCount", () => {
            const profile = Profile.with(buildProps({ followersCount: 42 }));
            expect(profile.followersCount).toBe(42);
        });

        it("should return correct followingCount", () => {
            const profile = Profile.with(buildProps({ followingCount: 10 }));
            expect(profile.followingCount).toBe(10);
        });

        it("should return correct createdAt", () => {
            const profile = Profile.with(buildProps());
            expect(profile.createdAt).toEqual(new Date("2024-01-01T00:00:00Z"));
        });
    });

    describe("update()", () => {
        it("should update fullName", () => {
            const profile = Profile.with(buildProps({ fullName: "Old Name" }));
            profile.update({ fullName: "New Name" });
            expect(profile.fullName).toBe("New Name");
        });

        it("should update bio", () => {
            const profile = Profile.with(buildProps({ bio: null }));
            profile.update({ bio: "New bio" });
            expect(profile.bio).toBe("New bio");
        });

        it("should update location", () => {
            const profile = Profile.with(buildProps({ location: null }));
            profile.update({ location: "Ankara, TR" });
            expect(profile.location).toBe("Ankara, TR");
        });

        it("should update socials", () => {
            const profile = Profile.with(buildProps({ socials: null }));
            profile.update({ socials: { github: "https://github.com/new" } });
            expect(profile.socials).toEqual({
                github: "https://github.com/new",
            });
        });

        it("should update updatedAt timestamp", () => {
            const profile = Profile.with(
                buildProps({ updatedAt: new Date("2024-01-01T00:00:00Z") }),
            );
            const before = new Date();
            profile.update({ fullName: "Updated" });
            expect(profile.updatedAt.getTime()).toBeGreaterThanOrEqual(
                before.getTime(),
            );
        });

        it("should only update provided fields (partial update)", () => {
            const profile = Profile.with(
                buildProps({ fullName: "John Doe", bio: "Old bio" }),
            );
            profile.update({ fullName: "Jane Doe" });
            expect(profile.bio).toBe("Old bio");
        });

        it("should not alter other fields when doing partial update", () => {
            const profile = Profile.with(
                buildProps({ followersCount: 100, followingCount: 50 }),
            );
            profile.update({ bio: "New bio" });
            expect(profile.followersCount).toBe(100);
            expect(profile.followingCount).toBe(50);
        });
    });
});
