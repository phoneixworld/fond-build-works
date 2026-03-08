-- Create a public storage bucket for project app assets (images, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('app-assets', 'app-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files to their project folder
CREATE POLICY "Users can upload app assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'app-assets');

-- Allow public read access to all app assets
CREATE POLICY "Public read access for app assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'app-assets');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Users can delete own app assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'app-assets' AND (storage.foldername(name))[1] = auth.uid()::text);