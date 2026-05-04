const fs = require('fs');
const path = require('path');
const dbQuery = require('../helpers/query');
const constants = require('../vars/constants');

module.exports = {
  up: async () => {
    console.log('  [1/2] Creating side_items table...');
    const sql = fs.readFileSync(path.join(__dirname, '006_create_side_items.sql'), 'utf8');
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const stmt of statements) {
      try {
        await dbQuery.rawQuery(constants.vals.defaultDB, stmt);
      } catch (err) {
        // Ignore "already exists" errors
        if (!err.message.includes('already exists')) {
          throw err;
        }
      }
    }
    console.log('  ✅ side_items table and included_side_items column created/verified');
  },
  down: async () => {
    console.log('  [1/1] Dropping side_items table...');
    try {
      await dbQuery.rawQuery(constants.vals.defaultDB, 'DROP TABLE IF EXISTS side_items;');
      console.log('  ✅ side_items table dropped');
    } catch (err) {
      console.error('  ❌ Error dropping table:', err.message);
    }
  }
};

