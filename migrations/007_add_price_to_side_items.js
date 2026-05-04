const fs = require('fs');
const path = require('path');
const dbQuery = require('../helpers/query');
const constants = require('../vars/constants');

module.exports = {
  up: async () => {
    console.log('  [1/1] Adding price column to side_items...');
    const sql = fs.readFileSync(path.join(__dirname, '007_add_price_to_side_items.sql'), 'utf8');
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const stmt of statements) {
      try {
        await dbQuery.rawQuery(constants.vals.defaultDB, stmt);
      } catch (err) {
        if (!err.message.includes('Duplicate column')) {
          throw err;
        }
      }
    }
    console.log('  ✅ price column added to side_items');
  },
  down: async () => {
    console.log('  [1/1] Removing price column from side_items...');
    try {
      await dbQuery.rawQuery(constants.vals.defaultDB, 'ALTER TABLE `side_items` DROP COLUMN `price`;');
      console.log('  ✅ price column removed');
    } catch (err) {
      console.error('  ❌ Error removing column:', err.message);
    }
  }
};
