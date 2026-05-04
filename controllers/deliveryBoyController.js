const dbquery = require("../helpers/query");
const constants = require("../vars/constants");
const bcrypt = require("bcrypt");   // ✅ SAME AS ADMIN
const jwt = require("jsonwebtoken");

exports.loginDeliveryBoy = async (req, res) => {
  try {
    // 📌 DEPRECATED: Delivery boys now use regular user authentication
    // 
    // Flow:
    // 1. Delivery boy logs in via POST /login endpoint (user routes)
    // 2. Login verifies credentials in users table and creates user_Token
    // 3. Return this user_Token to the delivery boy
    // 4. When accessing /delivery/* endpoints, the authentication middleware:
    //    - Verifies the user_Token in users table
    //    - Checks if user's mobile_no matches a delivery_boy record
    //    - If matched, adds delivery_boy_id to request context
    
    return res.status(200).json({
      status: "info",
      msg: "Delivery boys should login using the regular /login endpoint (user routes)",
      instructions: {
        step1: "POST /login with mobile_no and password",
        step2: "Keep the returned user_Token",
        step3: "Use it as Authorization header for delivery boy endpoints: /delivery/assigned_orders, /delivery/update_order_status, etc",
        note: "Your mobile_no must be registered in both users and delivery_boys tables to access delivery features"
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};




// 📋 GET ALL ORDERS ASSIGNED TO DRIVER (Fetch today's orders by default)
// Query params: ?date=YYYY-MM-DD&slot=lunch (or dinner)
// If no date provided, returns TODAY's orders
// If no slot provided, returns all slots
// Response structure same as getMyOrders with detailed schedules and items
exports.getAssignedOrders = async (req, res) => {
  try {

    const delivery_boy_id = req.userInfo?.delivery_boy_id;
    let { slot, date } = req.query;

    if (!delivery_boy_id) {
      return res.status(401).json({
        status: "error",
        msg: "Unauthorized"
      });
    }

    // DATE FILTER - Default to TODAY if not specified
    const today = new Date().toISOString().split('T')[0];
    const filterDate = date || today;
    let whereClause = `WHERE os.delivery_boy_id = ${delivery_boy_id} AND os.delivery_date = '${filterDate}'`;

    // SLOT FILTER (OPTIONAL)
    if (slot && ['lunch','dinner'].includes(slot.toLowerCase())) {
      whereClause += ` AND os.slot='${slot}'`;
    }

    // Fetch distinct orders assigned to this driver
    const orders = await dbquery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT DISTINCT
        o.order_id,
        o.user_id,
        o.total_amount,
        o.order_type,
        o.is_paid,
        o.status,
        o.created_at,
        GROUP_CONCAT(DISTINCT os.delivery_date ORDER BY os.delivery_date) AS delivery_dates,
        GROUP_CONCAT(DISTINCT os.slot) AS slots,
        COUNT(DISTINCT os.delivery_date) AS total_deliveries,
        MAX(os.delivery_date) AS next_delivery_date,
        u.name AS user_name,
        u.mobile_no AS user_mobile
      FROM order_schedule os
      JOIN orders o ON os.order_id=o.order_id
      JOIN users u ON o.user_id=u.user_id
      ${whereClause}
      GROUP BY o.order_id
      ORDER BY o.order_id DESC
      `
    );

    let enrichedOrders = [];

    // Enrich each order with detailed schedules and items
    for (let order of orders) {

      // 📆 Fetch schedules with address details
      const schedules = await dbquery.rawQuery(
        constants.vals.defaultDB,
        `
        SELECT 
          os.delivery_date,
          os.slot,
          os.status, 
          os.delivery_status,
          os.payment_status,
          ua.address_title,
          ua.full_address,
          ua.landmark,
          ua.city,
          ua.state,
          ua.pincode,
          ua.latitude,
          ua.longitude,
          ua.is_default
        FROM order_schedule os
        LEFT JOIN user_addresses ua ON ua.address_id=os.address_id
        WHERE os.order_id=${order.order_id} AND os.delivery_boy_id=${delivery_boy_id}
        `
      );

      // 🍽 Fetch order items with meal details
      const itemsRaw = await dbquery.rawQuery(
        constants.vals.defaultDB,
        `
        SELECT 
          oi.*,
          m.meals_name,
          m.bread_count,
          m.subji_count,
          m.image as meal_image
        FROM order_items oi
        LEFT JOIN meals m ON m.meals_id=oi.meals_id
        WHERE oi.order_id=${order.order_id}
        `
      );

      let items = [];

      for (let it of itemsRaw) {

        const config = JSON.parse(it.selected_items || "{}");
        const selected = config.selected_items || {};
        const extras = config.extra_items || [];

        // 🫓 bread
        let bread = null;
        if (selected.bread_id) {
          const bread_id = typeof selected.bread_id === 'object' ? selected.bread_id.bread_id : selected.bread_id;
          bread = await dbquery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${bread_id}`,
            "bread_id, name, price"
          );
          bread = Array.isArray(bread) ? bread[0] : bread;
        }

        // 🍛 subjis
        let subjis = [];
        if (Array.isArray(selected.subji_ids)) {
          for (let sid of selected.subji_ids) {
            const subji_id = typeof sid === 'object' ? sid.subji_id : sid;
            let s = await dbquery.fetchSingleRecord(
              constants.vals.defaultDB,
              "subjis",
              `WHERE subji_id=${subji_id}`,
              "subji_id, name, price"
            );
            if (s) {
              s = Array.isArray(s) ? s[0] : s;
              subjis.push(s);
            }
          }
        }

        // ➕ extra items
        let extra_items = [];

        for (let ex of extras) {
          let row = null;
          const item_id = typeof ex.item_id === 'object' ? ex.item_id.item_id : ex.item_id;

          if (ex.item_type === "bread") {
            row = await dbquery.fetchSingleRecord(
              constants.vals.defaultDB,
              "breads",
              `WHERE bread_id=${item_id}`,
              "name, price"
            );
          }

          if (ex.item_type === "subji") {
            row = await dbquery.fetchSingleRecord(
              constants.vals.defaultDB,
              "subjis",
              `WHERE subji_id=${item_id}`,
              "name, price"
            );
          }

          if (!row) continue;
          row = Array.isArray(row) ? row[0] : row;

          extra_items.push({
            name: row.name,
            price: row.price,
            quantity: ex.quantity,
            subtotal: ex.subtotal
          });
        }

        items.push({
          order_item_id: it.order_item_id,
          quantity: it.quantity,
          price: it.price,
          meal: {
            name: it.meals_name,
            bread_count: it.bread_count,
            subji_count: it.subji_count,
            image: it.meal_image
          },
          selected_items: {
            bread,
            subjis
          },
          extra_items
        });
      }

      enrichedOrders.push({
        order_id: order.order_id,
        user_id: order.user_id,
        total_amount: order.total_amount,
        order_type: order.order_type,
        is_paid: order.is_paid,
        status: order.status,
        created_at: order.created_at,
        delivery_dates: order.delivery_dates,
        slots: order.slots,
        total_deliveries: order.total_deliveries,
        next_delivery_date: order.next_delivery_date,
        user_name: order.user_name,
        user_mobile: order.user_mobile,
        schedules,
        items
      });
    }

    console.log(enrichedOrders);
    

    return res.json({
      status: "success",
      msg: "Assigned orders fetched",
      data: enrichedOrders
    });

  } catch (err) {
    console.error("GET ASSIGNED ORDERS ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};




// 📦 GET SPECIFIC ASSIGNED ORDER DETAILS (Auto-checks if user is driver via mobile)
exports.getAssignedOrderDetails = async (req, res) => {
  try {
    const delivery_boy_id = req.userInfo?.delivery_boy_id;
    const { order_id } = req.query;

    if (!delivery_boy_id) {
      return res.status(401).json({
        status: "error",
        msg: "Unauthorized"
      });
    }

    if (!order_id) {
      return res.json({
        status: "error",
        msg: "Order ID required"
      });
    }

    // Verify order is assigned to this delivery boy
    const assignmentCheck = await dbquery.fetchSingleRecord(
      constants.vals.defaultDB,
      "order_schedule",
      `WHERE order_id=${order_id} AND delivery_boy_id=${delivery_boy_id}`,
      "order_id"
    );

    if (!assignmentCheck) {
      return res.json({
        status: "error",
        msg: "Order not assigned to you"
      });
    }

    // 🧾 order
    const order = await dbquery.fetchSingleRecord(
      constants.vals.defaultDB,
      "orders",
      `WHERE order_id=${order_id}`
    );

    if (!order) {
      return res.json({
        status: "error",
        msg: "Order not found"
      });
    }

    // Get user details
    let user = await dbquery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE user_id=${order.user_id}`,
      "user_id, name, mobile_no, email"
    );
    user = Array.isArray(user) ? user[0] : user;

    // 📆 schedules with address
    const schedules = await dbquery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        os.delivery_date,
        os.slot,
        os.status,
        ua.address_title,
        ua.full_address,
        ua.landmark,
        ua.city,
        ua.state,
        ua.pincode,
        ua.latitude,
        ua.longitude,
        ua.is_default
      FROM order_schedule os
      LEFT JOIN user_addresses ua ON ua.address_id=os.address_id
      WHERE os.order_id=${order_id} AND os.delivery_boy_id=${delivery_boy_id}
      `
    );

    // 🍽 items
    const itemsRaw = await dbquery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        oi.*,
        m.meals_name,
        m.bread_count,
        m.subji_count
      FROM order_items oi
      LEFT JOIN meals m ON m.meals_id=oi.meals_id
      WHERE oi.order_id=${order_id}
      `
    );

    let items = [];

    for (let it of itemsRaw) {

      const config = JSON.parse(it.selected_items || "{}");
      const selected = config.selected_items || {};
      const extras = config.extra_items || [];

      // 🫓 bread
      let bread = null;
      if (selected.bread_id) {
        const bread_id = typeof selected.bread_id === 'object' ? selected.bread_id.bread_id : selected.bread_id;
        bread = await dbquery.fetchSingleRecord(
          constants.vals.defaultDB,
          "breads",
          `WHERE bread_id=${bread_id}`,
          "bread_id, name, price"
        );
        bread = Array.isArray(bread) ? bread[0] : bread;
      }

      // 🍛 subjis
      let subjis = [];
      if (Array.isArray(selected.subji_ids)) {
        for (let sid of selected.subji_ids) {
          // Handle both: sid as number or as object {subji_id: X}
          const subji_id = typeof sid === 'object' ? sid.subji_id : sid;
          let s = await dbquery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${subji_id}`,
            "subji_id, name, price"
          );
          if (s) {
            s = Array.isArray(s) ? s[0] : s;
            subjis.push(s);
          }
        }
      }

      // ➕ extra items
      let extra_items = [];

      for (let ex of extras) {
        let row = null;
        // Handle both: ex.item_id as number or as object
        const item_id = typeof ex.item_id === 'object' ? ex.item_id.item_id : ex.item_id;

        if (ex.item_type === "bread") {
          row = await dbquery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${item_id}`,
            "name, price"
          );
        }

        if (ex.item_type === "subji") {
          row = await dbquery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${item_id}`,
            "name, price"
          );
        }

        if (!row) continue;
        row = Array.isArray(row) ? row[0] : row;

        extra_items.push({
          name: row.name,
          price: row.price,
          quantity: ex.quantity,
          subtotal: ex.subtotal
        });
      }

      items.push({
        order_item_id: it.order_item_id,
        quantity: it.quantity,
        price: it.price,
        meal: {
          name: it.meals_name,
          bread_count: it.bread_count,
          subji_count: it.subji_count
        },
        selected_items: {
          bread,
          subjis
        },
        extra_items
      });
    }

    return res.json({
      status: "success",
      msg: "Order details fetched",
      data: {
        order,
        user,
        schedules,
        items
      }
    });

  } catch (err) {
    console.error("GET ASSIGNED ORDER DETAILS ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};

/**
 * UPDATE ORDER DELIVERY & PAYMENT STATUS
 * Allows delivery boy to update:
 * - Delivery Status (pending -> in-transit -> delivered/failed)
 * - Payment Status (for COD: cod -> paid)
 * 
 * Body: {
 *   order_id: number,
 *   delivery_date: string (YYYY-MM-DD),
 *   slot: string (lunch/dinner),
 *   delivery_status?: string (pending, in-transit, delivered, failed),
 *   payment_status?: string (for COD: cod -> paid)
 * }
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const delivery_boy_id = req.userInfo?.delivery_boy_id;
    const { order_id, delivery_date, slot, delivery_status, payment_status } = req.body.inputdata;

    // Check if user is a delivery boy
    if (!delivery_boy_id) {
      return res.status(403).json({
        status: "error",
        msg: "User is not registered as a delivery boy"
      });
    }

    console.log("📤 UPDATE ORDER STATUS REQUEST:", {
      delivery_boy_id,
      order_id,
      delivery_date,
      slot,
      delivery_status,
      payment_status
    });

    /* ================= VALIDATION ================= */
    if (!order_id) {
      return res.status(400).json({
        status: "error",
        msg: "order_id is required"
      });
    }

    if (!delivery_date || !slot) {
      return res.status(400).json({
        status: "error",
        msg: "delivery_date and slot are required"
      });
    }

    /* ================= VERIFY ORDER ASSIGNMENT ================= */
    const schedule = await dbquery.fetchSingleRecord(
      constants.vals.defaultDB,
      "order_schedule",
      `WHERE order_id=${order_id} AND delivery_date='${delivery_date}' AND slot='${slot}' AND delivery_boy_id=${delivery_boy_id}`,
      "order_schedule_id, order_id, delivery_status, payment_status, delivery_boy_id"
    );

    if (!schedule || !schedule.order_schedule_id) {
      return res.status(404).json({
        status: "error",
        msg: "Order not assigned to this delivery boy or not found"
      });
    }

    /* ================= BUILD UPDATE QUERY ================= */
    let updateFields = [];
    let validDeliveryStatuses = ["pending", "in-transit", "delivered", "failed"];
    let validPaymentStatuses = ["pending", "cod", "paid", "failed"];

    // Update delivery status
    if (delivery_status) {
      if (!validDeliveryStatuses.includes(delivery_status)) {
        return res.status(400).json({
          status: "error",
          msg: `Invalid delivery_status. Allowed: ${validDeliveryStatuses.join(", ")}`
        });
      }
      updateFields.push(`delivery_status='${delivery_status}'`);
      console.log(`   ✅ Delivery Status: ${schedule.delivery_status} → ${delivery_status}`);
    }

    // Update payment status
    if (payment_status) {
      if (!validPaymentStatuses.includes(payment_status)) {
        return res.status(400).json({
          status: "error",
          msg: `Invalid payment_status. Allowed: ${validPaymentStatuses.join(", ")}`
        });
      }

      // For COD payments, only allow: cod -> paid or pending -> cod
      if (schedule.payment_status === "cod" && payment_status !== "paid") {
        return res.status(400).json({
          status: "error",
          msg: "COD payment can only be marked as 'paid' after delivery"
        });
      }

      // Prevent changing payment status if already paid
      if (schedule.payment_status === "paid" && payment_status !== "paid") {
        return res.status(400).json({
          status: "error",
          msg: "Payment already marked as paid, cannot change status"
        });
      }

      updateFields.push(`payment_status='${payment_status}'`);
      console.log(`   ✅ Payment Status: ${schedule.payment_status} → ${payment_status}`);
    }

    if (!updateFields.length) {
      return res.status(400).json({
        status: "error",
        msg: "No status fields provided for update"
      });
    }

    /* ================= UPDATE DATABASE ================= */
    const updateQuery = `UPDATE order_schedule 
                         SET ${updateFields.join(", ")}
                         WHERE order_schedule_id=${schedule.order_schedule_id}`;

    await dbquery.rawQuery(constants.vals.defaultDB, updateQuery);

    console.log("✅ Order status updated successfully");

    // 💳 If COD payment is marked as paid, also update orders table
    if (payment_status === "paid") {
      const orderUpdate = `UPDATE orders 
                           SET is_paid=1, payment_type='cod'
                           WHERE order_id=${order_id}`;
      
      await dbquery.rawQuery(constants.vals.defaultDB, orderUpdate);
      console.log(`✅ Order ${order_id} marked as paid (is_paid=1, payment_type='cod')`);
    }

    /* ================= FETCH UPDATED RECORD ================= */
    const updatedSchedule = await dbquery.fetchSingleRecord(
      constants.vals.defaultDB,
      "order_schedule",
      `WHERE order_schedule_id=${schedule.order_schedule_id}`,
      "order_id, delivery_date, slot, delivery_status, payment_status"
    );

    return res.json({
      status: "success",
      msg: "Order status updated successfully",
      data: {
        order_id: updatedSchedule.order_id,
        delivery_date: updatedSchedule.delivery_date,
        slot: updatedSchedule.slot,
        delivery_status: updatedSchedule.delivery_status,
        payment_status: updatedSchedule.payment_status
      }
    });

  } catch (err) {
    console.error("❌ UPDATE ORDER STATUS ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};
