-- Custom SQL migration file, put your code below! --

-- Repurpose the seeded "Konfete" banner effect into the neon profile
-- decoration (rendered on the profile popup banner + cohor member cards).
UPDATE "cosmetic_items"
SET
  "type" = 'avatar_decoration',
  "name" = 'Neon dekoracija',
  "description" = 'Neonski okvir na profilu.',
  "render_data" = '{"frame": "neon", "glow": "#A78BFA"}'::jsonb
WHERE "name" = 'Konfete';
