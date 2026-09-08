ALTER TABLE `platform_membership_tier_versions`
  ADD COLUMN `detail_surface_middle_color` CHAR(7) NULL AFTER `detail_surface_color`,
  ADD COLUMN `detail_surface_bottom_color` CHAR(7) NULL AFTER `detail_surface_middle_color`;

UPDATE `platform_membership_tier_versions`
SET
  `detail_surface_middle_color` = `detail_surface_color`,
  `detail_surface_bottom_color` = `detail_surface_color`
WHERE
  `detail_surface_middle_color` IS NULL
  OR `detail_surface_bottom_color` IS NULL;

ALTER TABLE `platform_membership_tier_versions`
  MODIFY COLUMN `detail_surface_middle_color` CHAR(7) NOT NULL,
  MODIFY COLUMN `detail_surface_bottom_color` CHAR(7) NOT NULL,
  DROP CHECK `platform_membership_tier_versions_colors_chk`,
  ADD CONSTRAINT `platform_membership_tier_versions_colors_chk`
    CHECK (
      `detail_accent_color` REGEXP '^#[0-9A-Fa-f]{6}$'
      AND `detail_surface_color` REGEXP '^#[0-9A-Fa-f]{6}$'
      AND `detail_surface_middle_color` REGEXP '^#[0-9A-Fa-f]{6}$'
      AND `detail_surface_bottom_color` REGEXP '^#[0-9A-Fa-f]{6}$'
      AND `detail_item_surface_color` REGEXP '^#[0-9A-Fa-f]{6}$'
      AND `detail_outer_border_color` REGEXP '^#[0-9A-Fa-f]{6}$'
      AND `detail_item_border_color` REGEXP '^#[0-9A-Fa-f]{6}$'
      AND `detail_avatar_border_color` REGEXP '^#[0-9A-Fa-f]{6}$'
      AND `simple_top_color` REGEXP '^#[0-9A-Fa-f]{6}$'
      AND `simple_bottom_color` REGEXP '^#[0-9A-Fa-f]{6}$'
    );
