const razorpay = require('../../helpers/razorpay');
const dbQuery = require('../../config/dbQuery');
const constants = require('../../vars/constants');

exports.createRazorpayOrder = async (req, res) => {
  const { amount } = req.body.inputdata;

  const order = await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR"
  });

  res.json(order);
};

exports.verifyPayment = async (req, res) => {
  const user_id = req.userInfo.user_id;
  const { order_id, transaction_id, amount } = req.body.inputdata;

  await dbQuery.insertSingle(constants.vals.defaultDB, 'payments', {
    user_id,
    order_id,
    transaction_id,
    amount,
    payment_status: 'completed',
    payment_date: new Date()
  });

  await dbQuery.insertSingle(constants.vals.defaultDB, 'wallet_transactions', {
    user_id,
    type: 'credit',
    amount,
    description: 'Online payment'
  });

  await dbQuery.rawQuery(constants.vals.defaultDB,
    `UPDATE users SET wallet_balance = wallet_balance - ${amount} WHERE user_id=${user_id}`
  );

  res.json({ status: "success", msg: "Payment successful" });
};
