/**
 * Migration: Fix payment_type column to support multiple payment methods
 * 
 * Current Issue:
 * - The payment_type column in orders table only accepts 'later'
 * - Needs to support: 'later' (wallet/pay_later), 'card' (Razorpay), and other methods
 */

const dbQuery = require("../helpers/query");
const constants = require("../vars/constants");

exports.up = async () => {
  try {
    console.log("🔄 Migration: Fixing payment_type column...");

    // Alter orders table to support multiple payment types
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE orders MODIFY COLUMN payment_type VARCHAR(20) NOT NULL DEFAULT 'later'
       COMMENT 'Payment method: later (wallet), card (Razorpay), upi, etc.'`
    );

    console.log("✅ Migration complete: payment_type column updated");
    return true;

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    throw err;
  }
};

exports.down = async () => {
  try {
    console.log("🔄 Rolling back migration...");

    // Revert to ENUM (adjust based on your original schema)
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE orders MODIFY COLUMN payment_type ENUM('later') NOT NULL DEFAULT 'later'`
    );

    console.log("✅ Rollback complete");
    return true;

  } catch (err) {
    console.error("❌ Rollback failed:", err.message);
    throw err;
  }
};
