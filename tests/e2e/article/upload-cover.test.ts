import { describe, it, expect, beforeAll } from "vitest";
import { request, authRequest, parseBody } from "../setup";

type ErrorEnvelope = { title: string; status: number; detail: string };

const ts = Date.now();
const user = {
    email: `cover-${ts}@article-cover-test.com`,
    password: "password123",
    username: `cv${ts}`,
};

let accessToken: string;

const BOUNDARY = "----articlecoverboundary";

/**
 * Builds a multipart body carrying one file.
 *
 * The filename and content type are supplied separately from the bytes so a
 * test can lie about both, which is the whole point: the API must decide from
 * the bytes alone.
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
 * Note: the happy path is not covered here. A successful upload needs a live
 * R2 connection, which CI does not have, matching how the post media upload
 * suite is written. Every case below is rejected before storage is reached,
 * which is exactly where the security-relevant behaviour lives.
 */
describe("POST /articles/cover", () => {
    it("should require authentication", async () => {
        const response = await request({
            method: "POST",
            url: "/articles/cover",
            headers: MULTIPART_HEADERS,
            payload: multipart(
                Buffer.from([0xff, 0xd8, 0xff, 0x00]),
                "cover.jpg",
                "image/jpeg",
            ),
        });

        expect(response.statusCode).toBe(401);
    });

    it("should reject a request that is not multipart", async () => {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: "/articles/cover",
            payload: { file: "not-multipart" },
        });

        expect(response.statusCode).toBe(400);
        expect(parseBody<ErrorEnvelope>(response).title).toBe(
            "NoMediaProvidedError",
        );
    });

    it("should reject an SVG that claims to be a PNG", async () => {
        const svg = Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        );

        const response = await authRequest(accessToken, {
            method: "POST",
            url: "/articles/cover",
            headers: MULTIPART_HEADERS,
            payload: multipart(svg, "cover.png", "image/png"),
        });

        expect(response.statusCode).toBe(415);
        expect(parseBody<ErrorEnvelope>(response).title).toBe(
            "InvalidFileTypeError",
        );
    });

    it("should reject HTML behind an image filename and content type", async () => {
        const html = Buffer.from("<!doctype html><script>alert(1)</script>");

        const response = await authRequest(accessToken, {
            method: "POST",
            url: "/articles/cover",
            headers: MULTIPART_HEADERS,
            payload: multipart(html, "cover.jpeg", "image/jpeg"),
        });

        expect(response.statusCode).toBe(415);
    });

    it("should reject an empty file", async () => {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: "/articles/cover",
            headers: MULTIPART_HEADERS,
            payload: multipart(Buffer.alloc(0), "cover.png", "image/png"),
        });

        expect(response.statusCode).toBe(415);
    });

    it("should reject a file whose name carries a path traversal", async () => {
        const html = Buffer.from("<!doctype html>");

        const response = await authRequest(accessToken, {
            method: "POST",
            url: "/articles/cover",
            headers: MULTIPART_HEADERS,
            payload: multipart(html, "../../../etc/passwd.png", "image/png"),
        });

        // Rejected on its bytes; the name never reaches a storage key at all.
        expect(response.statusCode).toBe(415);
    });
});
