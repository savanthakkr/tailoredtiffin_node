const dbQuery = require('./helpers/query');
const constants = require('./vars/constants');

async function checkSchema() {
  try {
    // Initialize the database connection
    const mysqlClient = require('./config/mysqlClient');
    await mysqlClient.connection();
    
    // Check if the column exists
    const result = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'meals' AND TABLE_SCHEMA = (SELECT DATABASE()) 
       AND COLUMN_NAME = 'included_side_items'`
    );
    
    if (result && result.length > 0) {
      console.log('✅ Column included_side_items EXISTS in meals table');
    } else {
      console.log('❌ Column included_side_items DOES NOT EXIST in meals table');
    }
    
    // Show all columns in meals table
    const allColumns = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `DESCRIBE meals`
    );
    
    console.log('\n📋 All columns in meals table:');
    allColumns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkSchema();
