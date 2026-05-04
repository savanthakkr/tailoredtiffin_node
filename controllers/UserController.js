const bcrypt = require('bcrypt');
const { responseHandler } = require('../helpers/utility');
const dbQuery = require("../helpers/query");
let constants = require("../vars/constants");
let { notFoundResponse } = require("../vars/apiResponse");
const utility = require('../helpers/utility');
const jwt = require('jsonwebtoken');
const assignmentService = require("../helpers/assignmentService");
const FileManager = require("../helpers/file_manager");
const moment = require('moment-timezone');
const { log } = require('console');
const axios = require("axios");
const invoiceService = require("../helpers/invoiceService");
const FIREBASE_API_KEY = "AIzaSyDVPHjZwCXmiMVUps0MucNzYko9a-AGcWQ";
const razorpay = require("../helpers/razorpay");
const crypto = require("crypto");
const { nowTime, todayDate } = require("../helpers/timezone");

// tifin api start

// User register
exports.userRegister = async (req, res) => {
  try {
    let body = req.body.inputdata;
    let response = { status: "error", msg: "" };

    body.email = body.email?.trim().toLowerCase() || "";
    body.mobile_no = body.mobile_no?.trim() || "";

    // -----------------------------
    // VALIDATIONS
    // -----------------------------
    if (utility.checkEmptyString(body.name)) {
      response.msg = "Name is required.";
      return utility.apiResponse(req, res, response);
    }

    if (utility.checkEmptyString(body.password)) {
      response.msg = "Password is required.";
      return utility.apiResponse(req, res, response);
    }

    if (utility.checkEmptyString(body.email) && utility.checkEmptyString(body.mobile_no)) {
      response.msg = "Email or Mobile number is required.";
      return utility.apiResponse(req, res, response);
    }

    // -----------------------------
    // CHECK DUPLICATE EMAIL
    // -----------------------------
    if (!utility.checkEmptyString(body.email)) {
      let emailExist = await dbQuery.rawQuery(
        constants.vals.defaultDB,
        `
                SELECT user_id FROM users
                WHERE LOWER(TRIM(email)) = '${body.email}'
                AND is_delete = 0
                LIMIT 1
                `
      );

      if (emailExist.length > 0) {
        response.msg = "Email already registered.";
        return utility.apiResponse(req, res, response);
      }
    }

    // -----------------------------
    // CHECK DUPLICATE MOBILE
    // -----------------------------
    if (!utility.checkEmptyString(body.mobile_no)) {
      let mobileExist = await dbQuery.rawQuery(
        constants.vals.defaultDB,
        `
                SELECT user_id FROM users
                WHERE TRIM(mobile_no) = '${body.mobile_no}'
                AND is_delete = 0
                LIMIT 1
                `
      );

      if (mobileExist.length > 0) {
        response.msg = "Mobile number already registered.";
        return utility.apiResponse(req, res, response);
      }
    }

    // -----------------------------
    // HASH PASSWORD
    // -----------------------------
    const hashedPassword = await bcrypt.hash(body.password, 10);

    // -----------------------------
    // INSERT USER
    // -----------------------------
    let userId = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "users",
      {
        name: body.name,
        email: body.email || null,
        mobile_no: body.mobile_no || null,
        password: hashedPassword,
        firebase_token: "",
        is_active: 1,
        is_delete: 0,
        created_at: req.locals.now
      }
    );

    // -----------------------------
    // GENERATE JWT TOKEN FOR AUTO LOGIN
    // -----------------------------
    const token = jwt.sign(
      { user_id: userId, mobile_no: body.mobile_no },
      "apiservice",
      { expiresIn: "7d" }
    );

    // -----------------------------
    // STORE TOKEN IN `users.user_Token`
    // -----------------------------
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "users",
      `user_id=${userId}`,
      `
                user_Token='${token}',
                updated_at='${req.locals.now}'
            `
    );

    // -----------------------------
    // SUCCESS RESPONSE
    // -----------------------------
    return utility.apiResponse(req, res, {
      status: "success",
      msg: "User registered successfully.",
      data: {
        user_id: userId,
        token
      }
    });

  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};




