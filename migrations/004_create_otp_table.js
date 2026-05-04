const dbQuery = require("../helpers/query");
const constants = require("../vars/constants");

exports.up = async () => {
  try {
    console.log("Running migration 004: Creating OTP verifications table...");

    // Step 1: Create OTP verifications table
    console.log("  [1/2] Creating otp_verifications table...");
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      CREATE TABLE IF NOT EXISTS otp_verifications (
        otp_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        mobile_no VARCHAR(20) UNIQUE,
        otp VARCHAR(10) NOT NULL,
        is_verified BOOLEAN DEFAULT 0,
        attempts INT DEFAULT 0,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_mobile (mobile_no),
        INDEX idx_user (user_id),
        INDEX idx_expires (expires_at)
      )
      `
    ).catch(err => {
      if (err.message.includes('already exists')) {
        console.log("      ℹ️  Table already exists, skipping...");
      } else {
        throw err;
      }
    });

    console.log("  [2/2] Creating indexes...");
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `CREATE INDEX idx_otp_mobile ON otp_verifications(mobile_no)`
    ).catch(err => {
      console.log("      ℹ️  Index already exists or duplicate");
    });

    console.log("✅ Migration 004 completed successfully\n");
  } catch (err) {
    console.error("❌ Migration 004 failed:", err.message);
    throw err;
  }
};

exports.down = async () => {
  try {
    console.log("Rolling back migration 004...");
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `DROP TABLE IF EXISTS otp_verifications`
    );
    console.log("✅ Migration 004 rolled back");
  } catch (err) {
    console.error("❌ Rollback failed:", err.message);
  }
};
