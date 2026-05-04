const dbQuery = require('../helpers/query');
const constants = require('../vars/constants');

module.exports = {
  up: async () => {
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE notifications ADD COLUMN is_deleted TINYINT(1) DEFAULT 0 AFTER is_read`
    ).catch(err => {
      if (!err.message.includes('Duplicate column')) {
        throw err;
      }
    });

    console.log('✅ notifications.is_deleted column created/verified');
  },

  down: async () => {
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `ALTER TABLE notifications DROP COLUMN is_deleted`
    ).catch(err => {
      if (!err.message.includes("Can't DROP")) {
        throw err;
      }
    });

    console.log('✅ notifications.is_deleted column dropped');
  }
};