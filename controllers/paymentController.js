const { encrypt, decrypt } = require("../helpers/ccavUtil");
const config = require("../config/ccavenueConfig");
const dbQuery = require("../helpers/query");
const constants = require("../vars/constants");
const assignmentService = require("../helpers/assignmentService");
const invoiceService = require("../helpers/invoiceService");
const moment = require('moment-timezone');
const { nowTime, todayDate } = require("../helpers/timezone");

function getEffectiveCutoff(slot, setting, hasPremiumSubscription) {
  const cutoffKey = slot === "lunch" ? "lunch_cutoff" : "dinner_cutoff";
  const cutoff = moment(setting[cutoffKey], "HH:mm:ss");

  if (hasPremiumSubscription) {
    cutoff.add(1, "hour");
  }

  return cutoff.format("HH:mm:ss");
}

function isSlotOpen(slot, setting, deliveryDate, hasPremiumSubscription) {
  const today = todayDate();
  const now = nowTime();

  if (deliveryDate !== today) {
    return true;
  }

  const effectiveCutoff = getEffectiveCutoff(slot, setting, hasPremiumSubscription);

  return now <= effectiveCutoff;
}



/*
--------------------------------
CREATE PAYMENT
--------------------------------
Flow: Initialize payment WITHOUT creating order
Order will be created ONLY after successful payment
*/
exports.createPayment = async (req, res) => {

  try {

    console.log("CREATE PAYMENT API HIT");

    const userId = req.userInfo?.user_id;
    const { 
      address_id, 
      slot, 
      delivery_dates, 
      payment_type 
    } = req.body.inputdata || req.body;

    console.log("USER ID:", userId);
    console.log("PAYMENT DATA:", { address_id, slot, delivery_dates, payment_type });

    // ✅ VALIDATION 1: Cart items exist
    const cartItems = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT * FROM user_cart WHERE user_id=${userId}`
    );

    if(!cartItems || cartItems.length === 0){
      return res.json({
        status: false,
        message: "Cart is empty"
      });
    }

    // ✅ VALIDATION 2: Delivery dates
    if(!delivery_dates || !Array.isArray(delivery_dates) || delivery_dates.length === 0){
      return res.json({
        status: false,
        message: "Delivery dates required"
      });
    }

    // ✅ VALIDATION 3: Slot
    if(!slot || !["lunch", "dinner"].includes(slot)){
      return res.json({
        status: false,
        message: "Invalid slot"
      });
    }

    // ✅ VALIDATION 4: Address
    if(!address_id){
      return res.json({
        status: false,
        message: "Address ID required"
      });
    }

    // ✅ VALIDATION 5: Payment type
    if(!payment_type){
      return res.json({
        status: false,
        message: "Payment type required"
      });
    }

    const setting = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "order_settings",
      "WHERE id=1",
      "lunch_cutoff, dinner_cutoff"
    );

    const today = todayDate();
    const activeSubscription = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "subscriptions",
      `WHERE user_id=${userId} AND status='active' AND start_date <= '${today}' AND end_date >= '${today}' ORDER BY end_date DESC`,
      "subscription_id"
    );

    const hasPremiumSubscription = !!activeSubscription;

    for (const date of delivery_dates) {
      if (!isSlotOpen(slot, setting, date, hasPremiumSubscription)) {
        return res.json({
          status: false,
          message: hasPremiumSubscription
            ? `${slot} orders closed after premium cutoff`
            : `${slot} orders closed`
        });
      }
    }

    // ✅ Calculate total amount from cart
    let totalAmount = cartItems.reduce(
      (sum, c) => sum + Number(c.total_price),
      0
    );
    totalAmount *= delivery_dates.length;

    console.log("PAYMENT AMOUNT:", totalAmount);

    // ✅ Create temporary payment record (order_id = NULL for now)
    // This will be linked to order after payment success
    const paymentId = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "payments",
      {
        user_id: userId,
        order_id: null, // Temporary - will update after payment success
        amount: totalAmount,
        payment_status: "pending",
        payment_type: "order",
        // Store order details for later use
        metadata: JSON.stringify({
          address_id,
          slot,
          delivery_dates,
          payment_type,
          cart_items: cartItems.map(c => c.cart_id)
        })
      }
    );

    console.log("PAYMENT ID:", paymentId);

    // ✅ Prepare payment gateway data
    const config = require("../config/ccavenueConfig");
    const paymentData =
`merchant_id=${config.merchantId}
&order_id=${paymentId}
&currency=INR
&amount=${totalAmount}
&redirect_url=${config.redirectUrl}
&cancel_url=${config.cancelUrl}
&language=EN`;

    console.log("PAYMENT DATA:", paymentData);

    const { encrypt } = require("../helpers/ccavUtil");
    const encRequest = encrypt(paymentData);

    console.log("ENC REQUEST:", encRequest);

    res.json({
      status: true,
      payment_id: paymentId,
      encRequest,
      accessCode: config.accessCode
    });

  } catch(err){

    console.log("CREATE PAYMENT ERROR:", err);

    res.json({
      status: false,
      message: "Payment initialization failed"
    });

  }

};
/*
--------------------------------
PAYMENT SUCCESS (CCAvenue)
--------------------------------
*/
exports.paymentSuccess = async (req,res)=>{

  try{
    console.log("CCAvenue SUCCESS API HIT");
    const encResp = req.body.encResp;
    console.log("ENC RESP:", encResp);
    if(!encResp){
      return res.send("Invalid payment response");
    }

    const response = decrypt(encResp);

    console.log("DECRYPT RESPONSE:", response);

    const responseParams = Object.fromEntries(
      response.split("&").map(p=>p.split("="))
    );

    console.log("RESPONSE PARAMS:", responseParams);

    // CCAvenue returns our payment_id as order_id (we sent it as order_id in the request)
    const paymentId = responseParams.order_id;
    const orderStatus = responseParams.order_status;
    const trackingId = responseParams.tracking_id;
    const amount = responseParams.amount;

    if(orderStatus === "Success"){

      // Find payment by payment_id (not order_id)
      const payment = await dbQuery.rawQuery(
        constants.vals.defaultDB,
        `SELECT * FROM payments WHERE payment_id=${paymentId} LIMIT 1`
      );

      if(!payment || payment.length === 0){
        return res.send("Payment record not found");
      }

      // security: verify amount
      if(parseFloat(payment[0].amount) != parseFloat(amount)){
        return res.send("Amount mismatch");
      }

      // Parse stored metadata to create the order
      const metadata = typeof payment[0].metadata === 'string' ? JSON.parse(payment[0].metadata) : payment[0].metadata;
      const userId = payment[0].user_id;

      // ✅ WALLET TOP-UP FLOW
      if (payment[0].payment_type === 'wallet' || (metadata && metadata.type === 'wallet_topup')) {

        // Credit wallet
        await dbQuery.insertSingle(
          constants.vals.defaultDB,
          "wallet_transactions",
          {
            user_id: userId,
            order_id: null,
            type: "credit",
            amount: payment[0].amount,
            description: "Wallet top-up via CCAvenue (Txn: " + trackingId + ")",
            created_at: new Date()
          }
        );

        // Update payment status
        await dbQuery.updateRecord(
          constants.vals.defaultDB,
          "payments",
          `payment_id=${paymentId}`,
          `payment_status='completed',transaction_id='${trackingId}',payment_date=NOW(),updated_at=NOW()`
        );

        console.log("WALLET TOP-UP COMPLETE - redirecting to app");

        return res.send(`
          <html>
          <head><title>Payment Success</title></head>
          <body>
            <h2>Wallet Top-up Successful!</h2>
            <p>Amount added to wallet. Redirecting...</p>
            <script>
              window.location.href = "tailoredtiffin://payment?status=success&payment_id=${paymentId}&type=wallet";
            </script>
          </body>
          </html>
        `);
      }

      // ✅ SUBSCRIPTION PAYMENT FLOW
      if (payment[0].payment_type === 'subscription' || (metadata && metadata.type === 'subscription')) {

        // Update payment status
        await dbQuery.updateRecord(
          constants.vals.defaultDB,
          "payments",
          `payment_id=${paymentId}`,
          `payment_status='completed',transaction_id='${trackingId}',payment_date=NOW(),updated_at=NOW()`
        );

        // Activate subscription (1 month)
        const start_date = moment().format("YYYY-MM-DD HH:mm:ss");
        const end_date = moment().add(1, 'month').format("YYYY-MM-DD HH:mm:ss");

        await dbQuery.insertSingle(
          constants.vals.defaultDB,
          "subscriptions",
          {
            user_id: userId,
            payment_id: paymentId,
            start_date,
            end_date,
            total_amount: payment[0].amount,
            status: "active"
          }
        );

        console.log("SUBSCRIPTION ACTIVATED - redirecting to app");

        return res.send(`
          <html>
          <head><title>Payment Success</title></head>
          <body>
            <h2>Subscription Activated!</h2>
            <p>Your premium subscription is now active. Redirecting...</p>
            <script>
              window.location.href = "tailoredtiffin://payment?status=success&payment_id=${paymentId}&type=subscription";
            </script>
          </body>
          </html>
        `);
      }

      // ✅ ORDER PAYMENT FLOW
      const { address_id, slot, delivery_dates, payment_type } = metadata;

      // Fetch cart items (stored cart_ids in metadata)
      const cartItems = await dbQuery.rawQuery(
        constants.vals.defaultDB,
        `SELECT * FROM user_cart WHERE user_id=${userId}`
      );

      if(!cartItems || cartItems.length === 0){
        console.log("CART EMPTY after payment - user may have already placed order");
        return res.redirect("tailoredtiffin://payment?status=success&payment_id=" + paymentId);
      }

      // Auto delivery boy assignment
      let autoDeliveryBoy = null;
      const address = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "user_addresses",
        `WHERE address_id=${address_id}`,
        "address_id, latitude, longitude, full_address"
      );

      if(address && address.latitude && address.longitude && address.latitude !== 0 && address.longitude !== 0){
        autoDeliveryBoy = await assignmentService.getAutoAssignedBoy(
          Number(address.latitude),
          Number(address.longitude)
        );
      }

      console.log("AUTO ASSIGNED BOY =>", autoDeliveryBoy);

      // Create order
      const order_id = await dbQuery.insertSingle(
        constants.vals.defaultDB,
        "orders",
        {
          user_id: userId,
          order_type: delivery_dates.length > 1 ? "subscription" : "single",
          total_amount: payment[0].amount,
          payment_type: payment_type || "upi",
          is_paid: 1,
          status: "paid",
          created_at: new Date()
        }
      );

      console.log("ORDER CREATED:", order_id);

      // Create order items + schedule
      for(let c of cartItems){
        const order_item_id = await dbQuery.insertSingle(
          constants.vals.defaultDB,
          "order_items",
          {
            order_id,
            meals_id: c.meal_id,
            quantity: c.meal_quantity,
            price: c.total_price,
            selection_mode: "fixed",
            selected_items: JSON.stringify({
              selected_items: JSON.parse(c.selected_items || "{}"),
              extra_items: JSON.parse(c.extra_items || "[]")
            }),
            created_at: new Date()
          }
        );

        for(let date of delivery_dates){
          let invoiceNumber = null;
          if(autoDeliveryBoy){
            invoiceNumber = await invoiceService.generateDeliveryInvoiceNumber(
              autoDeliveryBoy.delivery_boy_id
            );
          }

          await dbQuery.insertSingle(
            constants.vals.defaultDB,
            "order_schedule",
            {
              order_id,
              order_item_id,
              delivery_date: date,
              slot,
              address_id,
              delivery_boy_id: autoDeliveryBoy?.delivery_boy_id || null,
              delivery_invoice_no: invoiceNumber,
              status: "scheduled",
              delivery_status: "pending",
              payment_status: "paid"
            }
          );
        }
      }

      // Update payment record with order_id and mark completed
      await dbQuery.updateRecord(
        constants.vals.defaultDB,
        "payments",
        `payment_id=${paymentId}`,
        `order_id=${order_id},payment_status='completed',transaction_id='${trackingId}',payment_date=NOW(),updated_at=NOW()`
      );

      // Clear cart
      await dbQuery.rawQuery(
        constants.vals.defaultDB,
        `DELETE FROM user_cart WHERE user_id=${userId}`
      );

      console.log("ORDER COMPLETE - redirecting to app");

      // Serve HTML page that the WebView can detect
      return res.send(`
        <html>
        <head><title>Payment Success</title></head>
        <body>
          <h2>Payment Successful!</h2>
          <p>Your order has been placed. Redirecting...</p>
          <script>
            window.location.href = "tailoredtiffin://payment?status=success&order_id=${order_id}&payment_id=${paymentId}";
          </script>
        </body>
        </html>
      `);

    }
    else{

      await dbQuery.updateRecord(
        constants.vals.defaultDB,
        "payments",
        `payment_id=${paymentId}`,
        `payment_status='failed',updated_at=NOW()`
      );

      return res.send(`
        <html>
        <head><title>Payment Failed</title></head>
        <body>
          <h2>Payment Failed</h2>
          <p>Your payment was not successful. Redirecting...</p>
          <script>
            window.location.href = "tailoredtiffin://payment?status=failed&payment_id=${paymentId}";
          </script>
        </body>
        </html>
      `);

    }

  }
  catch(err){

    console.log("PAYMENT SUCCESS ERROR:", err);
    return res.send(`
      <html>
      <head><title>Payment Error</title></head>
      <body>
        <h2>Payment Error</h2>
        <p>Something went wrong. Redirecting...</p>
        <script>
          window.location.href = "tailoredtiffin://payment?status=error";
        </script>
      </body>
      </html>
    `);

  }

};

/*
--------------------------------
PAYMENT CANCEL
--------------------------------
*/
exports.paymentCancel = async (req, res) => {

  try{
    console.log("CCAvenue CANCEL API HIT");
    const encResp = req.body.encResp;

    if(!encResp){
      return res.send(`
        <html>
        <head><title>Payment Cancelled</title></head>
        <body>
          <h2>Payment Cancelled</h2>
          <p>Redirecting...</p>
          <script>
            window.location.href = "tailoredtiffin://payment?status=cancelled";
          </script>
        </body>
        </html>
      `);
    }

    const response = decrypt(encResp);

    const responseParams = Object.fromEntries(
      response.split("&").map(p=>p.split("="))
    );

    const paymentId = responseParams.order_id;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "payments",
      `payment_id=${paymentId}`,
      `payment_status='cancelled',updated_at=NOW()`
    );

    return res.send(`
      <html>
      <head><title>Payment Cancelled</title></head>
      <body>
        <h2>Payment Cancelled</h2>
        <p>Redirecting...</p>
        <script>
          window.location.href = "tailoredtiffin://payment?status=cancelled&payment_id=${paymentId}";
        </script>
      </body>
      </html>
    `);

  }
  catch(err){

    console.log(err);
    return res.send(`
      <html>
      <head><title>Payment Error</title></head>
      <body>
        <h2>Error</h2>
        <p>Redirecting...</p>
        <script>
          window.location.href = "tailoredtiffin://payment?status=error";
        </script>
      </body>
      </html>
    `);

  }

};



/*
--------------------------------
VERIFY PAYMENT (APP)
--------------------------------
*/
exports.verifyPayment = async (req,res)=>{

  try{
    console.log("VERIFY PAYMENT API HIT");
    const { payment_id } = req.body.inputdata || req.body;
    console.log("VERIFY PAYMENT ID:", payment_id);

    const payment = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT payment_id, order_id, payment_status, amount FROM payments WHERE payment_id=${payment_id} LIMIT 1`
    );

    console.log("PAYMENT RESULT:", payment);

    if(!payment || payment.length === 0){

      return res.json({
        status:false,
        message:"Payment not found"
      });

    }

    res.json({
      status: payment[0].payment_status === 'completed',
      payment_status: payment[0].payment_status,
      order_id: payment[0].order_id,
      amount: payment[0].amount
    });

  }
  catch(err){

    console.log(err);

    res.json({
      status:false,
      message:"Verification failed"
    });

  }

};


