const PDFDocument = require('pdfkit');
const fs = require('fs');

module.exports = function generateInvoice(order, items) {
  const doc = new PDFDocument();
  const file = `invoices/invoice_${order.order_id}.pdf`;

  doc.pipe(fs.createWriteStream(file));

  doc.fontSize(20).text("Satvik Bhojan Invoice");
  doc.moveDown();

  doc.text(`Order ID: ${order.order_id}`);
  doc.text(`Total: ₹${order.total_amount}`);

  doc.moveDown();
  items.forEach(i => {
    doc.text(`${i.quantity} x Meal - ₹${i.price}`);
  });

  doc.end();
  return file;
};
