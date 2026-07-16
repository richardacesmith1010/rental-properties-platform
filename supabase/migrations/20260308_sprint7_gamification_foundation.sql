-- ============================================
-- Sprint 7: Gamification Foundation
-- Tables: user_gamification, xp_events, achievements, user_achievements
-- Functions: award_xp, update_streak
-- Applied: 2026-03-08
-- ============================================

CREATE TABLE user_gamification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_xp integer NOT NULL DEFAULT 0,
  current_level integer NOT NULL DEFAULT 1,
  streak_count integer NOT NULL DEFAULT 0,
  streak_last_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  xp_amount integer NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'trophy',
  category text NOT NULL DEFAULT 'general',
  xp_reward integer NOT NULL DEFAULT 0,
  threshold_value integer NOT NULL DEFAULT 1,
  role_scope text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_gamification_user_id ON user_gamification(user_id);
CREATE INDEX idx_xp_events_user_id ON xp_events(user_id);
CREATE INDEX idx_xp_events_created_at ON xp_events(created_at);
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);

ALTER TABLE user_gamification ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gamification" ON user_gamification FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can view own xp events" ON xp_events FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Anyone can view achievements" ON achievements FOR SELECT USING (true);
CREATE POLICY "Users can view own achievements" ON user_achievements FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION award_xp(
  p_user_id uuid, p_event_type text, p_xp_amount integer,
  p_description text DEFAULT null, p_metadata jsonb DEFAULT '{}'
) RETURNS jsonb AS $$
DECLARE v_new_total integer; v_new_level integer;
BEGIN
  INSERT INTO user_gamification (user_id, total_xp) VALUES (p_user_id, p_xp_amount)
  ON CONFLICT (user_id) DO UPDATE SET total_xp = user_gamification.total_xp + p_xp_amount, updated_at = now();
  INSERT INTO xp_events (user_id, event_type, xp_amount, description, metadata)
  VALUES (p_user_id, p_event_type, p_xp_amount, p_description, p_metadata);
  SELECT total_xp INTO v_new_total FROM user_gamification WHERE user_id = p_user_id;
  v_new_level := CASE WHEN v_new_total >= 5000 THEN 4 WHEN v_new_total >= 2000 THEN 3 WHEN v_new_total >= 500 THEN 2 ELSE 1 END;
  UPDATE user_gamification SET current_level = v_new_level WHERE user_id = p_user_id;
  RETURN jsonb_build_object('total_xp', v_new_total, 'level', v_new_level, 'xp_awarded', p_xp_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_streak(
  p_user_id uuid, p_action text DEFAULT 'increment'
) RETURNS jsonb AS $$
DECLARE v_current_streak integer; v_last_date date; v_today date := CURRENT_DATE;
BEGIN
  SELECT streak_count, streak_last_date INTO v_current_streak, v_last_date FROM user_gamification WHERE user_id = p_user_id;
  IF NOT FOUND THEN INSERT INTO user_gamification (user_id, streak_count, streak_last_date) VALUES (p_user_id, 1, v_today); RETURN jsonb_build_object('streak', 1); END IF;
  IF p_action = 'reset' THEN UPDATE user_gamification SET streak_count = 0, streak_last_date = null, updated_at = now() WHERE user_id = p_user_id; RETURN jsonb_build_object('streak', 0); END IF;
  IF v_last_date IS NULL OR (v_last_date < v_today AND EXTRACT(MONTH FROM v_last_date) != EXTRACT(MONTH FROM v_today)) THEN
    UPDATE user_gamification SET streak_count = COALESCE(v_current_streak, 0) + 1, streak_last_date = v_today, updated_at = now() WHERE user_id = p_user_id;
    RETURN jsonb_build_object('streak', COALESCE(v_current_streak, 0) + 1);
  END IF;
  RETURN jsonb_build_object('streak', COALESCE(v_current_streak, 0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO achievements (slug, title, description, icon, category, xp_reward, threshold_value, role_scope, sort_order) VALUES
('first_payment', 'First Payment', 'Made your first rent payment', 'credit-card', 'payment', 100, 1, 'tenant', 1),
('streak_3', 'Hot Streak', '3 consecutive on-time payments', 'flame', 'streak', 200, 3, 'tenant', 2),
('streak_6', 'On Fire', '6 consecutive on-time payments', 'flame', 'streak', 500, 6, 'tenant', 3),
('streak_12', 'Unstoppable', '12 consecutive on-time payments', 'flame', 'streak', 1000, 12, 'tenant', 4),
('quick_signer', 'Quick Signer', 'Signed a document within 24 hours', 'file-check', 'general', 150, 1, 'tenant', 5),
('first_property', 'First Property', 'Added your first property', 'building-2', 'property', 200, 1, 'owner', 10),
('portfolio_5', 'Portfolio Builder', 'Manage 5 or more properties', 'buildings', 'property', 500, 5, 'owner', 11),
('full_occupancy', 'Full House', 'All units are occupied', 'home', 'property', 300, 1, 'owner', 12),
('quick_responder', 'Quick Responder', 'Resolved a ticket within 24 hours', 'zap', 'maintenance', 150, 1, null, 20),
('ticket_10', 'Problem Solver', 'Resolved 10 maintenance tickets', 'wrench', 'maintenance', 300, 10, null, 21),
('zero_late_6', 'Perfect Record', '6 months with zero late fees', 'shield-check', 'payment', 500, 6, 'owner', 30),
('first_ticket', 'First Report', 'Submitted your first maintenance ticket', 'alert-circle', 'maintenance', 50, 1, 'tenant', 25);