/*
--------------------------------
CREATE WALLET PAYMENT (CCAvenue)
--------------------------------
*/
exports.createWalletPayment = async (req, res) => {

  try {

    console.log("CREATE WALLET PAYMENT API HIT");

    const userId = req.userInfo?.user_id;
    const { amount } = req.body.inputdata || req.body;

    console.log("USER ID:", userId);
    console.log("WALLET AMOUNT:", amount);

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.json({
        status: false,
        message: "Valid amount required"
      });
    }

    const totalAmount = Number(amount);

    // Create payment record for wallet top-up
    const paymentId = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "payments",
      {
        user_id: userId,
        order_id: null,
        amount: totalAmount,
        payment_status: "pending",
        payment_type: "wallet",
        metadata: JSON.stringify({
          type: "wallet_topup",
          amount: totalAmount
        })
      }
    );

    console.log("WALLET PAYMENT ID:", paymentId);

    const ccConfig = require("../config/ccavenueConfig");
    const paymentData =
`merchant_id=${ccConfig.merchantId}
&order_id=${paymentId}
&currency=INR
&amount=${totalAmount}
&redirect_url=${ccConfig.redirectUrl}
&cancel_url=${ccConfig.cancelUrl}
&language=EN`;

    const { encrypt } = require("../helpers/ccavUtil");
    const encRequest = encrypt(paymentData);

    res.json({
      status: true,
      payment_id: paymentId,
      encRequest,
      accessCode: ccConfig.accessCode
    });

  } catch (err) {

    console.log("CREATE WALLET PAYMENT ERROR:", err);

    res.json({
      status: false,
      message: "Wallet payment initialization failed"
    });

  }

};