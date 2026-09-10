ALTER TABLE `release_publications`
  MODIFY COLUMN `source_revision` CHAR(40) NULL,
  ADD COLUMN `origin` VARCHAR(16) NOT NULL DEFAULT 'deployment',
  ADD COLUMN `lock_version` INTEGER NOT NULL DEFAULT 1;

CREATE TABLE `release_publication_revisions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `release_publication_id` INTEGER NOT NULL,
  `revision_version` INTEGER NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `before_snapshot` JSON NULL,
  `after_snapshot` JSON NOT NULL,
  `actor_user_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `release_pub_revision_version_key` (`release_publication_id`, `revision_version`),
  INDEX `release_pub_revision_lookup_idx` (`release_publication_id`, `deleted_at`, `revision_version`),
  INDEX `release_pub_revision_actor_idx` (`actor_user_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `release_pub_revision_release_fkey` FOREIGN KEY (`release_publication_id`) REFERENCES `release_publications` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `release_pub_revision_actor_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `permissions` (`name`,`code`,`type`,`module`,`description`,`is_system`,`created_at`,`updated_at`)
VALUES ('维护运营发布时间线','backoffice:releases:write','api','backoffice','附理由补录和更正发布时间线',TRUE,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `deleted_at`=NULL,`updated_at`=UTC_TIMESTAMP(3);
INSERT INTO `role_permissions` (`role_id`,`permission_id`,`created_at`,`updated_at`)
SELECT r.id,p.id,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3) FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('admin','operator') AND r.deleted_at IS NULL AND p.code='backoffice:releases:write' AND p.deleted_at IS NULL
ON DUPLICATE KEY UPDATE `deleted_at`=NULL,`updated_at`=UTC_TIMESTAMP(3);

-- Verified staging releases from 2026-09-07 JST. 243bc6d67c67 was still in
-- progress in the saved evidence and is deliberately excluded.
INSERT IGNORE INTO `release_publications`
  (`deployment_id`,`environment`,`version`,`source_revision`,`previous_revision`,`kind`,`changes`,`published_at`,`payload_hash`,`origin`,`lock_version`,`created_at`,`updated_at`)
VALUES
('0fde8bc0-6e58-4cec-bc2f-528c2620b762','staging','bc6db4a05d44','bc6db4a05d44d49edf9484429f4f290d2faf48d6','6611b726fc820274c711a778475362584d6e4ec9','release',JSON_ARRAY('chore(groups): mark Prisma query import as type-only'),'2026-09-06 16:00:39.709',SHA2(CONCAT('staging','0fde8bc0-6e58-4cec-bc2f-528c2620b762','bc6db4a05d44d49edf9484429f4f290d2faf48d6'),256),'backfill',1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
('ca76e342-0d98-4255-bd1d-9c0bdacab534','staging','7df95af3a309','7df95af3a309f5d07371b989bf9500f944e53b8a','bc6db4a05d44d49edf9484429f4f290d2faf48d6','release',JSON_ARRAY('fix(membership): accept configured benefit display ordering'),'2026-09-06 16:08:27.498',SHA2(CONCAT('staging','ca76e342-0d98-4255-bd1d-9c0bdacab534','7df95af3a309f5d07371b989bf9500f944e53b8a'),256),'backfill',1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
('b45d4b4f-a375-4ddf-9908-0a433fcd05f0','staging','35df278fdfbf','35df278fdfbf0a5529ed0c211dd32f46fa2fe033','7df95af3a309f5d07371b989bf9500f944e53b8a','release',JSON_ARRAY('fix(settings): use themed selected-tab contrast'),'2026-09-06 16:18:43.446',SHA2(CONCAT('staging','b45d4b4f-a375-4ddf-9908-0a433fcd05f0','35df278fdfbf0a5529ed0c211dd32f46fa2fe033'),256),'backfill',1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
('a8c2a455-6e4b-412a-b6b8-4b99a8f26faf','staging','1721945b127f','1721945b127fedb3918da421db34d87926bcd5cf','35df278fdfbf0a5529ed0c211dd32f46fa2fe033','release',JSON_ARRAY('docs: plan completed-order refund backend','fix(admin): reorder and relabel operations navigation','fix(pwa): size installed iPhone chat against the full display','docs: define completed-order refund responsibility','fix: sync verified staging corrections to local main','docs: close technician service cover acceptance','docs: record main live dashboard verification','docs: clean live dashboard acceptance record','docs: record live dashboard browser acceptance','fix: stabilize live dashboard stream and map input','feat: finish restrained operations live screen','feat: render live dashboard operating panels','feat: drill into Japan live dashboard regions','feat: open protected operations live screen','feat: coordinate live dashboard refresh lifecycle','feat: add live dashboard snapshot and SSE clients','feat: add detailed local Japan map assets','fix(admin): reorder and relabel operations navigation','fix(pwa): size installed iPhone chat against the full display'),'2026-09-06 17:16:56.638',SHA2(CONCAT('staging','a8c2a455-6e4b-412a-b6b8-4b99a8f26faf','1721945b127fedb3918da421db34d87926bcd5cf'),256),'backfill',1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
('f415d457-a825-4d61-9b46-edf7478560b2','staging','49f2ee1819a4','49f2ee1819a419a34568786d8ae610bef8e33a3b','1721945b127fedb3918da421db34d87926bcd5cf','release',JSON_ARRAY('perf(i18n): keep integrated admin closure within asset budget','docs(qa): close local admin staffing and avatar acceptance','perf(i18n): reuse compact four-language translation entries','feat(notifications): add scoped formal notice media','feat(notifications): persist and resume official notice drafts','docs: record responsive dashboard main integration','docs: verify map pan and IME follow-up','fix: preserve map drag intent across disconnected islands','fix: preserve IME and visible map search focus','fix: align live map pan bounds with SVG origin','docs: normalize live dashboard design formatting','docs: verify responsive live dashboard map','docs: clarify dense map zoom disclosure','fix: preserve map selection and defer drag label layout','fix: keep live map labels readable in compact screens','docs: define readable dense map labels','fix: fit live dashboard to fluid viewports','fix: preserve map clicks and batch bounded drag updates','feat: add searchable zoomable Japan live map','feat: add bounded live map viewport controls','fix: fit map callouts across supported pan boundaries','fix: bound dense map callouts to aligned edge rows','docs: clarify dense map label fallback','feat: place dense map labels with leader lines','fix: reopen live dashboard region search with arrows','fix: guard live dashboard region search navigation','feat: search and select Japan live dashboard regions','feat: add local Japan region search index','docs: plan responsive live dashboard map','docs: keep live dashboard trend chart readable','docs: design responsive live dashboard map controls','test(dashboard): align ranking page-size boundaries with formal contract','fix(dashboard): add ranking filters and paginated detail drawers','feat(backoffice): add operations accounts and unified account activity','feat: add SaaS and storefront tabs to shop detail drawer','feat(notifications): persist notice block font sizes','docs: clarify refund request initial version','fix(notifications): localize composer targeting controls','fix: broadcast official notice delivery refresh','fix: refresh official notice inbox on delivery'),'2026-09-06 20:14:57.407',SHA2(CONCAT('staging','f415d457-a825-4d61-9b46-edf7478560b2','49f2ee1819a419a34568786d8ae610bef8e33a3b'),256),'backfill',1,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3));

INSERT INTO `release_publication_revisions`
  (`release_publication_id`,`revision_version`,`action`,`reason`,`before_snapshot`,`after_snapshot`,`actor_user_id`,`created_at`,`updated_at`)
SELECT rp.id,1,IF(rp.origin='backfill','backfilled','published'),IF(rp.origin='backfill','补录 2026-09-07 已验证 staging 发布回执','Verified deployment receipt'),NULL,
  JSON_OBJECT('deploymentId',rp.deployment_id,'environment',rp.environment,'sourceRevision',rp.source_revision,'previousRevision',rp.previous_revision,'version',rp.version,'kind',rp.kind,'publishedAt',DATE_FORMAT(rp.published_at,'%Y-%m-%dT%H:%i:%s.000Z'),'changes',rp.changes,'origin',rp.origin,'lockVersion',rp.lock_version),
  NULL,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)
FROM `release_publications` rp
LEFT JOIN `release_publication_revisions` rpr ON rpr.release_publication_id=rp.id AND rpr.revision_version=1
WHERE rp.origin IN ('backfill','deployment') AND rpr.id IS NULL;
