const dbQuery = require("../helpers/query");
const constants = require("../vars/constants");
const utility = require('../helpers/utility');
const moment = require('moment-timezone');
const { encrypt, decrypt } = require("../helpers/ccavUtil");
const ccConfig = require("../config/ccavenueConfig");

// POST /user/purchase_subscription — Create CCAvenue payment for subscription
exports.purchaseSubscription = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    if (!user_id) {
      return utility.apiResponse(req, res, { status: "error", msg: "Unauthorized" });
    }

    const { amount } = req.body.inputdata || req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Valid amount required"
      });
    }

    const totalAmount = Number(amount);

    // Create pending payment record
    const paymentId = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "payments",
      {
        user_id,
        order_id: null,
        amount: totalAmount,
        payment_status: "pending",
        payment_type: "subscription",
        metadata: JSON.stringify({
          type: "subscription",
          amount: totalAmount
        })
      }
    );

    console.log("SUBSCRIPTION PAYMENT ID:", paymentId);

    // Prepare CCAvenue payment data
    const paymentData =
`merchant_id=${ccConfig.merchantId}
&order_id=${paymentId}
&currency=INR
&amount=${totalAmount}
&redirect_url=${ccConfig.redirectUrl}
&cancel_url=${ccConfig.cancelUrl}
&language=EN`;

    const encRequest = encrypt(paymentData);

    return res.json({
      status: true,
      payment_id: paymentId,
      encRequest,
      accessCode: ccConfig.accessCode
    });

  } catch (err) {
    console.error("PURCHASE SUBSCRIPTION ERROR:", err);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};

// Called after CCAvenue payment success to activate subscription
exports.verifySubscriptionPayment = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const { payment_id } = req.body.inputdata || req.body;

    if (!payment_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Payment ID required"
      });
    }

    // Check payment exists and is completed
    const payment = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "payments",
      `WHERE payment_id=${payment_id} AND user_id=${user_id} AND payment_type='subscription'`,
      "payment_id, payment_status, amount"
    );

    if (!payment) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Payment not found"
      });
    }

    if (payment.payment_status !== 'completed') {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Payment not completed"
      });
    }

    // Check if subscription already activated for this payment
    const existingSub = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "subscriptions",
      `WHERE user_id=${user_id} AND payment_id=${payment_id}`,
      "subscription_id"
    );

    if (existingSub) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Subscription already activated for this payment"
      });
    }

    // Activate subscription (1 month from now)
    const start_date = moment().format("YYYY-MM-DD HH:mm:ss");
    const end_date = moment().add(1, 'month').format("YYYY-MM-DD HH:mm:ss");

    await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "subscriptions",
      {
        user_id,
        payment_id: payment.payment_id,
        start_date,
        end_date
      }
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Subscription activated successfully",
      data: { start_date, end_date }
    });

  } catch (err) {
    console.error("VERIFY SUBSCRIPTION PAYMENT ERROR:", err);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};

// GET /user/get_subscription_status — Get active subscription details
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const now = moment().format("YYYY-MM-DD HH:mm:ss");

    const sub = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "subscriptions",
      `WHERE user_id=${user_id} AND end_date > '${now}' ORDER BY end_date DESC`,
      "subscription_id, user_id, start_date, end_date"
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: sub ? "Active subscription found" : "No active subscription",
      data: {
        is_premium: !!sub,
        subscription: sub ? {
          id: sub.subscription_id,
          start_date: sub.start_date,
          end_date: sub.end_date
        } : null
      }
    });
  } catch (err) {
    console.error("GET SUBSCRIPTION STATUS ERROR:", err);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};
