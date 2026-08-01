/** Longest edge, in pixels, that an embedded image is allowed to keep. */
const MAX_DIMENSION = 1600;

/** Images below this size are embedded untouched. */
const MAX_INLINE_BYTES = 512 * 1024;

export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

/**
 * Shrinks oversized images before they are embedded.
 *
 * Documents store images as base64 data URIs, which inflates them by ~33%.
 * Dropping a 12MP photo in unmodified would produce a document many
 * megabytes larger than the app itself.
 */
export function downscaleDataUri(dataUri: string): Promise<string> {
  return new Promise((resolve) => {
    // SVG is resolution-independent; rasterising it would only lose quality.
    if (dataUri.startsWith("data:image/svg+xml")) {
      resolve(dataUri);
      return;
    }

    const img = new globalThis.Image();

    img.onload = () => {
      const longestEdge = Math.max(img.width, img.height);
      const scale = Math.min(1, MAX_DIMENSION / longestEdge);

      if (scale === 1 && dataUri.length < MAX_INLINE_BYTES) {
        resolve(dataUri);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUri);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Re-encoding a PNG as JPEG would flatten transparency to black, so
      // only formats that never had an alpha channel become JPEG.
      const sourceMime = /^data:(image\/[a-z+]+)/.exec(dataUri)?.[1];
      const outputMime = sourceMime === "image/jpeg" ? "image/jpeg" : "image/png";

      const resized = canvas.toDataURL(outputMime, 0.85);
      resolve(resized.length < dataUri.length ? resized : dataUri);
    };

    // If the image cannot be decoded, embed it as-is rather than losing it.
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}
