-- Add event scheduling and image support to courses

-- New columns for event scheduling
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS event_time TIME;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS event_duration_minutes INTEGER;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- Gallery images table
CREATE TABLE IF NOT EXISTS public.course_images (
  id UUID DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES public.courses ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_images_course_id ON public.course_images(course_id);

-- RLS: admins can manage course images (same policy as courses)
DROP POLICY IF EXISTS "admins manage course images" ON public.course_images;
CREATE POLICY "admins manage course images" ON public.course_images
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admins
      WHERE admins.id = auth.uid()
    )
  );

-- RLS: anyone can read course images (for public course display)
DROP POLICY IF EXISTS "public read course images" ON public.course_images;
CREATE POLICY "public read course images" ON public.course_images
  FOR SELECT USING (true);

-- Storage bucket for course images
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-images', 'course-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Course images upload admin" ON storage.objects;
CREATE POLICY "Course images upload admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'course-images'
    AND EXISTS (
      SELECT 1 FROM public.admins
      WHERE admins.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Course images public read" ON storage.objects;
CREATE POLICY "Course images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'course-images');

DROP POLICY IF EXISTS "Course images delete admin" ON storage.objects;
CREATE POLICY "Course images delete admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'course-images'
    AND EXISTS (
      SELECT 1 FROM public.admins
      WHERE admins.id = auth.uid()
    )
  );
