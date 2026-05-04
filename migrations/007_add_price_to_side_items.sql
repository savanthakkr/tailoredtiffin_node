-- Add price column to side_items table
ALTER TABLE `side_items` ADD COLUMN `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `name`;