exports.userLogin = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };

    const body = req?.body?.inputdata || {};
    const mobileNo = body.mobile_no?.trim();
    const userName = body.name || "User";
    const firebaseToken = body.firebasetoken?.trim() || null;

    console.log(req.body.inputdata);
    console.log("dasdasdasdasd");
    
    

    // ✅ Validate mobile
    if (!mobileNo) {
      response.msg = "Mobile number required";
      return utility.apiResponse(req, res, response);
    }

    // Normalize phone number - remove +91 prefix
    let normalizedMobile = mobileNo;
    if (mobileNo.startsWith('+91')) {
      normalizedMobile = mobileNo.substring(3);
    } else if (mobileNo.startsWith('91')) {
      normalizedMobile = mobileNo.substring(2);
    }

    console.log(`📱 Login attempt - Original: ${mobileNo}, Normalized: ${normalizedMobile}`);

    // 🚩 Track if this is a new user or existing
    let is_register = 0; // 0 = Existing user

    // ✅ Fetch user
    let user = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE mobile_no='${normalizedMobile}' AND is_delete=0`,
      "user_id, name, mobile_no, email, is_active"
    );

    // ⭐ Normalize helper response (VERY IMPORTANT)
    if (Array.isArray(user)) {
      user = user[0];
    }

    // ✅ If not exists → register (NEW USER)
    if (!user) {
      is_register = 1; // 1 = NEW user
      console.log(`👤 Creating new user during login: ${normalizedMobile}`);
      
      const userId = await dbQuery.insertSingle(
        constants.vals.defaultDB,
        "users",
        {
          name: userName,
          mobile_no: normalizedMobile,
          firebase_token: firebaseToken,
          is_active: 1,
          is_delete: 0,
          created_at: req.locals.now
        }
      );

      if (!userId) {
        console.error("Insert failed — no insertId");
        response.msg = "User creation failed";
        return utility.apiResponse(req, res, response);
      }

      user = {
        user_id: userId,
        name: userName,
        mobile_no: normalizedMobile,
        email: null,
        is_active: 1
      };
    } else {
      console.log(`✅ Existing user login: ${normalizedMobile}`);
    }

    // ✅ Ensure valid user_id
    const userId = Number(user?.user_id);

    if (!userId || isNaN(userId)) {
      console.log("USER OBJECT BROKEN:", user);
      response.msg = "Invalid user ID";
      return utility.apiResponse(req, res, response);
    }

    // ✅ Generate JWT
    const token = jwt.sign(
      {
        user_id: userId,
        mobile_no: user.mobile_no
      },
      "apiservice",
      { expiresIn: "7d" }
    );

    // ✅ Update token
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "users",
      `user_id='${userId}'`,
      `
        user_Token='${token}',
        firebase_token='${firebaseToken}',
        updated_at='${req.locals.now}'
      `
    );

    // ✅ Check if user is a driver (match mobile number with delivery_boys table)
    const deliveryBoyCheck = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "delivery_boys",
      `WHERE mobile_no='${user.mobile_no}' AND is_active=1`,
      "delivery_boy_id, first_name, mobile_no"
    );

    response.status = "success";
    response.msg = "Login successful";
    response.data = {
      user: {
        user_id: userId,
        name: user.name,
        mobile_no: user.mobile_no,
        email: user.email
      },
      token,
      is_register: is_register  // 1 = New user (needs to complete profile), 0 = Existing user
    };

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("User Login Error:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};



exports.getUserProfile = async (req, res) => {
  try {
    const user_id = req.userInfo?.user_id;

    if (!user_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Unauthorized"
      });
    }

    // -----------------------------
    // 1️⃣ Fetch user basic info
    // -----------------------------
    const user = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE user_id=${user_id} AND is_delete=0`,
      `
        user_id,
        name,
        email,
        mobile_no,
        is_active,
        created_at
      `
    );

    if (!user) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "User not found"
      });
    }

    // -----------------------------
    // 2️⃣ Wallet calculation
    // -----------------------------
    const walletTxns = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT type, amount
      FROM wallet_transactions
      WHERE user_id=${user_id}
      `
    );

    let wallet_balance = 0;

    for (let t of walletTxns) {
      if (t.type === "debit") wallet_balance += Number(t.amount);
      if (t.type === "credit") wallet_balance -= Number(t.amount);
    }

    // -----------------------------
    // 3️⃣ Default address (optional)
    // -----------------------------
    const address = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `WHERE user_id=${user_id} AND is_default=1`,
      `
        address_id,
        full_address,
        city,
        pincode
      `
    );

    // ✅ Check if user is a delivery boy (match mobile number)
    // ✅ This allows users identified as delivery boys to access delivery boy features
    const deliveryBoyCheck = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "delivery_boys",
      `WHERE mobile_no='${user.mobile_no}' AND is_active=1`,
      "delivery_boy_id, first_name, last_name, mobile_no, is_active"
    );

    const isDeliveryBoy = deliveryBoyCheck ? true : false;

    // Normalize array response if needed
    const deliveryBoyData = Array.isArray(deliveryBoyCheck) ? deliveryBoyCheck[0] : deliveryBoyCheck;

    // -----------------------------
    // 4️⃣ Subscription status
    // -----------------------------
    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    const subscription = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "subscriptions",
      `WHERE user_id=${user_id} 
      AND end_date IS NOT NULL 
      AND end_date > '${now}' 
      ORDER BY end_date DESC`,
      "subscription_id, start_date, end_date"
    );

    console.log(subscription);
    console.log("Subscription fetched for user profile");


    // -----------------------------
    // ✅ Final response
    // -----------------------------
    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Profile fetched",
      data: {
        user: {
          user_id: user.user_id,
          name: user.name,
          email: user.email,
          mobile_no: user.mobile_no,
          is_active: user.is_active,
          is_delivery_boy: isDeliveryBoy,
          created_at: user.created_at
        },
        wallet: {
          balance: wallet_balance.toFixed(2)
        },
        subscription: {
          is_premium: subscription && subscription.length !== 0 ? true : false,
          start_date: subscription?.start_date || null,
          end_date: subscription?.end_date || null
        },
        address: address || null,
        delivery_boy_info: isDeliveryBoy ? {
          delivery_boy_id: deliveryBoyData?.delivery_boy_id,
          first_name: deliveryBoyData?.first_name,
          last_name: deliveryBoyData?.last_name,
          mobile_no: deliveryBoyData?.mobile_no,
          is_active: deliveryBoyData?.is_active
        } : null
      }
    });

  } catch (err) {
    console.error("GET USER PROFILE ERROR", err);
    res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};

exports.getUnreadNotificationCount = async (req, res) => {
  try {

    const user_id = req.userInfo.user_id;

    const row = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "notifications",
      `WHERE user_id=${user_id} AND is_read=0 AND is_deleted=0`,
      "COUNT(*) AS total"
    );

    return utility.apiResponse(req, res, {
      status: "success",
      data: {
        count: Number(row.total)
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      msg: "Server error"
    });
  }
};

exports.getNotifications = async (req, res) => {
  try {

    const user_id = req.userInfo.user_id;

    const notifications = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        notification_id,
        user_id,
        title,
        message,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = ${user_id} AND is_deleted = 0
      ORDER BY notification_id DESC
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Notifications fetched",
      data: notifications
    });

  } catch (err) {
    console.error("GET NOTIFICATIONS ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};




exports.markNotificationsRead = async (req, res) => {
  try {

    const user_id = req.userInfo.user_id;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "notifications",
      `user_id=${user_id} AND is_deleted=0`,
      "is_read=1"
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Marked read"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error" });
  }
};

/**
 * DELETE NOTIFICATION
 * POST /api/delete_notification
 * Body: { notification_id: 123 }
 * Deletes a specific notification for the user
 */
exports.deleteNotification = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    let response = { status: "error", msg: "" };
    
    const body = req.body.inputdata || {};
    const notification_id = body.notification_id;

    // ✅ Validate input
    if (!notification_id) {
      response.msg = "Notification ID is required";
      return utility.apiResponse(req, res, response);
    }

    // ✅ Check if notification exists for this user
    const notificationExists = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "notifications",
      `WHERE notification_id=${notification_id} AND user_id=${user_id} AND is_deleted=0`,
      "notification_id"
    );

    if (!notificationExists) {
      response.msg = "Notification not found";
      return utility.apiResponse(req, res, response);
    }

    // ✅ Delete notification
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "notifications",
      `notification_id=${notification_id} AND user_id=${user_id}`,
      "is_deleted=1, updated_at='${new Date().toISOString().slice(0, 19).replace('T', ' ')}'"
    );

    response.status = "success";
    response.msg = "Notification deleted successfully";
    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("DELETE NOTIFICATION ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};

exports.deleteAllNotifications = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const response = { status: "error", msg: "" };

    const notificationCount = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "notifications",
      `WHERE user_id=${user_id} AND is_deleted=0`,
      "COUNT(*) AS total"
    );

    if (!notificationCount || Number(notificationCount.total) === 0) {
      response.msg = "No notifications found";
      return utility.apiResponse(req, res, response);
    }

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "notifications",
      `user_id=${user_id} AND is_deleted=0`,
      `is_deleted=1, updated_at='${new Date().toISOString().slice(0, 19).replace('T', ' ')}'`
    );

    response.status = "success";
    response.msg = "All notifications deleted successfully";
    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("DELETE ALL NOTIFICATIONS ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {

    let response = { status: "error", msg: "" };
    const user_id = req.userInfo?.user_id;

    if (!user_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Unauthorized"
      });
    }

    const body = req.body.inputdata || {};
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();

    if (!name && !email) {
      response.msg = "Name or email required";
      return utility.apiResponse(req, res, response);
    }

    /// ✅ Fetch current user
    let user = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE user_id=${user_id} AND is_delete=0`,
      "user_id, name, email, mobile_no"
    );

    if (Array.isArray(user)) {
      user = user[0];
    }

    if (!user) {
      response.msg = "User not found";
      return utility.apiResponse(req, res, response);
    }

    /// ✅ Email duplicate check
    if (email && email !== user.email) {

      let existingEmail = await dbQuery.rawQuery(
        constants.vals.defaultDB,
        `
        SELECT user_id
        FROM users
        WHERE LOWER(TRIM(email))='${email}'
        AND is_delete=0
        AND user_id != ${user_id}
        LIMIT 1
        `
      );

      if (existingEmail.length > 0) {
        response.msg = "Email already registered";
        return utility.apiResponse(req, res, response);
      }
    }

    /// ✅ Build update fields
    let updateFields = [];

    if (name) {
      updateFields.push(`name='${name}'`);
    }

    if (email) {
      updateFields.push(`email='${email}'`);
    }

    updateFields.push(`updated_at='${req.locals.now}'`);

    /// ✅ Update user
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "users",
      `user_id=${user_id}`,
      updateFields.join(", ")
    );

    /// ✅ Fetch updated user
    let updatedUser = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE user_id=${user_id} AND is_delete=0`,
      "user_id, name, email, mobile_no, is_active, created_at"
    );

    if (Array.isArray(updatedUser)) {
      updatedUser = updatedUser[0];
    }

    response.status = "success";
    response.msg = "Profile updated successfully";
    response.data = {
      user: updatedUser
    };

    return utility.apiResponse(req, res, response);

  } catch (err) {

    console.error("UPDATE USER PROFILE ERROR:", err);

    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });

  }
};


exports.userGetMeals = async (req, res) => {
  try {
    const condition = "WHERE is_delete = 0 AND is_active = 1";
    const fields = `
      meals_id,
      meals_name,
      price,
      description,
      bread_count,
      subji_count,
      other_count,
      included_side_items,
      is_special_meal,
      image,
      special_item_id,
      created_at
    `;

    const meals = await dbQuery.fetchRecords(
      constants.vals.defaultDB,
      "meals",
      condition,
      fields
    );

    const normalizeJSON = (val) => {
      if (!val) return [];
      if (typeof val === "string") try { return JSON.parse(val); } catch { return []; }
      if (typeof val === "object") return val;
      return [];
    };

    const finalMeals = meals.map(meal => {

      const includedSideItems = normalizeJSON(meal.included_side_items);

      // ✅ SPECIAL MEAL RULES
      if (meal.is_special_meal == 1) {
        return {
          ...meal,
          included_side_items: includedSideItems,
          side_items_count: 1,
          selection_rules: {
            meal_type: "special",
            allow_special_item: true,
            special_item_required: true,

            allow_bread: false,
            bread_count: 0,

            allow_subji: false,
            subji_count: 0,

            allow_other_items: false,
            other_count: 0,

            included_side_items: includedSideItems,
            side_items_count: 1
          }
        };
      }

      // ✅ NORMAL MEAL RULES
      return {
        ...meal,
        included_side_items: includedSideItems,
        side_items_count: 1,
        selection_rules: {
          meal_type: "normal",

          allow_bread: meal.bread_count > 0,
          bread_count: meal.bread_count,

          allow_subji: meal.subji_count > 0,
          subji_count: meal.subji_count,

          allow_other_items: meal.other_count > 0,
          other_count: meal.other_count,

          included_side_items: includedSideItems,
          side_items_count: 1
        }
      };
    });

    console.log(finalMeals);
    console.log("ndjashdjsadhjasd");

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Meals fetched successfully.",
      data: finalMeals
    });

  } catch (error) {
    console.error("Get Meals Error:", error);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};


exports.userGetSubjiList = async (req, res) => {
  try {
    const condition = "WHERE is_delete = 0 AND is_active = 1";
    const fields = "subji_id, name, price, created_at";

    const list = await dbQuery.fetchRecords(
      constants.vals.defaultDB,
      "subjis",
      condition,
      fields
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Subji list fetched.",
      data: list
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};

exports.userGetBreadList = async (req, res) => {
  try {
    const condition = "WHERE is_delete = 0 AND is_active = 1";
    const fields = "bread_id, name, price, created_at";

    const list = await dbQuery.fetchRecords(
      constants.vals.defaultDB,
      "breads",
      condition,
      fields
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Bread list fetched.",
      data: list
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};

exports.getSpecialItems = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };

    const list = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT special_item_id, name, price
             FROM special_items
             WHERE is_delete = 0 AND is_active = 1
             ORDER BY special_item_id DESC`
    );

    response.status = "success";
    response.msg = "Active special items fetched.";
    response.data = list;

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("User Special Items Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};

exports.userGetSideItems = async (req, res) => {
  try {
    const list = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT side_item_id, name, price
       FROM side_items
       WHERE is_delete = 0 AND is_active = 1
       ORDER BY side_item_id ASC`
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Side items fetched.",
      data: list
    });
  } catch (err) {
    console.error("User Side Items Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};

/**
 * GET OTHER ITEMS (User Side)
 * GET /api/get_other_items
 * Returns all active other items
 */
exports.getOtherItems = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };

    const listQuery = `
            SELECT other_item_id, name, price, created_at
            FROM other_items
            WHERE is_delete = 0 AND is_active = 1
            ORDER BY other_item_id DESC
        `;

    const list = await dbQuery.rawQuery(constants.vals.defaultDB, listQuery);

    response.status = "success";
    response.msg = "Other items list fetched.";
    response.data = list;

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Get Other Items Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};

exports.addUserAddress = async (req, res) => {
  try {
    let body = req.body.inputdata;
    let response = { status: "error", msg: "" };
    const userId = req.userInfo.user_id;


    log("Add Address Body:", body);

    if (!body.full_address) {
      response.msg = "Full address is required.";
      return utility.apiResponse(req, res, response);
    }

    // If setting default → remove default from others
    if (body.is_default == 1) {
      await dbQuery.updateRecord(
        constants.vals.defaultDB,
        "user_addresses",
        `user_id=${userId}`,
        `is_default=0`
      );
    }

    const params = {
      user_id: userId,
      address_title: body.address_title || null,
      full_address: body.full_address,
      block_no: body.block_no || null,
      area_name: body.area_name || null,
      landmark: body.landmark || null,
      city: body.city || null,
      state: body.state || null,
      pincode: body.pincode || null,
      latitude: body.latitude || null,
      longitude: body.longitude || null,
      is_default: body.is_default || 0,
      is_active: 1,
      is_delete: 0,
      created_at: req.locals.now
    };

    const insertId = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "user_addresses",
      params
    );

    response.status = "success";
    response.msg = "Address added successfully.";
    response.data = { address_id: insertId };

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Add Address Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.editUserAddress = async (req, res) => {
  try {
    let body = req.body.inputdata;
    let response = { status: "error", msg: "" };
    const userId = req.userInfo.user_id;

    if (!body.address_id) {
      response.msg = "Address ID is required.";
      return utility.apiResponse(req, res, response);
    }

    const record = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `WHERE address_id=${body.address_id} AND user_id=${userId} AND is_delete=0`,
      "address_id"
    );

    if (!record) {
      response.msg = "Address not found.";
      return utility.apiResponse(req, res, response);
    }

    if (body.is_default == 1) {
      await dbQuery.updateRecord(
        constants.vals.defaultDB,
        "user_addresses",
        `user_id=${userId}`,
        `is_default=0`
      );
    }

    const updateValue = `
            address_title='${body.address_title || ""}',
            full_address='${body.full_address || ""}',
            block_no='${body.block_no || ""}',
            area_name='${body.area_name || ""}',
            landmark='${body.landmark || ""}',
            city='${body.city || ""}',
            state='${body.state || ""}',
            pincode='${body.pincode || ""}',
            latitude='${body.latitude || ""}',
            longitude='${body.longitude || ""}',
            is_default=${body.is_default || 0},
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `address_id=${body.address_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Address updated successfully.";
    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Edit Address Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.deleteUserAddress = async (req, res) => {
  try {
    let body = req.body.inputdata;
    let response = { status: "error", msg: "" };
    const userId = req.userInfo.user_id;

    if (!body.address_id) {
      response.msg = "Address ID is required.";
      return utility.apiResponse(req, res, response);
    }

    const exists = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `WHERE address_id=${body.address_id} AND user_id=${userId} AND is_delete=0`,
      "address_id"
    );

    if (!exists) {
      response.msg = "Address not found.";
      return utility.apiResponse(req, res, response);
    }

    const updateValue = `
            is_delete=1,
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `address_id=${body.address_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Address deleted successfully.";
    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Delete Address Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};



exports.listUserAddresses = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    const userId = req.userInfo.user_id;

    const list = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT address_id, address_title, full_address, landmark, block_no, area_name, city, state,
                    pincode, latitude, longitude, is_default, created_at
             FROM user_addresses
             WHERE user_id=${userId} AND is_delete=0
             ORDER BY is_default DESC, address_id DESC`
    );

    response.status = "success";
    response.msg = "Address list fetched.";
    response.data = list;

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("List Address Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.addToCart = async (req, res) => {
  try {
    const body = req.body.inputdata || {};
    const user_id = req.userInfo?.user_id;


    console.log("Add to Cart Body:", body);


    if (!user_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Unauthorized"
      });
    }

    if (!body.meal_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Meal ID required"
      });
    }

    const pick = r => Array.isArray(r) ? r[0] : r;

    // -----------------------------
    // Fetch Meal
    // -----------------------------
    const meal = pick(await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "meals",
      `WHERE meals_id=${body.meal_id}`,
      "meals_id, price, is_special_meal"
    ));

    if (!meal) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Meal not found"
      });
    }

    const mealQty = Number(body.meal_quantity || 1);
    const mealPrice = mealQty * Number(meal.price);

    let extraItems = [];
    let extraTotal = 0;

    // -----------------------------
    // EXTRA ITEMS LOGIC
    // -----------------------------
    if (Array.isArray(body.extra_items)) {
      for (let ex of body.extra_items) {

        let item = null;
        let type = null;

        // 🔴 SPECIAL MEAL → ONLY SPECIAL ITEMS
        if (meal.is_special_meal == 1) {

          item = pick(await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${ex.item_id}`,
            "special_item_id AS id, name, price"
          ));

          if (!item) {
            return utility.apiResponse(req, res, {
              status: "error",
              msg: "Only special items allowed with special meal"
            });
          }

          type = "special";
        }

        // 🟢 NORMAL MEAL → BREAD / SUBJI / OTHER_ITEM / SIDE_ITEM
        if (meal.is_special_meal == 0) {

          // ✅ Try BREAD
          item = pick(await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${ex.item_id}`,
            "bread_id AS id, name, price"
          ));
          if (item) type = "bread";

          // ✅ Try SUBJI
          if (!item) {
            item = pick(await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "subjis",
              `WHERE subji_id=${ex.item_id}`,
              "subji_id AS id, name, price"
            ));
            if (item) type = "subji";
          }

          // ✅ Try OTHER_ITEM
          if (!item) {
            item = pick(await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "other_items",
              `WHERE other_item_id=${ex.item_id}`,
              "other_item_id AS id, name, price"
            ));
            if (item) type = "other_item";
          }

          // ✅ Try SIDE_ITEM
          if (!item) {
            item = pick(await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "side_items",
              `WHERE side_item_id=${ex.item_id}`,
              "side_item_id AS id, name, price"
            ));
            if (item) type = "side_item";
          }

          if (!item) continue;
        }

        const qty = Number(ex.quantity || 1);
        const subtotal = qty * Number(item.price);

        extraItems.push({
          item_id: item.id,
          item_type: type,
          quantity: qty,
          price: item.price,
          subtotal
        });

        extraTotal += subtotal;
      }
    }

    const finalTotal = mealPrice + extraTotal;

    // -----------------------------
    // SAVE CART
    // -----------------------------
    const cartID = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "user_cart",
      {
        user_id,
        meal_id: body.meal_id,
        meal_quantity: mealQty,
        selected_items: JSON.stringify(body.selected_items || {}),
        extra_items: JSON.stringify(extraItems),
        total_price: finalTotal,
        created_at: req.locals.now,
        updated_at: req.locals.now
      }
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Item added",
      data: {
        cart_id: cartID,
        total_price: finalTotal
      }
    });

  } catch (err) {
    console.error("ADD CART ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};





exports.getCart = async (req, res) => {
  try {
    const user_id = req.userInfo?.user_id;

    if (!user_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Unauthorized"
      });
    }

    const cartList = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT * FROM user_cart WHERE user_id=${user_id} ORDER BY cart_id DESC`
    );

    let finalCart = [];

    for (let c of cartList) {

      const selected = JSON.parse(c.selected_items || "{}");
      const extras = JSON.parse(c.extra_items || "[]");

      // -----------------------------
      // Meal
      // -----------------------------
      const meal = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "meals",
        `WHERE meals_id=${c.meal_id}`,
        "meals_id, meals_name, price, bread_count, subji_count, other_count, buttermilk_count, salad_count, is_special_meal, image"
      );

      // -----------------------------
      // Selected Items
      // -----------------------------
      let bread = null;
      let subjis = [];
      let otherItems = [];
      let specialItem = null;

      if (meal.is_special_meal == 0) {

        if (selected.bread_id) {
          bread = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${selected.bread_id}`,
            "bread_id, name, price"
          );
        }

        if (Array.isArray(selected.subji_ids)) {
          for (let sid of selected.subji_ids) {
            const s = await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "subjis",
              `WHERE subji_id=${sid}`,
              "subji_id, name, price"
            );
            if (s) subjis.push(s);
          }
        }

        if (Array.isArray(selected.other_item_ids)) {
          for (let oid of selected.other_item_ids) {
            const o = await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "other_items",
              `WHERE other_item_id=${oid}`,
              "other_item_id, name, price"
            );
            if (o) otherItems.push(o);
          }
        }

      } else {
        if (selected.special_item_id) {
          specialItem = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${selected.special_item_id}`,
            "special_item_id, name, price"
          );
        }
      }

      // -----------------------------
      // Extra Items
      // -----------------------------
      let extraItems = [];

      for (let ex of extras) {
        let item = null;

        if (ex.item_type === "bread") {
          item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${ex.item_id}`,
            "name, price"
          );
        }

        if (ex.item_type === "subji") {
          item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${ex.item_id}`,
            "name, price"
          );
        }

        if (ex.item_type === "other_item") {
          item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "other_items",
            `WHERE other_item_id=${ex.item_id}`,
            "name, price"
          );
        }

        if (ex.item_type === "side_item") {
          item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "side_items",
            `WHERE side_item_id=${ex.item_id}`,
            "name, price"
          );
        }

        if (ex.item_type === "special") {
          item = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${ex.item_id}`,
            "name, price"
          );
        }

        if (!item) continue;

        extraItems.push({
          item_id: ex.item_id,
          item_type: ex.item_type,
          name: item.name,
          price: item.price,
          quantity: ex.quantity,
          subtotal: ex.subtotal
        });
      }

      finalCart.push({
        cart_id: c.cart_id,
        total_price: c.total_price,
        meal_quantity: c.meal_quantity,
        created_at: c.created_at,

        meal: {
          meal_id: meal.meals_id,
          name: meal.meals_name,
          price: meal.price,
          image: meal.image,
          structure: {
            bread_count: meal.bread_count,
            subji_count: meal.subji_count,
            other_count: meal.other_count,
            buttermilk_count: meal.buttermilk_count,
            salad_count: meal.salad_count,
            is_special_meal: meal.is_special_meal
          }
        },

        selected_items: {
          bread,
          subjis,
          other_items: otherItems,
          special_item: specialItem,
          has_buttermilk: selected.has_buttermilk || false,
          has_salad: selected.has_salad || false,
          salad_without_onion: selected.salad_without_onion || false
        },

        extra_items: extraItems
      });
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Cart fetched",
      data: finalCart
    });

  } catch (err) {
    console.error("GET CART ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};







exports.deleteCart = async (req, res) => {
  try {
    const body = req.body.inputdata;

    if (!body.cart_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Cart ID required."
      });
    }

    await dbQuery.deleteRecord(
      constants.vals.defaultDB,
      "user_cart",
      `cart_id=${body.cart_id}`
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Cart deleted successfully."
    });

  } catch (err) {
    console.error("Delete Cart Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};
function isSlotOpen(slot, setting, deliveryDate) {

  const today = todayDate();      // "2026-04-21"
  const now = nowTime();          // "22:42:14"

  console.log("NOW =>", now);
  console.log("TODAY =>", today);
  console.log("DELIVERY DATE =>", deliveryDate);

  // 👉 If order is NOT for today → always allowed
  if (deliveryDate !== today) {
    return true;
  }

  // 👉 If order is for TODAY → check cutoff
  if (slot === "lunch" && now > setting.lunch_cutoff) {
    return false;
  }

  if (slot === "dinner" && now > setting.dinner_cutoff) {
    return false;
  }

  return true;
}

function getEffectiveCutoff(slot, setting, hasPremiumSubscription) {
  const cutoffKey = slot === "lunch" ? "lunch_cutoff" : "dinner_cutoff";
  const cutoff = moment(setting[cutoffKey], "HH:mm:ss");

  if (hasPremiumSubscription) {
    cutoff.add(1, "hour");
  }

  return cutoff.format("HH:mm:ss");
}

function isSlotOpenForUser(slot, setting, deliveryDate, hasPremiumSubscription) {
  const effectiveSetting = {
    lunch_cutoff: getEffectiveCutoff("lunch", setting, hasPremiumSubscription),
    dinner_cutoff: getEffectiveCutoff("dinner", setting, hasPremiumSubscription)
  };

  return isSlotOpen(slot, effectiveSetting, deliveryDate);
}

exports.createOrder = async (req, res) => {
  try {

    const user_id = req.userInfo.user_id;
    let { address_id, slot, delivery_dates, payment_type } = req.body.inputdata;

    console.log("📦 ORDER INPUT DATA:", JSON.stringify(req.body.inputdata));
    
    /* ===============================
       NORMALIZE PAYMENT TYPE
    =============================== */
    
    // Normalize payment types to accepted database values
    if (!payment_type) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Payment type is required"
      });
    }

    // Map frontend payment types to database values
    const paymentTypeMap = {
      'pay_later': 'later',
      'wallet': 'later',
      'card': 'card',
      'upi': 'upi',
      'cod': 'cod'
    };

    payment_type = paymentTypeMap[payment_type] || payment_type.toLowerCase();

    // Validate payment type is one of the accepted values
    const acceptedPaymentTypes = ['later', 'card', 'upi', 'cod'];
    if (!acceptedPaymentTypes.includes(payment_type)) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: `Invalid payment type: ${payment_type}. Accepted types: ${acceptedPaymentTypes.join(', ')}`
      });
    }

    /* ===============================
       VALIDATIONS
    =============================== */

    if (!slot || !["lunch", "dinner"].includes(slot)) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Invalid slot"
      });
    }

    if (!delivery_dates?.length) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Delivery dates required"
      });
    }

    /* ===============================
       CART CHECK
    =============================== */

    const cartItems = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT * FROM user_cart WHERE user_id=${user_id}`
    );

    if (!cartItems.length) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Cart empty"
      });
    }

    /* ===============================
       ORDER SETTINGS
    =============================== */

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
      `WHERE user_id=${user_id} AND status='active' AND start_date <= '${today}' AND end_date >= '${today}' ORDER BY end_date DESC`,
      "subscription_id"
    );

    const hasPremiumSubscription = !!activeSubscription;




    for (let date of delivery_dates) {
      const allowed = isSlotOpenForUser(slot, setting, date, hasPremiumSubscription);

      if (!allowed) {
        return res.status(404).json({
          status: "error",
          msg: hasPremiumSubscription
            ? `${slot} orders closed after premium cutoff`
            : `${slot} orders closed`
        });
      }
    }

    /* ===============================
       AUTO DELIVERY BOY DETECT
    =============================== */

    const address = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "user_addresses",
      `WHERE address_id=${address_id}`,
      "address_id, latitude, longitude, full_address"
    );

    console.log("📍 FETCHED ADDRESS:", JSON.stringify(address));

    let autoDeliveryBoy = null;

    // Validate address has valid coordinates
    if (!address) {
      console.log(`❌ ADDRESS NOT FOUND - address_id: ${address_id}`);
    } else if (!address.latitude || !address.longitude || address.latitude === 0 || address.longitude === 0) {
      console.log(`⚠️ INVALID COORDINATES - Address ${address_id} has lat: ${address.latitude}, lng: ${address.longitude}`);
      console.log(`   Please update address coordinates from user profile before placing order`);
    } else {
      console.log(`✅ Valid address with coords [${address.latitude}, ${address.longitude}]`);
      autoDeliveryBoy = await assignmentService.getAutoAssignedBoy(
        Number(address.latitude),
        Number(address.longitude)
      );
    }

    console.log("AUTO ASSIGNED BOY =>", autoDeliveryBoy);

    /* ===============================
       TOTAL AMOUNT
    =============================== */

    let totalAmount = cartItems.reduce(
      (sum, c) => sum + Number(c.total_price),
      0
    );

    totalAmount *= delivery_dates.length;

    /* ===============================
       CREATE ORDER
    =============================== */

    const order_id = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "orders",
      {
        user_id,
        order_type: delivery_dates.length > 1 ? "subscription" : "single",
        total_amount: totalAmount,
        payment_type,
        is_paid: 0,
        status: "active",
        created_at: req.locals.now
      }
    );

    /* ===============================
       ORDER ITEMS + SCHEDULE
    =============================== */

    for (let c of cartItems) {

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
          created_at: req.locals.now
        }
      );

      for (let date of delivery_dates) {

        let invoiceNumber = null;

        if (autoDeliveryBoy) {
          invoiceNumber = await invoiceService.generateDeliveryInvoiceNumber(
            autoDeliveryBoy.delivery_boy_id
          );
        }

        // Determine payment status based on payment type
        let paymentStatus = "pending";
        if (payment_type === "cod") {
          paymentStatus = "cod"; // Cash on Delivery - pending collection
        } else if (payment_type === "card" || payment_type === "upi") {
          paymentStatus = "paid"; // Payment will be collected via Razorpay
        } else if (payment_type === "later") {
          paymentStatus = "paid"; // Pay Later - already debited from wallet
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
            payment_status: paymentStatus
          }
        );

      }
    }

    /* ===============================
       WALLET DEBIT
    =============================== */

    if (payment_type === "later") {
      await dbQuery.insertSingle(
        constants.vals.defaultDB,
        "wallet_transactions",
        {
          user_id,
          order_id,
          type: "debit",
          amount: totalAmount,
          description: "Order Placed (Pay Later)",
          created_at: req.locals.now
        }
      );
    }

    /* ===============================
       CLEAR CART
    =============================== */

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `DELETE FROM user_cart WHERE user_id=${user_id}`
    );

    /* ===============================
       PAY LATER RETURN
    =============================== */

    if (payment_type === "later") {
      return utility.apiResponse(req, res, {
        status: "success",
        msg: "Order Placed (Pay Later)",
        data: { order_id, totalAmount }
      });
    }

    /* ===============================
       ONLINE PAYMENT
    =============================== */

    const razorpayOrder = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: "INR",
      receipt: `order_${order_id}`
    });

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Proceed to payment",
      data: {
        order_id,
        razorpay: {
          key: process.env.RAZORPAY_KEY_ID,
          order_id: razorpayOrder.id,
          amount: razorpayOrder.amount
        }
      }
    });

  } catch (err) {

    console.error("CREATE ORDER ERROR:", err);

    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });

  }
};






exports.verifyPayment = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const {
      payment_for,        // "order" | "wallet"
      order_id,
      wallet_amount,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body.inputdata;

    /* VERIFY SIGNATURE */
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET || "Hqbl27FSCC5em6EHEdDUhY2w"
      )
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Payment verification failed"
      });
    }

    /* ======================
       ORDER PAYMENT
    ====================== */
    if (payment_for === "order") {

      const order = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "orders",
        `WHERE order_id=${order_id} AND user_id=${user_id}`
      );

      if (!order || order.is_paid == 1) {
        return utility.apiResponse(req, res, {
          status: "success",
          msg: "Order already paid or not found"
        });
      }

      const payment_id = await dbQuery.insertSingle(
        constants.vals.defaultDB,
        "payments",
        {
          user_id,
          order_id,
          payment_type: "order",
          transaction_id: razorpay_payment_id,
          amount: order.total_amount,
          payment_status: "completed",
          payment_date: req.locals.now
        }
      );

      await dbQuery.updateRecord(
        constants.vals.defaultDB,
        "orders",
        `order_id=${order_id}`,
        `
          is_paid=1,
          payment_type='online',
          payment_id=${payment_id}
        `
      );

      return utility.apiResponse(req, res, {
        status: "success",
        msg: "Order payment successful"
      });
    }

    /* ======================
       WALLET PAYMENT
    ====================== */
    if (payment_for === "wallet") {

      await dbQuery.insertSingle(
        constants.vals.defaultDB,
        "payments",
        {
          user_id,
          payment_type: "wallet",
          transaction_id: razorpay_payment_id,
          amount: wallet_amount,
          payment_status: "completed",
          payment_date: req.locals.now
        }
      );

      await dbQuery.insertSingle(
        constants.vals.defaultDB,
        "wallet_transactions",
        {
          user_id,
          type: "credit",
          amount: wallet_amount,
          description: "Wallet recharge (Razorpay)"
        }
      );

      return utility.apiResponse(req, res, {
        status: "success",
        msg: "Wallet recharge successful"
      });
    }

    return utility.apiResponse(req, res, {
      status: "error",
      msg: "Invalid payment type"
    });

  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};







exports.getMyOrders = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    
    // Get filter from query or body (default: "all")
    // Filters: "all" | "confirmed" (delivery_status in-transit/delivered) | "delivered" (all schedules delivered)
    const filter = ((req.query.filter || req.body.inputdata?.filter || "all")).toLowerCase();
    
    console.log(`📋 GET MY ORDERS - Filter: ${filter}, User: ${user_id}`);

    // Build dynamic query based on filter
    // Filter by delivery_status from order_schedule table (NOT orders.status)
    let filterCondition = "";
    
    if (filter === "confirmed") {
      // Confirmed = Order has started delivery (at least one schedule is in-transit or delivered)
      filterCondition = `AND EXISTS (
        SELECT 1 FROM order_schedule os_check 
        WHERE os_check.order_id = o.order_id 
        AND os_check.delivery_status IN ('pending')
      )`;
    } else if (filter === "delivered") {
      // Delivered = ALL schedules are delivered
      filterCondition = `AND NOT EXISTS (
        SELECT 1 FROM order_schedule os_check 
        WHERE os_check.order_id = o.order_id 
        AND os_check.delivery_status NOT IN ('delivered')
      )`;
    }
    // if filter === "all", no additional filterCondition

    // Fetch all orders for user with filter
    const orders = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        o.order_id,
        o.total_amount,
        o.order_type,
        o.is_paid,
        o.status,
        o.created_at,
        GROUP_CONCAT(os.delivery_date ORDER BY os.delivery_date) AS delivery_dates,
        MIN(os.slot) AS slot
      FROM orders o
      JOIN order_schedule os ON o.order_id = os.order_id
      WHERE o.user_id = ${user_id}
      ${filterCondition}
      GROUP BY o.order_id
      ORDER BY o.created_at DESC
      `
    );

    let enrichedOrders = [];

    // Enrich each order with detailed information
    for (let order of orders) {

      // 📆 Fetch schedules with address details
      const schedules = await dbQuery.rawQuery(
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
        WHERE os.order_id=${order.order_id}
        `
      );

      // 🍽 Fetch order items with meal details
      const itemsRaw = await dbQuery.rawQuery(
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
          bread = await dbQuery.fetchSingleRecord(
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
            let s = await dbQuery.fetchSingleRecord(
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
            row = await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "breads",
              `WHERE bread_id=${item_id}`,
              "name, price"
            );
          }

          if (ex.item_type === "subji") {
            row = await dbQuery.fetchSingleRecord(
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
            subjis,
            has_buttermilk: selected.has_buttermilk || false,
            has_salad: selected.has_salad || false,
            salad_without_onion: selected.salad_without_onion || false
          },
          extra_items
        });
      }

      enrichedOrders.push({
        order_id: order.order_id,
        total_amount: order.total_amount,
        order_type: order.order_type,
        is_paid: order.is_paid,
        status: order.status,
        created_at: order.created_at,
        delivery_dates: order.delivery_dates,
        slot: order.slot,
        schedules,
        items
      });
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "My orders fetched",
      data: enrichedOrders
    });

  } catch (err) {
    console.error("GET MY ORDERS ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};

exports.updateCart = async (req, res) => {
  try {
    const body = req.body.inputdata || {};
    const user_id = req.userInfo?.user_id;

    if (!user_id) {
      return utility.apiResponse(req, res, { status: "error", msg: "Unauthorized" });
    }

    if (!body.cart_id) {
      return utility.apiResponse(req, res, { status: "error", msg: "Cart ID required" });
    }

    const pick = r => Array.isArray(r) ? r[0] : r;

    /* ---------------- FETCH CART ---------------- */
    const cart = pick(await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "user_cart",
      `WHERE cart_id=${body.cart_id} AND user_id=${user_id}`,
      "*"
    ));

    if (!cart) {
      return utility.apiResponse(req, res, { status: "error", msg: "Cart not found" });
    }

    /* ---------------- FETCH MEAL ---------------- */
    const meal = pick(await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "meals",
      `WHERE meals_id=${cart.meal_id}`,
      "meals_id, price, is_special_meal"
    ));

    if (!meal) {
      return utility.apiResponse(req, res, { status: "error", msg: "Meal not found" });
    }

    /* ---------------- MEAL PRICE ---------------- */
    const mealQty = Number(body.meal_quantity || cart.meal_quantity || 1);
    const mealPrice = mealQty * Number(meal.price);

    /* ---------------- EXTRA ITEMS ---------------- */
    let extraItems = [];
    let extraTotal = 0;

    if (Array.isArray(body.extra_items)) {
      for (let ex of body.extra_items) {

        let item = null;
        let type = null;

        /* 🔴 SPECIAL MEAL → ONLY SPECIAL ITEMS */
        if (meal.is_special_meal == 1) {
          item = pick(await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "special_items",
            `WHERE special_item_id=${ex.item_id}`,
            "special_item_id AS id, price"
          ));

          if (!item) {
            return utility.apiResponse(req, res, {
              status: "error",
              msg: "Only special items allowed with special meal"
            });
          }

          type = "special";
        }

        /* 🟢 NORMAL MEAL → BREAD / SUBJI / OTHER_ITEMS / SIDE_ITEMS ONLY */
        if (meal.is_special_meal == 0) {
          item = pick(await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${ex.item_id}`,
            "bread_id AS id, price"
          ));
          if (item) type = "bread";

          if (!item) {
            item = pick(await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "subjis",
              `WHERE subji_id=${ex.item_id}`,
              "subji_id AS id, price"
            ));
            if (item) type = "subji";
          }

          if (!item) {
            item = pick(await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "other_items",
              `WHERE other_item_id=${ex.item_id}`,
              "other_item_id AS id, price"
            ));
            if (item) type = "other_item";
          }

          if (!item) {
            item = pick(await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "side_items",
              `WHERE side_item_id=${ex.item_id}`,
              "side_item_id AS id, price"
            ));
            if (item) type = "side_item";
          }

          if (!item) {
            return utility.apiResponse(req, res, {
              status: "error",
              msg: "Item not found or not allowed with this meal"
            });
          }
        }

        const qty = Number(ex.quantity || 1);
        const subtotal = qty * Number(item.price);

        extraItems.push({
          item_id: item.id,
          item_type: type,
          quantity: qty,
          price: item.price,
          subtotal
        });

        extraTotal += subtotal;
      }
    }

    /* ---------------- FINAL TOTAL ---------------- */
    const finalTotal = mealPrice + extraTotal;

    /* ---------------- UPDATE CART ---------------- */
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "user_cart",
      `cart_id=${body.cart_id}`,
      `
        meal_quantity=${mealQty},
        selected_items='${JSON.stringify(body.selected_items || {})}',
        extra_items='${JSON.stringify(extraItems)}',
        total_price=${finalTotal},
        updated_at='${req.locals.now}'
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Cart updated",
      data: {
        cart_id: body.cart_id,
        total_price: finalTotal
      }
    });

  } catch (err) {
    console.error("UPDATE CART ERROR", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};




exports.getOrderDetails = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const { order_id } = req.query;

    if (!order_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Order ID required"
      });
    }

    // 🧾 order
    const order = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "orders",
      `WHERE order_id=${order_id} AND user_id=${user_id}`
    );

    if (!order) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Order not found"
      });
    }

    // 📆 schedules
    const schedules = await dbQuery.rawQuery(
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
      WHERE os.order_id=${order_id}
      `
    );

    // 🍽 items
      const itemsRaw = await dbQuery.rawQuery(
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
        bread = await dbQuery.fetchSingleRecord(
          constants.vals.defaultDB,
          "breads",
          `WHERE bread_id=${bread_id}`,
          "bread_id, name, price"
        );
      }

      // 🍛 subjis
      let subjis = [];
      if (Array.isArray(selected.subji_ids)) {
        for (let sid of selected.subji_ids) {
          // Handle both: sid as number or as object {subji_id: X}
          const subji_id = typeof sid === 'object' ? sid.subji_id : sid;
          const s = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${subji_id}`,
            "subji_id, name, price"
          );
          if (s) subjis.push(s);
        }
      }

      // 🥒 other items
      let other_items = [];
      if (Array.isArray(selected.other_item_ids)) {
        for (let oid of selected.other_item_ids) {
          // Handle both: oid as number or as object {other_item_id: X}
          const other_item_id = typeof oid === 'object' ? oid.other_item_id : oid;
          const o = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "other_items",
            `WHERE other_item_id=${other_item_id}`,
            "other_item_id, name, price"
          );
          if (o) other_items.push(o);
        }
      }

      // ➕ extra items
      let extra_items = [];

      for (let ex of extras) {
        let row = null;
        // Handle both: ex.item_id as number or as object
        const item_id = typeof ex.item_id === 'object' ? ex.item_id.item_id : ex.item_id;

        if (ex.item_type === "bread") {
          row = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "breads",
            `WHERE bread_id=${item_id}`,
            "name, price"
          );
        }

        if (ex.item_type === "subji") {
          row = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "subjis",
            `WHERE subji_id=${item_id}`,
            "name, price"
          );
        }

        if (ex.item_type === "other") {
          row = await dbQuery.fetchSingleRecord(
            constants.vals.defaultDB,
            "other_items",
            `WHERE other_item_id=${item_id}`,
            "name, price"
          );
        }

        if (!row) continue;

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
          subjis,
          other_items
        },
        extra_items
      });
    }

    // 💳 wallet
    const wallet_transactions = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT type, amount, description, created_at
      FROM wallet_transactions
      WHERE order_id=${order_id}
      `
    );

    log("ORDER DETAILS =>", {
      order,
      schedules,
      items,
      wallet_transactions
    });
    console.log("asdmaskjdjsahdhas");
    

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Order details fetched",
      data: {
        order,
        schedules,
        items,
        wallet_transactions
      }
    });

  } catch (err) {
    console.error("ORDER DETAILS ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};






exports.cancelOrder = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;
    const { order_id } = req.body.inputdata;

    const order = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "orders",
      `WHERE order_id=${order_id} AND user_id=${user_id} AND status='active'`
    );

    if (!order) {
      return utility.apiResponse(req, res, { status: "error", msg: "Order not found" });
    }

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      UPDATE order_schedule
      SET status='cancelled'
      WHERE order_id=${order_id}
        AND delivery_date >= CURDATE()
      `
    );

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      UPDATE orders
      SET status='cancelled', cancelled_at=NOW()
      WHERE order_id=${order_id}
      `
    );

    if (order.is_paid == 0) {
      await dbQuery.insertSingle(constants.vals.defaultDB, "wallet_transactions", {
        user_id,
        order_id,
        type: "credit",
        amount: order.total_amount,
        description: "Order cancelled refund"
      });
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Order cancelled"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};







exports.getWallet = async (req, res) => {
  try {
    const user_id = req.userInfo.user_id;

    const txns = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT *
      FROM wallet_transactions
      WHERE user_id=${user_id}
      ORDER BY created_at DESC
      `
    );

    const completedPayments = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT
        payment_id,
        user_id,
        order_id,
        payment_type,
        transaction_id,
        amount,
        payment_status,
        payment_date,
        created_at
      FROM payments
      WHERE user_id=${user_id}
        AND payment_status='completed'
      ORDER BY COALESCE(payment_date, created_at) DESC
      `
    );

    let balance = 0;
    for (let t of txns) {
      if (t.type === 'credit') balance -= Number(t.amount);
      if (t.type === 'debit') balance += Number(t.amount);
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Wallet fetched",
      data: {
        balance: balance.toFixed(2),
        transactions: txns,
        completed_payments: completedPayments
      }
    });

  } catch (err) {
    console.error("GET WALLET ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};



exports.payWallet = async (req, res) => {
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
      receipt: `wallet_${user_id}_${Date.now()}`,
      payment_capture: 1
    });

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Proceed to wallet payment",
      data: {
        razorpay: {
          key: "rzp_test_S0ysEwOgi9ZKUb",
          order_id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency
        }
      }
    });

  } catch (err) {
    console.error("PAY WALLET ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};





/*
=====================================================================
🔐 OTP LOGIN ENDPOINTS (Twilio SMS)
=====================================================================
*/

/**
 * SEND OTP
 * POST /api/send_otp
 * Body: { mobile_no: "+91XXXXXXXXXX" }
 * Sends 6-digit OTP via Twilio SMS
 */
exports.sendOTP = async (req, res) => {
  try {
    const { mobile_no } = req.body.inputdata || {};
    const response = { status: "error", msg: "" };

    // ✅ Validate mobile number
    if (!mobile_no || mobile_no.trim() === "") {
      response.msg = "Mobile number is required";
      return utility.apiResponse(req, res, response);
    }

    const cleanMobile = mobile_no.trim();
    
    // Normalize phone number - remove +91 prefix
    let normalizedMobile = cleanMobile;
    if (cleanMobile.startsWith('+91')) {
      normalizedMobile = cleanMobile.substring(3);
    } else if (cleanMobile.startsWith('91')) {
      normalizedMobile = cleanMobile.substring(2);
    }

    console.log(`📱 OTP Request for: ${cleanMobile} (Normalized: ${normalizedMobile})`);

    // ✅ Import OTP service
    const otpService = require("../helpers/otpService");

    // ✅ Generate OTP
    const otp = otpService.generateOTP();
    console.log(`🔐 Generated OTP: ${otp}`);

    // ✅ Send OTP via Twilio
    const sendResult = await otpService.sendOTP(cleanMobile, otp);

    if (!sendResult.success) {
      response.msg = `Failed to send OTP: ${sendResult.error}`;
      return utility.apiResponse(req, res, response);
    }

    // ✅ Store OTP in database (use formatted number from sendResult)
    const formattedMobile = sendResult.formattedPhoneNumber || cleanMobile;
    
    try {
      await otpService.storeOTP(0, otp, formattedMobile);
    } catch (dbError) {
      console.error("Database error storing OTP:", dbError);
      response.msg = "Failed to store OTP";
      return utility.apiResponse(req, res, response);
    }

    response.status = "success";
    response.msg = "OTP sent successfully. Valid for 20 minutes.";
    response.data = {
      mobile_no: formattedMobile,
      messageSid: sendResult.messageSid
    };

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("❌ SEND OTP ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};

/**
 * VERIFY OTP
 * POST /api/verify_otp
 * Body: { mobile_no: "+91XXXXXXXXXX", otp: "123456" }
 * Verifies OTP and returns user token
 */



exports.verifyOTP = async (req, res) => {
  try {
    const { mobile_no, otp } = req.body.inputdata || {};
    const response = { status: "error", msg: "" };

    // ✅ Validate input
    if (!mobile_no || mobile_no.trim() === "") {
      response.msg = "Mobile number is required";
      return utility.apiResponse(req, res, response);
    }

    if (!otp || otp.trim() === "") {
      response.msg = "OTP is required";
      return utility.apiResponse(req, res, response);
    }

    const cleanMobile = mobile_no.trim();
    const cleanOTP = otp.trim();

    // Normalize phone number - remove +91 prefix for database queries
    let normalizedMobile = cleanMobile;
    if (cleanMobile.startsWith('+91')) {
      normalizedMobile = cleanMobile.substring(3);
    } else if (cleanMobile.startsWith('91')) {
      normalizedMobile = cleanMobile.substring(2);
    }

    console.log(`🔍 Verifying OTP for: ${cleanMobile} (Normalized: ${normalizedMobile})`);

    // ✅ Import OTP service
    const otpService = require("../helpers/otpService");

    // ✅ Verify OTP
    const verifyResult = await otpService.verifyOTP(cleanMobile, cleanOTP);

    if (!verifyResult.success) {
      response.msg = verifyResult.message;
      if (verifyResult.remainingAttempts !== undefined) {
        response.remainingAttempts = verifyResult.remainingAttempts;
      }
      return utility.apiResponse(req, res, response);
    }

    // ✅ OTP verified - Now get or create user (use normalized mobile)
    let user = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE mobile_no='${normalizedMobile}' AND is_delete=0`,
      "user_id, name, mobile_no, email, is_active"
    );

    // Normalize response
    if (Array.isArray(user)) {
      user = user[0];
    }
    
    // ✅ If user doesn't exist, create new user
    if (!user) {
      console.log(`👤 Creating new user for ${normalizedMobile}`);
      
      const userId = await dbQuery.insertSingle(
        constants.vals.defaultDB,
        "users",
        {
          name: normalizedMobile.substring(normalizedMobile.length - 10), // Use last 10 digits as default name
          mobile_no: normalizedMobile,
          is_active: 1,
          is_delete: 0,
          created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        }
      );

      if (!userId) {
        response.msg = "User creation failed";
        return utility.apiResponse(req, res, response);
      }

      // ✅ Link user_id to OTP record after user creation
      try {
        await otpService.linkUserIdToOTP(userId, normalizedMobile);
      } catch (linkError) {
        console.error("⚠️ Warning: Failed to link user_id to OTP:", linkError.message);
        // Continue even if linking fails - user creation is successful
      }

      user = {
        user_id: userId,
        name: normalizedMobile.substring(normalizedMobile.length - 10),
        mobile_no: normalizedMobile,
        email: null,
        is_active: 1
      };
    } else {
      console.log(`✅ Existing user login: ${normalizedMobile}`);
    }

    // ✅ Ensure valid user_id
    const userId = Number(user?.user_id);

    if (!userId || isNaN(userId)) {
      console.error("USER OBJECT BROKEN:", user);
      response.msg = "Invalid user ID";
      return utility.apiResponse(req, res, response);
    }

    // ✅ Generate JWT Token
    const token = jwt.sign(
      {
        user_id: userId,
        mobile_no: user.mobile_no
      },
      "apiservice",
      { expiresIn: "7d" }
    );

    // ✅ Update user with token
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "users",
      `user_id='${userId}'`,
      `user_Token='${token}', updated_at='${new Date().toISOString().slice(0, 19).replace('T', ' ')}'`
    );

    // ✅ Check if user is a delivery boy
    let deliveryBoyCheck = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "delivery_boys",
      `WHERE mobile_no='${user.mobile_no}' AND is_active=1`,
      "delivery_boy_id, first_name, mobile_no"
    );

    if (Array.isArray(deliveryBoyCheck)) {
      deliveryBoyCheck = deliveryBoyCheck[0];
    }

    response.status = "success";
    response.msg = "OTP verified. Login successful";
    response.data = {
      user: {
        user_id: userId,
        name: user.name,
        mobile_no: user.mobile_no,
        email: user.email
      },
      token,
      isDeliveryBoy: !!deliveryBoyCheck
    };

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("❌ VERIFY OTP ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};

/**
 * RESEND OTP
 * POST /api/resend_otp
 * Body: { mobile_no: "+91XXXXXXXXXX" }
 * Generates and sends a new OTP (useful when user didn't receive first one)
 */
exports.resendOTP = async (req, res) => {
  try {
    const { mobile_no } = req.body.inputdata || {};
    const response = { status: "error", msg: "" };

    if (!mobile_no || mobile_no.trim() === "") {
      response.msg = "Mobile number is required";
      return utility.apiResponse(req, res, response);
    }

    const cleanMobile = mobile_no.trim();
    console.log(`📱 Resend OTP Request for: ${cleanMobile}`);

    const otpService = require("../helpers/otpService");

    // ✅ Generate new OTP
    const otp = otpService.generateOTP();

    // ✅ Send OTP via Twilio
    const sendResult = await otpService.sendOTP(cleanMobile, otp);

    if (!sendResult.success) {
      response.msg = `Failed to send OTP: ${sendResult.error}`;
      return utility.apiResponse(req, res, response);
    }

    // ✅ Store OTP in database (use formatted number from sendResult)
    const formattedMobile = sendResult.formattedPhoneNumber || cleanMobile;
    
    try {
      await otpService.storeOTP(0, otp, formattedMobile);
    } catch (dbError) {
      console.error("Database error storing OTP:", dbError);
      response.msg = "Failed to store OTP";
      return utility.apiResponse(req, res, response);
    }

    response.status = "success";
    response.msg = "New OTP sent successfully";
    response.data = {
      mobile_no: formattedMobile,
      messageSid: sendResult.messageSid
    };

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("❌ RESEND OTP ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};

// tifin api end

