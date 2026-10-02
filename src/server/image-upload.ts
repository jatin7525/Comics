import sharp from "sharp";
import { AppError, ensure } from "@/domain/errors";
export async function processImage(
  file: FormDataEntryValue | null,
  width: number,
  maxBytes = 10 * 1024 * 1024,
) {
  ensure(
    file instanceof File && file.size > 0 && file.size <= maxBytes,
    "INVALID_IMAGE",
    `Upload an image up to ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
  );
  ensure(
    ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    "INVALID_IMAGE",
    "Use JPEG, PNG, or WebP images. SVG and animated images are not accepted.",
  );
  const source = Buffer.from(await file.arrayBuffer());
  const pipeline = sharp(source, {
    limitInputPixels: 25_000_000,
    failOn: "warning",
  });
  const metadata = await pipeline.metadata().catch(() => {
    throw new AppError(
      "INVALID_IMAGE",
      "This image could not be decoded. Upload a valid JPEG, PNG, or WebP.",
    );
  });
  ensure(
    ["jpeg", "png", "webp"].includes(metadata.format ?? "") &&
      (metadata.pages ?? 1) === 1,
    "INVALID_IMAGE",
    "Use a single-frame JPEG, PNG, or WebP image.",
  );
  return await pipeline
    .rotate()
    .resize({
      width: width,
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer()
    .catch(() => {
      throw new AppError(
        "INVALID_IMAGE",
        "This image is damaged or unsupported.",
      );
    });
}
