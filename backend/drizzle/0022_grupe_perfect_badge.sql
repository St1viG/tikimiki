-- Custom SQL migration file, put your code below! --

-- Achievement badge awarded for a flawless Grupe run (all four groups solved
-- with zero mistakes). Awarded by GamesService.recordPlay; matched by name.
INSERT INTO "badges" ("name", "description", "category", "icon_url")
VALUES (
  'Grupe bez greške',
  'Pređena Grupe igra bez ijedne greške.',
  'achievement',
  '/badges/grupe-perfect.svg'
)
ON CONFLICT ("name") DO NOTHING;
