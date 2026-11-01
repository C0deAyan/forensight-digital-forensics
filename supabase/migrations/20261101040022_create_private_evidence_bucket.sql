/*
# Create private evidence storage bucket

Plain-English summary: creates a private storage area for original evidence files. Files are kept exactly as uploaded and can only be read by the investigator who uploaded them.

## 1. New storage
- Bucket `evidence`: private (not public), 50 MB per-file limit.

## 2. Security
- Each file must live in a folder named after the uploading user's ID. Users cannot write into another user's folder.
- Users can insert and read their own evidence files only.
- No UPDATE or DELETE policies exist, so stored evidence cannot be overwritten or removed through the app.

## 3. Important notes
1. Public access is disabled, so files are reachable only with a valid signed-in session.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('evidence', 'evidence', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "evidence_insert_own_folder" ON storage.objects;
CREATE POLICY "evidence_insert_own_folder" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "evidence_select_own_folder" ON storage.objects;
CREATE POLICY "evidence_select_own_folder" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
