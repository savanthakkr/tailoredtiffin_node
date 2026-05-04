-- Migration: Fix payment_type column to support multiple payment methods
-- 
-- Issue: payment_type column was defined as ENUM or CHAR with limited size
-- Solution: Change to VARCHAR(20) to support: 'later', 'card', 'upi', etc.

-- Step 1: Modify the payment_type column in orders table
ALTER TABLE `orders` MODIFY COLUMN `payment_type` VARCHAR(20) NOT NULL DEFAULT 'later';

-- Step 2: Verify the change
-- Expected output: payment_type should now be VARCHAR(20)
-- Run: DESCRIBE orders; to verify

-- Alternative: If you need to see what values exist first
-- SELECT DISTINCT payment_type FROM orders;

-- Verification query
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_type';
