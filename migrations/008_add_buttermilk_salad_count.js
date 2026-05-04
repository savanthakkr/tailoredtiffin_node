const fs = require('fs');
const path = require('path');
const dbQuery = require('../helpers/query');
const constants = require('../vars/constants');

module.exports = {
  up: async () => {
    console.log('  [1/1] Adding buttermilk_count and salad_count columns to meals...');
    const sql = fs.readFileSync(path.join(__dirname, '008_add_buttermilk_salad_count.sql'), 'utf8');
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
    console.log('  ✅ buttermilk_count and salad_count columns added to meals');
  },
  down: async () => {
    console.log('  [1/1] Removing buttermilk_count and salad_count columns from meals...');
    try {
      await dbQuery.rawQuery(constants.vals.defaultDB, 'ALTER TABLE meals DROP COLUMN buttermilk_count, DROP COLUMN salad_count');
      console.log('  ✅ Columns removed');
    } catch (err) {
      if (!err.message.includes('check that column/key exists')) {
        throw err;
      }
    }
  }
};
