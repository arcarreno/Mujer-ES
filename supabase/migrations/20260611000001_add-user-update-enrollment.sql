DROP POLICY IF EXISTS "users update own enrollments" ON public.course_enrollments;
CREATE POLICY "users update own enrollments" ON public.course_enrollments FOR UPDATE TO authenticated USING (user_id = auth.uid());
