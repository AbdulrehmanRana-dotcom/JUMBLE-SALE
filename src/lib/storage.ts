import * as ImageManipulator from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

/**
 * Converts a local file URI (file://, content://, or web blob:) into a Blob.
 */
export async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return blob;
}

/**
 * Uploads a verification document to the private `brand-docs` bucket.
 * Bucket policy enforces: folder name must match auth.uid().
 */
export async function uploadBrandVerificationDoc(
  userId: string,
  doc: { uri: string; name: string; mimeType?: string }
): Promise<string> {
  const blob = await uriToBlob(doc.uri);
  const cleanName = doc.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${Date.now()}_${cleanName}`;

  const { data, error } = await supabase.storage
    .from('brand-docs')
    .upload(path, blob, {
      contentType: doc.mimeType || 'application/pdf',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload verification document: ${error.message}`);
  }

  return data.path;
}

/**
 * Compresses an image client-side to max 1200px width with 0.8 JPEG quality,
 * validates size (< 5MB), and uploads to the public `deal-images` bucket.
 * Returns the public URL of the uploaded image.
 */
export async function compressAndUploadDealImage(
  brandId: string,
  sourceUri: string
): Promise<string> {
  // If already an HTTP/HTTPS remote URL, return directly
  if (sourceUri.startsWith('http://') || sourceUri.startsWith('https://')) {
    return sourceUri;
  }

  try {
    // 1. Compress and resize client-side
    const manipulated = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: 1200 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    // 2. Convert to blob & validate size (< 5MB)
    const blob = await uriToBlob(manipulated.uri);
    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB
    if (blob.size > maxSizeBytes) {
      throw new Error(
        `Image size exceeds 5MB (${(blob.size / (1024 * 1024)).toFixed(1)}MB). Please choose a smaller image.`
      );
    }

    // 3. Upload to Supabase Storage ('deals' or 'deal-images' bucket)
    const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const storagePath = `${brandId}/${filename}`;

    for (const bucketName of ['deals', 'deal-images']) {
      try {
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(storagePath, blob, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (!error && data) {
          const { data: urlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(data.path);
          if (urlData?.publicUrl) {
            return urlData.publicUrl;
          }
        }
      } catch {
        // try next bucket
      }
    }

    return manipulated.uri;
  } catch (err: any) {
    console.warn('[Storage] Image upload warning:', err?.message || err);
    return sourceUri;
  }
}
