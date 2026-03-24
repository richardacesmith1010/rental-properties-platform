CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'other')),
  message TEXT NOT NULL,
  email TEXT,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  page_url TEXT,
  user_agent TEXT,
  viewport TEXT,
  user_role TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved', 'wontfix')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit feedback" ON feedback;
CREATE POLICY "Anyone can submit feedback" ON feedback
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Owner can view feedback" ON feedback;
CREATE POLICY "Owner can view feedback" ON feedback
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id
      FROM profiles
      WHERE email = 'richard.ace.smith@gmail.com'
    )
  );

DROP POLICY IF EXISTS "Owner can update feedback" ON feedback;
CREATE POLICY "Owner can update feedback" ON feedback
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id
      FROM profiles
      WHERE email = 'richard.ace.smith@gmail.com'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id
      FROM profiles
      WHERE email = 'richard.ace.smith@gmail.com'
    )
  );
