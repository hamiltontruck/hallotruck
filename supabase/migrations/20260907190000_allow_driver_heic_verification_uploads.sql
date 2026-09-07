-- Allow mobile-camera HEIC/HEIF files for Driver verification uploads.
-- This changes bucket MIME metadata only; no production rows are rewritten.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf'
]::text[]
where id = 'driver-verification';
