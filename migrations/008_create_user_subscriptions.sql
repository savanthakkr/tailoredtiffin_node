-- Create subscriptions table
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `subscription_id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `slot` ENUM('lunch','dinner','both') DEFAULT 'both',
  `total_amount` DECIMAL(10,2) DEFAULT 0.00,
  `status` ENUM('active','expired','cancelled','pending') DEFAULT 'pending',
  `payment_id` INT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES users(`user_id`)
);