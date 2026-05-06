import sharp from "sharp";

import { hashBytes } from "@/lib/tokens";

export type PreprocessedImage = {
  buffer: Buffer;
  mimeType: "image/jpeg";
  imageHash: string;
  width: number;
  height: number;
  originalBytes: number;
};

export class ImageValidationError extends Error {
  code: "TOO_LARGE" | "BAD_MAGIC" | "DECOMPRESS_BOMB" | "TOO_MANY_PIXELS" | "DECODE_FAILED";

  constructor(code: ImageValidationError["code"], msg: string) {
    super(msg);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_PIXELS = 24_000_000;
const DEFAULT_LONG_EDGE = 1600;

const hasMagicBytes = (input: Buffer): boolean => {
  if (input.length < 4) return false;

  const isJpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const isPng = input[0] === 0x89 && input[1] === 0x50 && input[2] === 0x4e && input[3] === 0x47;
  const isWebp =
    input.length >= 12 &&
    input.subarray(0, 4).equals(Buffer.from("RIFF")) &&
    input.subarray(8, 12).equals(Buffer.from("WEBP"));
  const isHeic =
    input.length >= 12 &&
    input[0] === 0x00 &&
    input[1] === 0x00 &&
    input[2] === 0x00 &&
    input.subarray(4, 8).equals(Buffer.from("ftyp")) &&
    ["heic", "heix", "heif"].includes(input.subarray(8, 12).toString("ascii"));

  return isJpeg || isPng || isWebp || isHeic;
};

const isDecompressionBombError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err);
  return /pixel|limitInputPixels|Input image exceeds pixel limit/i.test(message);
};

export async function preprocessImage(
  input: Buffer,
  options?: { maxBytes?: number; maxPixels?: number; longEdge?: number },
): Promise<PreprocessedImage> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxPixels = options?.maxPixels ?? DEFAULT_MAX_PIXELS;
  const longEdge = options?.longEdge ?? DEFAULT_LONG_EDGE;

  if (input.length > maxBytes) {
    throw new ImageValidationError("TOO_LARGE", `Image is too large (${input.length} bytes)`);
  }

  if (!hasMagicBytes(input)) {
    throw new ImageValidationError("BAD_MAGIC", "Unsupported or invalid image file");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: maxPixels, failOn: "error" }).metadata();
  } catch (err) {
    if (isDecompressionBombError(err)) {
      throw new ImageValidationError("DECOMPRESS_BOMB", "Image exceeds safe decode limits");
    }
    throw new ImageValidationError("DECODE_FAILED", "Failed to decode image");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) {
    throw new ImageValidationError("DECODE_FAILED", "Image dimensions could not be determined");
  }

  if (width * height > maxPixels) {
    throw new ImageValidationError("TOO_MANY_PIXELS", `Image has too many pixels (${width}x${height})`);
  }

  let buffer: Buffer;
  let outputMetadata: sharp.Metadata;
  try {
    buffer = await sharp(input, { limitInputPixels: maxPixels, failOn: "error" })
      .rotate()
      .resize({ width: longEdge, height: longEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    outputMetadata = await sharp(buffer, { failOn: "error" }).metadata();
  } catch (err) {
    if (isDecompressionBombError(err)) {
      throw new ImageValidationError("DECOMPRESS_BOMB", "Image exceeds safe decode limits");
    }
    throw new ImageValidationError("DECODE_FAILED", "Failed to process image");
  }

  const outputWidth = outputMetadata.width ?? 0;
  const outputHeight = outputMetadata.height ?? 0;
  if (!outputWidth || !outputHeight) {
    throw new ImageValidationError("DECODE_FAILED", "Processed image dimensions could not be determined");
  }

  return {
    buffer,
    mimeType: "image/jpeg",
    imageHash: hashBytes(buffer),
    width: outputWidth,
    height: outputHeight,
    originalBytes: input.length,
  };
}
