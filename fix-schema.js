const mysql = require('mysql2/promise');

async function checkAndFixSchema() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'pAssW1@!1!!123',
    database: 'tailored_tiffin'
  });

  try {
    // Check if column exists
    const [result] = await connection.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'meals' AND TABLE_SCHEMA = 'tailored_tiffin' 
      AND COLUMN_NAME = 'included_side_items'
    `);

    if (result && result.length > 0) {
      console.log('✅ Column included_side_items already exists');
    } else {
      console.log('❌ Column not found, adding it now...');
      await connection.execute(`
        ALTER TABLE meals ADD COLUMN included_side_items JSON DEFAULT NULL
      `);
      console.log('✅ Column successfully added!');
    }

    // Show all columns
    const [columns] = await connection.execute('DESCRIBE meals');
    console.log('\n📋 Columns in meals table:');
    columns.forEach(col => {
      console.log(`  - ${col.Field}`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.end();
  }
}

checkAndFixSchema();
