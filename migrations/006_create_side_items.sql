-- Create side_items table
CREATE TABLE IF NOT EXISTS `side_items` (
  `side_item_id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `is_delete` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`side_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add included_side_items JSON column to meals table
ALTER TABLE `meals` ADD COLUMN `included_side_items` JSON DEFAULT NULL;
