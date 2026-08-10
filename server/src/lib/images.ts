// Image magic-byte sniffing and photo-name validation live in the shared workspace so the
// browser local-folder adapter applies exactly the same checks. sniffImageExtension accepts a
// Uint8Array; Node Buffers are Uint8Array subclasses, so callers pass buffers through unchanged.
export { isStoredPhotoName, sniffImageExtension, type ImageExtension } from '@orgchartr/shared';
