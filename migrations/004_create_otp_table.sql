-- Create OTP Verifications Table
-- Stores OTP records for user verification

CREATE TABLE IF NOT EXISTS `otp_verifications` (
  `otp_id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT,
  `mobile_no` VARCHAR(20) UNIQUE,
  `otp` VARCHAR(10) NOT NULL,
  `is_verified` BOOLEAN DEFAULT 0,
  `attempts` INT DEFAULT 0,
  `expires_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_mobile` (`mobile_no`),
  INDEX `idx_user` (`user_id`),
  INDEX `idx_expires` (`expires_at`)
);
