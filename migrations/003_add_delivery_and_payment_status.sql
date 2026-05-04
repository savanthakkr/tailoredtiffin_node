-- Add delivery and payment status columns to order_schedule table
-- This enables tracking of delivery status and payment status (especially for COD)

-- Add delivery_status column (rename existing status or create new one)
ALTER TABLE `order_schedule` 
ADD COLUMN `delivery_status` VARCHAR(50) DEFAULT 'pending' AFTER `status`,
MODIFY COLUMN `status` VARCHAR(50) DEFAULT 'scheduled';

-- Add payment_status column to track payment status (useful for COD)
ALTER TABLE `order_schedule` 
ADD COLUMN `payment_status` VARCHAR(50) DEFAULT 'pending' AFTER `delivery_status`;

-- Add index for faster queries
ALTER TABLE `order_schedule` 
ADD INDEX `idx_delivery_status` (`delivery_status`),
ADD INDEX `idx_payment_status` (`payment_status`);
