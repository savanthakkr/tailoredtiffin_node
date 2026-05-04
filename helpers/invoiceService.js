const dbQuery = require("../helpers/query");
const constants = require("../vars/constants");

exports.generateDeliveryInvoiceNumber = async (delivery_boy_id) => {

  // ================= GET DELIVERY BOY =================
  const boy = await dbQuery.fetchSingleRecord(
    constants.vals.defaultDB,
    "delivery_boys",
    `WHERE delivery_boy_id=${delivery_boy_id}`,
    "first_name, invoice_prefix"
  );

  if (!boy) return null;

  // ================= PREFIX =================
  const prefix =
    boy.invoice_prefix ||
    boy.first_name?.charAt(0)?.toUpperCase() ||
    "X";

  // ================= COUNTER =================
  let counter = await dbQuery.fetchSingleRecord(
    constants.vals.defaultDB,
    "delivery_invoice_counter",
    `WHERE delivery_boy_id=${delivery_boy_id}`,
    "last_number"
  );

  let nextNumber = 1;

  if (!counter) {

    await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "delivery_invoice_counter",
      {
        delivery_boy_id,
        last_number: 1
      }
    );

  } else {

    // ⭐ SAFE NUMBER CONVERSION
    const lastNumber = Number(counter.last_number) || 0;

    nextNumber = lastNumber + 1;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "delivery_invoice_counter",
      `delivery_boy_id=${delivery_boy_id}`,
      `last_number=${nextNumber}`
    );
  }

  return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
};
