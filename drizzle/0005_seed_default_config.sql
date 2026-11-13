-- Configuration par défaut (PRD §7.3 calendrier, §7.4 politique, §12.7 catégories, §21 paramètres).
-- Mêmes valeurs que createEmptyDatabase (src/server/db/schema.ts). Idempotent : sans effet si déjà présent.
INSERT INTO "service_calendar" ("id", "name", "timezone", "working_days", "periods", "is_active")
VALUES ('cal_default', 'Calendrier de service principal', 'Africa/Abidjan', '{1,2,3,4,5}',
        '[{"start":"08:00","end":"12:00"},{"start":"13:00","end":"17:00"}]'::jsonb, true)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "service_policy" ("id", "calendar_id", "response_target_working_minutes", "reminder_50_enabled", "reminder_75_enabled",
                              "overdue_escalation_working_minutes", "calendar_snapshot", "effective_from")
VALUES ('pol_initial', 'cal_default', 1440, true, true, 480,
        '{"timezone":"Africa/Abidjan","working_days":[1,2,3,4,5],"periods":[{"start":"08:00","end":"12:00"},{"start":"13:00","end":"17:00"}]}'::jsonb,
        -- Valable depuis l'origine : toute date de soumission dispose d'une politique applicable.
        '2000-01-01T00:00:00Z')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "coaching_category" ("id", "name", "description", "is_active", "sort_order") VALUES
  ('cat_1', 'Objectifs et plan d’action', 'Clarifier un objectif, le découper en étapes, planifier.', true, 1),
  ('cat_2', 'Organisation et gestion du temps', 'Priorités, méthode de travail, régularité.', true, 2),
  ('cat_3', 'Blocages et prise de décision', 'Lever un frein, hésiter entre plusieurs options.', true, 3),
  ('cat_4', 'Compétences et apprentissage', 'Progresser sur un savoir-faire ou une connaissance.', true, 4),
  ('cat_5', 'Suivi et bilan', 'Faire le point sur l’avancement et ajuster.', true, 5)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_settings" ("id") VALUES ('app') ON CONFLICT ("id") DO NOTHING;
