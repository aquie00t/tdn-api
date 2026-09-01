import { describe, it, expect, beforeAll } from "vitest";
import { request, authRequest, parseBody } from "../setup";

type ErrorEnvelope = { title: string; status: number; detail: string };

const ts = Date.now();
const user = {
    email: `mod-${ts}@media-moderation-test.com`,
    password: "password123",
    username: `md${ts}`,
};

let accessToken: string;

const BOUNDARY = "----mediamoderationboundary";

/**
 * Builds a multipart body carrying one file.
 *
 * The filename and content type travel separately from the bytes so a test can
 * lie about both, which is the whole point: every upload endpoint has to decide
 * from the bytes alone.
 */
function multipart(
    bytes: Buffer,
    filename: string,
    contentType: string,
): Buffer {
    const header = Buffer.from(
        `--${BOUNDARY}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
            `Content-Type: ${contentType}\r\n\r\n`,
    );
    const footer = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);

    return Buffer.concat([header, bytes, footer]);
}

const MULTIPART_HEADERS = {
    "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
};

beforeAll(async () => {
    await request({ method: "POST", url: "/auth/register", payload: user });

    const login = await request({
        method: "POST",
        url: "/auth/login",
        payload: { identifier: user.email, password: user.password },
    });

    accessToken = parseBody<{ data: { accessToken: string } }>(login).data
        .accessToken;
});

/**
 * These cover the parts of the moderation pipeline that need neither a storage
 * backend nor a provider: the format check that runs before anything is
 * uploaded, and the ownership check that runs when content claims a key.
 *
 * The happy path needs a live R2 connection and stays out of scope here, as it
 * already does for the other upload endpoints.
 */
describe("Media moderation guards", () => {
    describe("POST /media - format checks before storage", () => {
        it("should reject an SVG that claims to be a PNG", async () => {
            // Nothing reaches storage: the type is read from the bytes, and an
            // SVG served from the CDN would be a stored XSS.
            const svg = Buffer.from(
                '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            );

            const response = await authRequest(accessToken, {
                method: "POST",
                url: "/media",
                headers: MULTIPART_HEADERS,
                payload: multipart(svg, "photo.png", "image/png"),
            });

            expect(response.statusCode).toBe(415);
            expect(parseBody<ErrorEnvelope>(response).title).toBe(
                "InvalidMediaTypeError",
            );
        });

        it("should reject HTML behind a video filename and content type", async () => {
            const html = Buffer.from(
                "<!doctype html><script>alert(1)</script>",
            );

            const response = await authRequest(accessToken, {
                method: "POST",
                url: "/media",
                headers: MULTIPART_HEADERS,
                payload: multipart(html, "clip.mp4", "video/mp4"),
            });

            expect(response.statusCode).toBe(415);
        });

        it("should reject an empty file", async () => {
            const response = await authRequest(accessToken, {
                method: "POST",
                url: "/media",
                headers: MULTIPART_HEADERS,
                payload: multipart(Buffer.alloc(0), "photo.png", "image/png"),
            });

            expect(response.statusCode).toBe(415);
        });
    });

    describe("POST /posts - media a client did not upload", () => {
        it("should refuse a media URL pointing at another origin", async () => {
            // This is the check that makes moderation mean anything: scanning
            // at upload time governs the upload endpoint, not what a client
            // puts in a post body.
            const response = await authRequest(accessToken, {
                method: "POST",
                url: "/posts",
                payload: {
                    content: "look at this",
                    mediaUrls: ["https://evil.example.com/whatever.jpg"],
                },
            });

            expect(response.statusCode).toBe(400);
            expect(parseBody<ErrorEnvelope>(response).title).toBe(
                "MediaNotOwnedError",
            );
        });

        it("should refuse a CDN-shaped URL that no upload produced", async () => {
            const response = await authRequest(accessToken, {
                method: "POST",
                url: "/posts",
                payload: {
                    content: "look at this",
                    mediaUrls: [
                        "https://pub-2e6c13927ac24d548fd5b783e3cdaeb5.r2.dev/posts/someone/else.jpg",
                    ],
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it("should still accept a post with no media at all", async () => {
            const response = await authRequest(accessToken, {
                method: "POST",
                url: "/posts",
                payload: { content: "just text" },
            });

            expect(response.statusCode).toBe(201);
        });
    });

    describe("POST /posts/:postId/comments - the same rule for comments", () => {
        let postId: string;

        beforeAll(async () => {
            const created = await authRequest(accessToken, {
                method: "POST",
                url: "/posts",
                payload: { content: "a post to comment on" },
            });

            postId = parseBody<{ data: { id: string } }>(created).data.id;
        });

        it("should refuse a media URL the commenter did not upload", async () => {
            // Comment media comes off the same endpoint as post media, so
            // leaving it unchecked would be an open side door.
            const response = await authRequest(accessToken, {
                method: "POST",
                url: `/posts/${postId}/comments`,
                payload: {
                    content: "look at this",
                    mediaUrls: ["https://evil.example.com/whatever.jpg"],
                },
            });

            expect(response.statusCode).toBe(400);
            expect(parseBody<ErrorEnvelope>(response).title).toBe(
                "MediaNotOwnedError",
            );
        });
    });

    describe("read path", () => {
        it("should report the moderation flags on a post", async () => {
            const created = await authRequest(accessToken, {
                method: "POST",
                url: "/posts",
                payload: { content: "a plain text post" },
            });

            const body = parseBody<{
                data: { isSensitive: boolean; mediaPending: boolean };
            }>(created);

            // A text-only post is clean and has nothing waiting on a scan; the
            // client needs both flags present to know it can render inline.
            expect(body.data.isSensitive).toBe(false);
            expect(body.data.mediaPending).toBe(false);
        });
    });
});
