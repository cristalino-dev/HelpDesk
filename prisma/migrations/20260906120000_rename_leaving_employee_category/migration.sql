-- Rename the offboarding category: "עובד עוזב" → "סגירת משתמש".
--
-- The label is not decoration. lib/offboarding.ts matches on this exact string
-- to decide whether a ticket is an offboarding procedure — which builds its
-- checklist and blocks its closure — so the constant and the stored data have
-- to move together or every existing offboarding ticket silently stops being
-- one, taking its close-guard with it.
--
-- Three places hold it: the option in the dropdown, the category on tickets
-- already filed, and (harmlessly) nothing in TicketHistory, because a category
-- change is recorded there as a generic "edited" row with no values.

-- 1. The dropdown option. Guarded against the new label already existing —
--    FieldOption has UNIQUE (field, label), and an unguarded UPDATE would abort
--    the whole migration rather than skip.
UPDATE "FieldOption"
   SET label = 'סגירת משתמש'
 WHERE field = 'category'
   AND label = 'עובד עוזב'
   AND NOT EXISTS (
     SELECT 1 FROM "FieldOption" WHERE field = 'category' AND label = 'סגירת משתמש'
   );

-- 2. If both labels somehow existed, the old one is now redundant. Tickets are
--    repointed in step 3 regardless, so nothing is orphaned by this.
DELETE FROM "FieldOption" WHERE field = 'category' AND label = 'עובד עוזב';

-- 3. Tickets already filed under the old name. Without this they keep a
--    category no option matches: their checklist stops being enforced and they
--    become closable with lines still unticked.
UPDATE "Ticket" SET category = 'סגירת משתמש' WHERE category = 'עובד עוזב';
