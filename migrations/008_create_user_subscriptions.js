const fs = require('fs');
const path = require('path');
const dbQuery = require('../helpers/query');
const constants = require('../vars/constants');

module.exports = {
  up: async () => {
    const sql = fs.readFileSync(path.join(__dirname, '008_create_user_subscriptions.sql'), 'utf8');
    const statements = sql.split(';').filter(statement => statement.trim());

    for (const statement of statements) {
      await dbQuery.rawQuery(constants.vals.defaultDB, statement);
    }

    console.log('✅ subscriptions table created/verified');
  },

  down: async () => {
    await dbQuery.rawQuery(constants.vals.defaultDB, 'DROP TABLE IF EXISTS subscriptions');
    console.log('✅ subscriptions table dropped');
  }
};
