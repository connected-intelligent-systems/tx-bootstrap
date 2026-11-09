import { describe, expect, it, vi } from "vitest";
import { readHeadscaleConfig } from "../config/headscale.js";
import { createHeadscaleClient } from "./headscale-client.js";

const config = readHeadscaleConfig({
  HEADSCALE_ENABLED: "true",
  HEADSCALE_URL: "https://headscale.example.org",
  HEADSCALE_API_KEY: "admin-secret",
  HEADSCALE_PARTICIPANT_DOMAIN: "tunnel.example.org",
});

describe("Headscale REST client (0.29.7)", () => {
  it("creates only single-use persistent tagged keys with a bounded expiration", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        preAuthKey: { id: "9007199254740993", key: "join-secret" },
      }),
    );
    const client = createHeadscaleClient(config, fetcher);
    const expiresAt = new Date("2026-11-07T12:15:00Z");
    expect(await client.createEnrollmentKey(expiresAt)).toEqual({
      id: "9007199254740993",
      key: "join-secret",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://headscale.example.org/api/v1/preauthkey",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        signal: expect.any(AbortSignal),
        headers: {
          authorization: "Bearer admin-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reusable: false,
          ephemeral: false,
          expiration: expiresAt.toISOString(),
          aclTags: ["tag:txb-participant"],
        }),
      }),
    );
  });
  it("strips enrollment secrets and unrelated peer fields from node responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        nodes: [
          {
            id: "12",
            preAuthKey: { id: "8", key: "join-secret" },
            ipAddresses: ["100.96.0.2"],
            nodeKey: "private-field",
            online: true,
          },
        ],
      }),
    );
    const nodes = await createHeadscaleClient(config, fetcher).listNodes();
    expect(nodes[0]).toMatchObject({
      id: "12",
      preAuthKey: { id: "8" },
      ipAddresses: ["100.96.0.2"],
    });
    expect(JSON.stringify(nodes)).not.toMatch(/join-secret|private-field/);
  });
  it.each([401, 500])("sanitizes upstream %s errors", async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("admin-secret join-secret", { status }));
    await expect(
      createHeadscaleClient(config, fetcher).listNodes(),
    ).rejects.toMatchObject({
      status: 502,
      message: expect.not.stringMatching(/admin-secret|join-secret/),
    });
  });
  it("sanitizes transport, timeout and malformed JSON errors without retrying POST", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("admin-secret in transport error"));
    await expect(
      createHeadscaleClient(config, fetcher).createEnrollmentKey(new Date()),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce(new Response("join-secret invalid JSON"));
    await expect(
      createHeadscaleClient(config, fetcher).listNodes(),
    ).rejects.toMatchObject({
      status: 502,
      message: expect.not.stringContaining("join-secret"),
    });
    fetcher.mockResolvedValueOnce(
      Response.json({ preAuthKey: { id: 123, key: "join-secret" } }),
    );
    await expect(
      createHeadscaleClient(config, fetcher).createEnrollmentKey(new Date()),
    ).rejects.toMatchObject({
      status: 502,
      message: "Headscale returned an invalid enrollment response",
    });
  });
  it("uses the expire and delete APIs and treats missing resources as already revoked", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("", { status: 404 }));
    const client = createHeadscaleClient(config, fetcher);
    await client.expireEnrollmentKey("7");
    await client.deleteNode("12");
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/preauthkey/expire"),
      expect.objectContaining({ method: "POST", body: '{"id":"7"}' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/node/12"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("renames nodes only to valid DNS labels", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ node: {} }));
    const client = createHeadscaleClient(config, fetcher);
    await client.renameNode("12", "bpnl000000000001");
    expect(fetcher).toHaveBeenCalledWith(
      "https://headscale.example.org/api/v1/node/12/rename/bpnl000000000001",
      expect.objectContaining({ method: "POST" }),
    );
    await expect(client.renameNode("12", "../admin")).rejects.toThrow();
    await expect(client.renameNode("12", "Upper")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
