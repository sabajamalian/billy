import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { ImageValidationError, preprocessImage } from "@/server/ocr/preprocess";

const expectCode = async (promise: Promise<unknown>, code: ImageValidationError["code"]) => {
  await expect(promise).rejects.toMatchObject({ code });
};

describe("preprocessImage", () => {
  it("rejects empty buffers", async () => {
    await expectCode(preprocessImage(Buffer.alloc(0)), "BAD_MAGIC");
  });

  it("rejects text payloads", async () => {
    await expectCode(preprocessImage(Buffer.from("not an image")), "BAD_MAGIC");
  });

  it("accepts a valid JPEG", async () => {
    const input = await sharp({ create: { width: 100, height: 50, channels: 3, background: "white" } })
      .jpeg()
      .toBuffer();

    const result = await preprocessImage(input);

    expect(result.mimeType).toBe("image/jpeg");
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(result.originalBytes).toBe(input.length);
    expect(result.imageHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("downscales images to the requested long edge", async () => {
    const input = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "white" } })
      .jpeg()
      .toBuffer();

    const result = await preprocessImage(input);

    expect(result.width).toBe(1600);
    expect(result.height).toBe(1067);
  });

  it("does not upscale smaller images", async () => {
    const input = await sharp({ create: { width: 800, height: 600, channels: 3, background: "white" } })
      .jpeg()
      .toBuffer();

    const result = await preprocessImage(input);

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("rejects buffers above maxBytes", async () => {
    const input = await sharp({ create: { width: 100, height: 100, channels: 3, background: "white" } })
      .jpeg()
      .toBuffer();

    await expectCode(preprocessImage(input, { maxBytes: 10 }), "TOO_LARGE");
  });
});
