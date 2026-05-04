const razorpay = require('../helpers/razorpay');
const dbQuery = require('../helpers/query');
const constants = require('../vars/constants');
const utility = require('../helpers/utility');
const moment = require('moment-timezone');
const crypto = require('crypto');

// 1. Create Razorpay order for subscription
exports.paySubscription = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const { amount } = req.body.inputdata;
    if (!amount || Number(amount) <= 0) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Valid amount required"
      });
    }
    const razorpayOrder = await razorpay.orders.create({
      amount: Number(amount) * 100,
      currency: "INR",
      receipt: `subscription_${user_id}_${Date.now()}`,
      payment_capture: 1
    });
    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Proceed to subscription payment",
      data: {
        razorpay: {
          key: process.env.RAZORPAY_KEY_ID || "rzp_test_S0ysEwOgi9ZKUb",
          order_id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency
        }
      }
    });
  } catch (err) {
    console.error("PAY SUBSCRIPTION ERROR:", err);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};

// 2. Verify payment and activate subscription
exports.verifySubscriptionPayment = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount
    } = req.body.inputdata;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "Hqbl27FSCC5em6EHEdDUhY2w")
      .update(body)
      .digest("hex");
    if (expectedSignature !== razorpay_signature) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Payment verification failed"
      });
    }
    // Record payment
    await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "payments",
      {
        user_id,
        payment_type: "subscription",
        transaction_id: razorpay_payment_id,
        amount,
        payment_status: "completed",
        payment_date: moment().format("YYYY-MM-DD HH:mm:ss")
      }
    );
    // Activate subscription (1 month)
    const start_date = moment().format("YYYY-MM-DD HH:mm:ss");
    const end_date = moment().add(1, 'month').format("YYYY-MM-DD HH:mm:ss");
    await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "subscriptions",
      {
        user_id,
        start_date,
        end_date
      }
    );
    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Subscription payment successful. Subscription activated.",
      data: { start_date, end_date }
    });
  } catch (err) {
    console.error("VERIFY SUBSCRIPTION PAYMENT ERROR:", err);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};
