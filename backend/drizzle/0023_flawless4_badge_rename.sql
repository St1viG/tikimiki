-- Custom SQL migration file, put your code below! --

-- Rename the perfect-Grupe badge to the language-neutral "Flawless4" and give
-- it its own circular icon. The stored description is the English fallback;
-- the frontend translates known badge names via its i18n map.
UPDATE "badges"
SET
  "name" = 'Flawless4',
  "description" = 'Complete the Groups daily game without a single mistake.',
  "icon_url" = '/badges/flawless4.svg'
WHERE "name" = 'Grupe bez greške';
