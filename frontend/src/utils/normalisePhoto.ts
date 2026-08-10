import {
  MAX_PHOTO_SIZE,
  sniffImageExtension,
  type ImageExtension,
} from '@orgchartr/shared';

const MAX_IMAGE_PIXELS = 40_000_000;
const MIME_BY_EXTENSION: Record<ImageExtension, string> = {
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export interface NormalisedPhoto {
  data: Uint8Array;
  extension: ImageExtension;
  mimeType: string;
  metadataRemoved: boolean;
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process that photo.'))),
      mimeType,
      mimeType === 'image/png' ? undefined : 0.9,
    );
  });
}

export async function normalisePhoto(data: Uint8Array): Promise<NormalisedPhoto> {
  const extension = sniffImageExtension(data);
  if (!extension) throw new Error('Unsupported file type. Use JPEG, PNG, WEBP, or GIF.');
  const mimeType = MIME_BY_EXTENSION[extension];

  // Canvas would flatten an animated GIF to one frame. Keep it byte-for-byte instead.
  if (extension === '.gif') {
    return { data, extension, mimeType, metadataRemoved: false };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([data as BlobPart], { type: mimeType }));
  } catch {
    throw new Error('The photo could not be decoded.');
  }

  try {
    if (
      bitmap.width <= 0
      || bitmap.height <= 0
      || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS
    ) {
      throw new Error('The photo dimensions are too large. Use an image smaller than 40 megapixels.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process that photo.');
    context.drawImage(bitmap, 0, 0);

    const blob = await canvasBlob(canvas, mimeType);
    if (blob.size > MAX_PHOTO_SIZE) {
      throw new Error('The processed photo is larger than the 5 MB limit.');
    }
    const normalised = new Uint8Array(await blob.arrayBuffer());
    if (sniffImageExtension(normalised) !== extension) {
      throw new Error('The browser could not preserve the photo format.');
    }
    return { data: normalised, extension, mimeType, metadataRemoved: true };
  } finally {
    bitmap.close();
  }
}