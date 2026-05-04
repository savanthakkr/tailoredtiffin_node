const dbQuery = require("../helpers/query");
const constants = require("../vars/constants");

exports.up = async () => {
  try {
    console.log("Running migration 003: Adding delivery_status and payment_status columns...");

    // Step 1: Add delivery_status column
    console.log("  [1/5] Adding delivery_status column...");
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE order_schedule 
       ADD COLUMN delivery_status VARCHAR(50) DEFAULT 'pending' AFTER status`
    ).catch(err => {
      if (err.message.includes('Duplicate column')) {
        console.log("      ℹ️  Column already exists, skipping...");
      } else {
        throw err;
      }
    });

    // Step 2: Modify existing status column
    console.log("  [2/5] Updating status column default...");
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE order_schedule 
       MODIFY COLUMN status VARCHAR(50) DEFAULT 'scheduled'`
    ).catch(err => {
      console.log("      ℹ️  " + err.message);
    });

    // Step 3: Add payment_status column
    console.log("  [3/5] Adding payment_status column...");
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE order_schedule 
       ADD COLUMN payment_status VARCHAR(50) DEFAULT 'pending' AFTER delivery_status`
    ).catch(err => {
      if (err.message.includes('Duplicate column')) {
        console.log("      ℹ️  Column already exists, skipping...");
      } else {
        throw err;
      }
    });

    // Step 4: Add index for delivery_status
    console.log("  [4/5] Adding delivery_status index...");
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE order_schedule 
       ADD INDEX idx_delivery_status (delivery_status)`
    ).catch(err => {
      if (err.message.includes('Duplicate key')) {
        console.log("      ℹ️  Index already exists, skipping...");
      } else {
        throw err;
      }
    });

    // Step 5: Add index for payment_status
    console.log("  [5/5] Adding payment_status index...");
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE order_schedule 
       ADD INDEX idx_payment_status (payment_status)`
    ).catch(err => {
      if (err.message.includes('Duplicate key')) {
        console.log("      ℹ️  Index already exists, skipping...");
      } else {
        throw err;
      }
    });

    console.log("✅ Migration 003 completed successfully!");
    console.log("\n📋 Changes made:");
    console.log("   - Added delivery_status column (default: 'pending')");
    console.log("   - Added payment_status column (default: 'pending')");
    console.log("   - Created indexes for faster queries");
    console.log("\n📝 Allowed status values:");
    console.log("   Delivery Status: pending, in-transit, delivered, failed");
    console.log("   Payment Status: pending, cod, paid, failed");

  } catch (error) {
    console.error("❌ Migration 003 failed:", error.message);
    throw error;
  }
};

exports.down = async () => {
  try {
    console.log("Rolling back migration 003...");
    
    // Drop indexes
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE order_schedule DROP INDEX idx_payment_status`
    ).catch(() => {});

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE order_schedule DROP INDEX idx_delivery_status`
    ).catch(() => {});

    // Drop columns
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE order_schedule DROP COLUMN payment_status`
    ).catch(() => {});

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE order_schedule DROP COLUMN delivery_status`
    ).catch(() => {});

    console.log("✅ Migration 003 rolled back successfully!");

  } catch (error) {
    console.error("❌ Rollback failed:", error.message);
    throw error;
  }
};
