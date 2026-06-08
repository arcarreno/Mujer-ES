-- Add concluded column to courses table
ALTER TABLE courses ADD COLUMN concluded BOOLEAN NOT NULL DEFAULT false;

-- Admin policies for concluded (already covered by existing admin policies on courses)
-- RLS: public can only read non-concluded published courses (handled by listPublishedCourses query filter)
