const dbQuery = require("../helpers/query");
let constants = require("../vars/constants");
const utility = require('../helpers/utility');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require("fs");
const path = require("path");
const FileManager = require("../helpers/file_manager");
const { log } = require("console");
const configPath = path.join(__dirname, "../config/smsConfig.json");

// tifin api
exports.adminLogin = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    const body = req?.body?.inputdata;

    // Validation messages
    const messages = {
      email: "Email is required.",
      password: "Password is required."
    };

    // Check required fields
    for (let key in messages) {
      if (!body[key] || body[key].trim() === "") {
        response.msg = messages[key];
        return utility.apiResponse(req, res, response);
      }
    }

    // Fetch admin
    const condition = `WHERE email = '${body.email}' AND is_active = 1 AND is_delete = 0`;
    const fields = "admin_id, name, email, password, mobile_no";

    const adminData = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "admins",
      condition,
      fields
    );

    if (!adminData || adminData.length === 0) {
      response.msg = "Admin not found.";
      return utility.apiResponse(req, res, response);
    }

    const admin = adminData;

    // ❌ PASSWORD CHECK (PLAIN TEXT)
    if (body.password !== admin.password) {
      response.msg = "Incorrect password.";
      return utility.apiResponse(req, res, response);
    }

    // Remove password before sending response
    delete admin.password;

    // Generate JWT token
    const token = jwt.sign(
      { admin_id: admin.admin_id, email: admin.email },
      "apiservice",
      { expiresIn: "7d" }
    );

    // Store token
    const tokenParams = {
      admin_id: admin.admin_id,
      admin_token_JWT: token,
      admin_token_Firebase: body?.firebase_token || "",
      created_at: req.locals.now,
      is_active: 1,
      is_delete: 0
    };

    await dbQuery.insertSingle(constants.vals.defaultDB, "admin_token", tokenParams);

    // Success response
    response.status = "success";
    response.msg = "Login successful.";
    response.data = {
      admin,
      token
    };

    return utility.apiResponse(req, res, response);

  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};




exports.adminGetProfile = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };

    // Read JWT token
    const token = req.headers["authorization"];

    if (!token) {
      response.msg = "Token missing.";
      return utility.apiResponse(req, res, response);
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, "apiservice");
    } catch (err) {
      response.msg = "Invalid or expired token.";
      return utility.apiResponse(req, res, response);
    }

    // Fetch admin
    const condition = `WHERE admin_id = ${decoded.admin_id} AND is_active = 1 AND is_delete = 0`;
    const fields = "admin_id, name, email, mobile_no, created_at";

    const adminData = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "admins",
      condition,
      fields
    );

    if (!adminData || adminData.length === 0) {
      response.msg = "Admin not found.";
      return utility.apiResponse(req, res, response);
    }

    // Success response
    response.status = "success";
    response.msg = "Profile fetched successfully.";
    response.data = adminData;

    return utility.apiResponse(req, res, response);

  } catch (error) {
    console.error("Admin profile error:", error);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};


exports.addMeal = async (req, res) => {
  try {
    console.log("=== ADD MEAL REQUEST ===");
    console.log("req.body:", JSON.stringify(req.body, null, 2));
    console.log("req.body.inputdata:", req.body.inputdata);
    
    let body = req.body.inputdata;
    
    // Parse JSON string if needed (multipart/form-data sends JSON as string)
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    console.log("ADD MEAL INPUT:", body);
    console.log("ADD MEAL BODY IMAGE:", req.body.image);

    if (!body) {
      console.error("ERROR: body is undefined or null");
      return utility.apiResponse(req, res, { status: "error", msg: "Request body is empty" });
    }

    if (!body.meals_name || body.meals_name.trim() === "") {
      console.error("ERROR: meals_name missing or empty. meals_name:", body.meals_name);
      return utility.apiResponse(req, res, { status: "error", msg: "Meal name required" });
    }

    if (!body.price) {
      console.error("ERROR: price missing. price:", body.price);
      return utility.apiResponse(req, res, { status: "error", msg: "Meal price required" });
    }

    let breadConfig = [];
    let breadCount = 0;

    if (Array.isArray(body.bread_config)) {
      breadConfig = body.bread_config;
      breadCount = Math.max(...breadConfig.map(b => Number(b.qty || 0)), 0);
    }

    // Handle image upload - Check req.body.image (from disk storage middleware)
    let imageFileName = null;
    
    if (req.body && req.body.image && Array.isArray(req.body.image) && req.body.image.length > 0) {
      imageFileName = req.body.image[0];
      console.log("IMAGE FROM DISK STORAGE:", imageFileName);
    } else if (req.file) {
      // Fallback to single file upload
      imageFileName = req.file.filename;
      console.log("IMAGE FROM FILE UPLOAD:", imageFileName);
    }

    const params = {
      meals_name: body.meals_name,
      price: body.price,
      description: body.description || null,
      bread_count: breadCount,
      bread_config: JSON.stringify(breadConfig),
      subji_count: body.subji_count || 0,
      other_count: body.other_count || 0,
      is_special_meal: body.is_special_meal || 0,
      special_item_id: body.special_item_id || null,
      image: imageFileName || null,
      is_active: 1,
      is_delete: 0,
      created_at: req.locals.now
    };

    console.log("INSERT PARAMS:", params);

    const mealId = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "meals",
      params
    );

    console.log("MEAL INSERT RESPONSE:", mealId);

    // Handle both direct ID return and object with insertId property
    const actualMealId = mealId?.insertId || mealId;

    if (!actualMealId) {
      console.error("Insert failed — no mealId returned");
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Meal creation failed - no ID returned"
      });
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Meal added successfully",
      data: { meal_id: actualMealId }
    });

  } catch (err) {
    console.error("ADD MEAL ERROR", err);
    return res.status(500).json({ status: "error", msg: "Internal error: " + err.message });
  }
};






exports.getMeals = async (req, res) => {
  try {
    const meals = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        meals_id,
        meals_name,
        price,
        description,
        bread_count,
        bread_config,
        subji_count,
        other_count,
        is_special_meal,
        special_item_id,
        image,
        is_active
      FROM meals
      WHERE is_delete=0
      `
    );

    const normalizeJSON = (val) => {
      if (!val) return [];
      if (typeof val === "string") return JSON.parse(val);
      if (typeof val === "object") return val;
      return [];
    };

    const formatted = meals.map(m => ({
      ...m,
      bread_config: normalizeJSON(m.bread_config),
      image: m.image ? `${constants.vals.frontEndFilePath}meals/image/${m.image}` : null
    }));

    console.log("GET MEALS RESULT:", JSON.stringify(formatted, null, 2));

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Meals fetched",
      data: formatted
    });

  } catch (err) {
    console.error("GET MEALS ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};






exports.editMeal = async (req, res) => {
  try {
    // Parse inputdata if it's a string (multipart/form-data sends JSON as string)
    let body = req.body.inputdata;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    console.log("EDIT MEAL INPUT:", body);
    console.log("EDIT MEAL BODY IMAGE:", req.body.image);

    // Validate required meal ID
    if (!body.meals_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Meal ID is required"
      });
    }

    let breadConfig = [];
    let breadCount = 0;

    if (Array.isArray(body.bread_config)) {
      breadConfig = body.bread_config;
      breadCount = Math.max(...breadConfig.map(b => Number(b.qty || 0)), 0);
    }

    // Build update object
    let updateObj = {
      meals_name: body.meals_name,
      price: body.price,
      description: body.description || "",
      bread_count: breadCount,
      bread_config: JSON.stringify(breadConfig),
      subji_count: body.subji_count || 0,
      other_count: body.other_count || 0,
      is_special_meal: body.is_special_meal || 0,
      special_item_id: body.special_item_id || null,
      updated_at: req.locals.now
    };

    // Handle image upload - Check both body.image (from inputdata) and req.body.image (from disk storage middleware)
    let imageFilename = null;
    
    if (req.body.image && Array.isArray(req.body.image) && req.body.image.length > 0) {
      // Image from disk storage middleware
      imageFilename = req.body.image[0];
      console.log("IMAGE FROM DISK STORAGE:", imageFilename);
    } else if (req.file) {
      // Fallback to single file upload
      imageFilename = req.file.filename;
      console.log("IMAGE FROM FILE UPLOAD:", imageFilename);
    } else if (body.image && Array.isArray(body.image) && body.image.length > 0) {
      // Image from inputdata (client sent it in JSON)
      imageFilename = body.image[0];
      console.log("IMAGE FROM INPUTDATA:", imageFilename);
    }

    if (imageFilename) {
      console.log("UPDATING WITH IMAGE:", imageFilename);
      
      // Delete old image if exists
      if (body.old_image) {
        console.log("DELETING OLD IMAGE:", body.old_image);
        await FileManager.unlinkRemoveFile("/meals/image/", body.old_image);
      }
      
      // Add new image to update object
      updateObj.image = imageFilename;
    }

    // Build update value string
    let updateValueParts = [];
    for (let key in updateObj) {
      if (updateObj[key] === null) {
        updateValueParts.push(`${key}=NULL`);
      } else if (typeof updateObj[key] === "number") {
        updateValueParts.push(`${key}=${updateObj[key]}`);
      } else {
        updateValueParts.push(`${key}='${updateObj[key]}'`);
      }
    }
    const updateValue = updateValueParts.join(", ");
    
    console.log("UPDATE QUERY:", updateValue);

    // Ensure meals_id is a number for safe query
    const mealId = parseInt(body.meals_id);
    if (isNaN(mealId)) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Invalid meal ID"
      });
    }

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "meals",
      `meals_id=${mealId} AND is_delete=0`,
      updateValue
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Meal updated successfully"
    });

  } catch (err) {
    console.error("EDIT MEAL ERROR", err);
    return res.status(500).json({ status: "error", msg: "Internal error: " + err.message });
  }
};






exports.deleteMeal = async (req, res) => {
  try {
    const body = req.body.inputdata;
    if (!body.meals_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Meal ID is required."
      });
    }

    // Fetch meal to get image
    const meal = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "meals",
      `WHERE meals_id=${body.meals_id}`,
      "image"
    );

    // Delete image if exists
    if (meal && meal.image) {
      await FileManager.unlinkRemoveFile("/meals/image/", meal.image);
    }

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "meals",
      `meals_id=${body.meals_id}`,
      `is_delete=1, updated_at='${req.locals.now}'`
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Meal deleted successfully."
    });

  } catch (error) {
    console.error("Delete Meal Error:", error);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};


exports.toggleMealStatus = async (req, res) => {
  try {
    const body = req.body.inputdata;

    if (!body.meals_id) {
      return utility.apiResponse(req, res, { status: "error", msg: "Meal ID required." });
    }

    const status = body.is_active ? 1 : 0;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "meals",
      `meals_id=${body.meals_id}`,
      `is_active=${status}, updated_at='${req.locals.now}'`
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: `Meal ${status ? "Activated" : "Deactivated"} successfully.`
    });

  } catch (error) {
    console.error("Toggle Meal Status Error:", error);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};






exports.addBread = async (req, res) => {
  try {
    let body = req.body.inputdata;
    let response = { status: "error", msg: "" };

    if (!body.name) {
      response.msg = "Bread name is required.";
      return utility.apiResponse(req, res, response);
    }
    if (!body.price) {
      response.msg = "Bread price is required.";
      return utility.apiResponse(req, res, response);
    }

    const insertValue = {
      name: body.name.trim(),
      price: body.price,
      is_active: 1,
      is_delete: 0,
      created_at: req.locals.now
    };

    let insert = await dbQuery.insertSingle(constants.vals.defaultDB, "breads", insertValue);

    response.status = "success";
    response.msg = "Bread added successfully.";
    response.data = { bread_id: insert };

    return utility.apiResponse(req, res, response);
  } catch (err) { throw err; }
};





exports.getBread = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };

    const listQuery = `
            SELECT bread_id, name, price, is_active, is_delete, created_at
            FROM breads
            WHERE is_delete = 0
            ORDER BY bread_id DESC
        `;

    const list = await dbQuery.rawQuery(constants.vals.defaultDB, listQuery);

    response.status = "success";
    response.msg = "Bread list fetched.";
    response.data = list;

    return utility.apiResponse(req, res, response);

  } catch (err) { throw err; }
};



exports.editBread = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req.body.inputdata;

    if (!body.bread_id) {
      response.msg = "Bread ID is required.";
      return utility.apiResponse(req, res, response);
    }

    if (!body.name || body.name.trim() === "") {
      response.msg = "Bread name is required.";
      return utility.apiResponse(req, res, response);
    }

    // Check record exists
    const bread = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "breads",
      `WHERE bread_id=${body.bread_id} AND is_delete=0`,
      "bread_id"
    );

    if (!bread) {
      response.msg = "Bread not found.";
      return utility.apiResponse(req, res, response);
    }

    const updateValue = `
            name='${body.name}',
            price='${body.price}',
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "breads",
      `bread_id=${body.bread_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Bread updated successfully.";

    return utility.apiResponse(req, res, response);

  } catch (err) { throw err; }
};



exports.deleteBread = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req.body.inputdata;

    if (!body.bread_id) {
      response.msg = "Bread ID is required.";
      return utility.apiResponse(req, res, response);
    }

    const bread = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "breads",
      `WHERE bread_id=${body.bread_id} AND is_delete=0`,
      "bread_id"
    );

    if (!bread) {
      response.msg = "Bread not found.";
      return utility.apiResponse(req, res, response);
    }

    const date = req.locals.now;

    const updateValue = `
            is_delete=1,
            updated_at='${date}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "breads",
      `bread_id=${body.bread_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Bread deleted successfully.";

    return utility.apiResponse(req, res, response);

  } catch (err) { throw err; }
};

exports.toggleBreadStatus = async (req, res) => {
  try {
    const body = req.body.inputdata;

    if (!body.bread_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Bread ID is required."
      });
    }

    const isActive = body.is_active == 1 ? 1 : 0;

    const setCondition = `is_active=${isActive}, updated_at='${req.locals.now}'`;
    const whereCondition = `bread_id=${body.bread_id}`;

    // ✅ PARAMETER ORDER FIXED
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "breads",
      whereCondition,   // WHERE
      setCondition      // SET
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: `Bread ${isActive === 1 ? "activated" : "deactivated"} successfully.`
    });

  } catch (err) {
    console.error("Toggle bread error:", err);
    return utility.apiResponse(req, res, {
      status: "error",
      msg: "Internal server error"
    });
  }
};







exports.addSubji = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req?.body?.inputdata;

    if (!body.name) {
      response.msg = "Subji name is required.";
      return utility.apiResponse(req, res, response);
    }

    if (!body.subji_type) {
      response.msg = "Subji type is required.";
      return utility.apiResponse(req, res, response);
    }

    if (!body.price) {
      response.msg = "Subji price is required.";
      return utility.apiResponse(req, res, response);
    }

    const insertValue = {
      name: body.name.trim(),
      subji_type: body.subji_type,   // ✅ NEW
      price: body.price,
      is_active: 1,
      is_delete: 0,
      created_at: req.locals.now
    };

    const insert = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "subjis",
      insertValue
    );

    response.status = "success";
    response.msg = "Subji added successfully.";
    response.data = { subji_id: insert };

    return utility.apiResponse(req, res, response);

  } catch (err) {
    throw err;
  }
};




exports.getSubji = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };

    const query = `
      SELECT 
        subji_id,
        name,
        subji_type,
        price,
        is_active
      FROM subjis
      WHERE is_delete = 0
      ORDER BY subji_id DESC
    `;

    const rows = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      query
    );

    const green = [];
    const kathol = [];

    rows.forEach(row => {
      if (row.subji_type === 'green') {
        green.push(row);
      }
      else if (row.subji_type === 'kathol') {
        kathol.push(row);
      }
    });

    response.status = "success";
    response.msg = "Subji list fetched";
    response.data = {
      green,
      kathol
    };

    return utility.apiResponse(req, res, response);

  } catch (err) {
    throw err;
  }
};





exports.editSubji = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req.body.inputdata;

    // ✅ Validation
    if (!body.subji_id) {
      response.msg = "Subji ID is required.";
      return utility.apiResponse(req, res, response);
    }

    if (!body.name || body.name.trim() === "") {
      response.msg = "Subji name is required.";
      return utility.apiResponse(req, res, response);
    }

    if (!body.subji_type) {
      response.msg = "Subji type is required.";
      return utility.apiResponse(req, res, response);
    }

    if (!body.price) {
      response.msg = "Subji price is required.";
      return utility.apiResponse(req, res, response);
    }

    // ✅ Check Exists
    const subji = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "subjis",
      `WHERE subji_id=${body.subji_id} AND is_delete=0`,
      "subji_id"
    );

    if (!subji) {
      response.msg = "Subji not found.";
      return utility.apiResponse(req, res, response);
    }

    // ✅ Update
    const updateValue = `
            name='${body.name}',
            subji_type='${body.subji_type}',
            price='${body.price}',
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "subjis",
      `subji_id=${body.subji_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Subji updated successfully.";

    return utility.apiResponse(req, res, response);

  } catch (err) {
    throw err;
  }
};




exports.deleteSubji = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req.body.inputdata;

    if (!body.subji_id) {
      response.msg = "Subji ID is required.";
      return utility.apiResponse(req, res, response);
    }

    const subji = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "subjis",
      `WHERE subji_id=${body.subji_id} AND is_delete=0`,
      "subji_id"
    );

    if (!subji) {
      response.msg = "Subji not found.";
      return utility.apiResponse(req, res, response);
    }

    const updateValue = `
            is_delete=1,
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "subjis",
      `subji_id=${body.subji_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Subji deleted successfully.";

    return utility.apiResponse(req, res, response);

  } catch (err) { throw err; }
};

exports.toggleSubjiStatus = async (req, res) => {
  try {
    const body = req.body.inputdata;
    if (!body.subji_id) {
      return utility.apiResponse(req, res, { status: "error", msg: "Subji ID required." });
    }

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "subjis",
      `subji_id=${body.subji_id}`,
      `is_active=${body.is_active ? 1 : 0}, updated_at='${req.locals.now}'`
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: `Subji ${body.is_active ? "Activated" : "Deactivated"} successfully.`
    });

  } catch (err) { throw err; }
};



exports.addSpecialItem = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req.body.inputdata;

    if (!body.price) {
      response.msg = "Special item price is required.";
      return utility.apiResponse(req, res, response);
    }

    const insertValue = {
      name: body.name.trim(),
      price: body.price,
      is_active: 1,
      is_delete: 0,
      created_at: req.locals.now
    };


    const insert = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "special_items",
      insertValue
    );

    response.status = "success";
    response.msg = "Special item added successfully.";
    response.data = { special_item_id: insert.insertId || insert };

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Add Special Item Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};

exports.getOrderSetting = async (req, res) => {
  try {
    console.log("USER INFO:", req.userInfo);



    const row = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "order_settings"
    );

    return utility.apiResponse(req, res, {
      status: "success",
      data: {
        lunch_cutoff: row.lunch_cutoff,
        dinner_cutoff: row.dinner_cutoff
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", msg: "Server error" });
  }
};
exports.createZone = async (req, res) => {

  try {

    console.log("REQ BODY =>", req.body);

    const body = req.body.inputdata || req.body;

    const { zone_name, polygon } = body;

    if (!zone_name || !polygon) {
      return res.json({
        status: "error",
        msg: "zone_name or polygon missing"
      });
    }

    const id = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "delivery_zones",
      {
        zone_name,
        polygon: JSON.stringify(polygon)
      }
    );

    res.json({ status: "success", zone_id: id });

  } catch (e) {
    console.log("CREATE ZONE ERROR =>", e);
    res.json({ status: "error", msg: "Server error" });
  }

}


exports.getZoneList = async (req, res) => {
  try {

    const rows = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT zone_id, zone_name, polygon FROM delivery_zones`
    );

    res.json({
      status: "success",
      data: rows
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ status: "error" });
  }
};

exports.deleteZone = async (req, res) => {
  try {
    const body = req.body.inputdata || req.body;
    const { zone_id } = body;

    if (!zone_id) {
      return await utility.apiResponse(req, res, {
        status: "error",
        msg: "zone_id is required"
      });
    }

    // Check if zone exists
    const zone = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "delivery_zones",
      `WHERE zone_id=${zone_id}`,
      "zone_id"
    );

    if (!zone) {
      return await utility.apiResponse(req, res, {
        status: "error",
        msg: "Zone not found"
      });
    }

    // Hard delete the zone
    await dbQuery.deleteRecord(
      constants.vals.defaultDB,
      "delivery_zones",
      `zone_id=${zone_id}`
    );

    return await utility.apiResponse(req, res, {
      status: "success",
      msg: "Zone deleted successfully"
    });

  } catch (err) {
    console.error("DELETE ZONE ERROR =>", err);
    return await utility.apiResponse(req, res, {
      status: "error",
      msg: "Internal server error"
    });
  }
};




exports.createDeliveryBoy = async (req, res) => {
  try {

    const { first_name, last_name, mobile_no, password } = req.body;

    if (!first_name || !mobile_no || !password) {
      return res.json({
        status: "error",
        msg: "Required fields missing"
      });
    }

    // ✅ Check if a user with this mobile number exists
    const existingUser = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE mobile_no='${mobile_no}' AND is_delete=0`,
      "user_id, name, mobile_no, email"
    );

    // Normalize array response if needed
    const userData = Array.isArray(existingUser) ? existingUser[0] : existingUser;

    const hash = await bcrypt.hash(password, 10);

    const prefix = first_name.charAt(0).toUpperCase();

    const id = await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "delivery_boys",
      {
        first_name,
        last_name,
        mobile_no,
        password: hash,
        invoice_prefix: prefix,
        is_active: 1
      }
    );

    // ✅ Prepare response with user info if found
    const responseData = {
      status: "success",
      msg: "Delivery boy created successfully",
      delivery_boy_id: id,
      is_user_linked: userData ? true : false,
      linked_user_info: userData ? {
        user_id: userData.user_id,
        name: userData.name,
        mobile_no: userData.mobile_no,
        email: userData.email,
        message: "This delivery boy is linked to an existing user account"
      } : null
    };

    res.json(responseData);

  } catch (err) {

    if (err.code === "ER_DUP_ENTRY") {
      return res.json({
        status: "error",
        msg: "Mobile already exists"
      });
    }

    console.log(err);
    res.status(500).json({ status: "error" });
  }
};


exports.getDeliveryBoysWithZones = async (req, res) => {
  try {

    const rows = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
    SELECT 
      db.delivery_boy_id,
      db.first_name,
      db.last_name,
      db.mobile_no,
      db.is_active,
      dz.zone_id,
      z.zone_name
    FROM delivery_boys db
    LEFT JOIN delivery_boy_zones dz 
      ON db.delivery_boy_id = dz.delivery_boy_id
    LEFT JOIN delivery_zones z
      ON dz.zone_id = z.zone_id
    ORDER BY db.delivery_boy_id DESC
    `
    );

    res.json({
      status: "success",
      data: rows
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ status: "error" });
  }
};

exports.assignDeliveryBoyZone = async (req, res) => {
  try {

    const delivery_boy_id = Number(req.body.delivery_boy_id);
    const zone_id = Number(req.body.zone_id);

    if (!delivery_boy_id || !zone_id) {
      return res.json({
        status: "error",
        msg: "delivery_boy_id and zone_id required"
      });
    }

    const check = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
    SELECT id FROM delivery_boy_zones
    WHERE delivery_boy_id=${delivery_boy_id}
    AND zone_id=${zone_id}
    `
    );

    if (check && check.length > 0) {
      return res.json({
        status: "success",
        msg: "Already assigned"
      });
    }

    await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "delivery_boy_zones",
      {
        delivery_boy_id,
        zone_id
      }
    );

    res.json({
      status: "success",
      msg: "Zone assigned"
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ status: "error" });
  }
};


exports.editDeliveryBoy = async (req, res) => {
  try {

    const {
      delivery_boy_id,
      first_name,
      last_name,
      mobile_no,
      password,
      is_active
    } = req.body;

    if (!delivery_boy_id) {
      return res.json({
        status: "error",
        msg: "delivery_boy_id required"
      });
    }

    let updateData = {};

    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (mobile_no !== undefined) updateData.mobile_no = mobile_no;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await dbQuery.updateSingle(
      constants.vals.defaultDB,
      "delivery_boys",
      updateData,
      `delivery_boy_id=${delivery_boy_id}`
    );

    res.json({
      status: "success",
      msg: "Delivery boy updated"
    });

  } catch (err) {

    if (err.code === "ER_DUP_ENTRY") {
      return res.json({
        status: "error",
        msg: "Mobile already exists"
      });
    }

    console.log(err);
    res.status(500).json({ status: "error" });
  }
};

exports.updateDeliveryBoyZones = async (req, res) => {
  try {

    const delivery_boy_id = Number(req.body.delivery_boy_id);
    const zone_ids = req.body.zone_ids || [];

    if (!delivery_boy_id) {
      return res.json({
        status: "error",
        msg: "delivery_boy_id required"
      });
    }

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `DELETE FROM delivery_boy_zones WHERE delivery_boy_id=${delivery_boy_id}`
    );

    if (Array.isArray(zone_ids)) {
      for (const zone_id of zone_ids) {
        await dbQuery.insertSingle(
          constants.vals.defaultDB,
          "delivery_boy_zones",
          {
            delivery_boy_id,
            zone_id: Number(zone_id)
          }
        );
      }
    }

    res.json({
      status: "success",
      msg: "Zones updated"
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ status: "error" });
  }
};


exports.assignMultipleZones = async (req, res) => {
  try {

    const { delivery_boy_id, zone_ids } = req.body;

    if (!delivery_boy_id || !Array.isArray(zone_ids)) {
      return res.json({
        status: "error",
        msg: "Invalid input"
      });
    }

    // Remove old mapping
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `DELETE FROM delivery_boy_zones WHERE delivery_boy_id=?`,
      [delivery_boy_id]
    );

    // Insert new mapping
    for (const zone_id of zone_ids) {
      await dbQuery.insertSingle(
        constants.vals.defaultDB,
        "delivery_boy_zones",
        { delivery_boy_id, zone_id }
      );
    }

    res.json({ status: "success" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ status: "error" });
  }
}

exports.removeDeliveryBoyZone = async (req, res) => {
  try {

    const delivery_boy_id = Number(req.body.delivery_boy_id);
    const zone_id = Number(req.body.zone_id);

    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
    DELETE FROM delivery_boy_zones
    WHERE delivery_boy_id=${delivery_boy_id}
    AND zone_id=${zone_id}
    `
    );

    res.json({
      status: "success",
      msg: "Zone removed"
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ status: "error" });
  }
};



exports.updateOrderSetting = async (req, res) => {
  try {


    const { lunch_cutoff, dinner_cutoff } = req.body.inputdata;

    if (!lunch_cutoff || !dinner_cutoff) {
      return utility.apiResponse(req, res, { status: "error", msg: "Both times required" });
    }

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "order_settings",
      "id=1",
      `
     lunch_cutoff='${lunch_cutoff}',
     dinner_cutoff='${dinner_cutoff}',
     updated_at='${req.locals.now}'
    `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Times updated"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", msg: "Server error" });
  }
};



exports.getSpecialItems = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };

    const list = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT special_item_id, name, price, is_active, is_delete, created_at
            FROM special_items
            WHERE is_delete = 0
            ORDER BY special_item_id DESC`
    );

    response.status = "success";
    response.msg = "Special items fetched.";
    response.data = list;

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Get Special Items Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};




exports.editSpecialItem = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req.body.inputdata;

    if (!body.special_item_id) {
      response.msg = "Special item ID is required.";
      return utility.apiResponse(req, res, response);
    }
    if (!body.name || body.name.trim() === "") {
      response.msg = "Special item name is required.";
      return utility.apiResponse(req, res, response);
    }

    const item = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "special_items",
      `WHERE special_item_id=${body.special_item_id} AND is_delete=0`,
      "special_item_id"
    );

    if (!item) {
      response.msg = "Special item not found.";
      return utility.apiResponse(req, res, response);
    }

    const updateValue = `
            name='${body.name}',
            price='${body.price}',
            updated_at='${req.locals.now}'
        `;


    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "special_items",
      `special_item_id=${body.special_item_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Special item updated successfully.";
    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Edit Special Item Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};





exports.deleteSpecialItem = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req.body.inputdata;

    if (!body.special_item_id) {
      response.msg = "Special item ID is required.";
      return utility.apiResponse(req, res, response);
    }

    const item = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "special_items",
      `WHERE special_item_id=${body.special_item_id} AND is_delete=0`,
      "special_item_id"
    );

    if (!item) {
      response.msg = "Special item not found.";
      return utility.apiResponse(req, res, response);
    }

    const updateValue = `
            is_delete=1,
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "special_items",
      `special_item_id=${body.special_item_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Special item deleted successfully.";
    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Delete Special Item Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.toggleSpecialItemStatus = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req.body.inputdata;

    if (!body.special_item_id) {
      response.msg = "Special item ID is required.";
      return utility.apiResponse(req, res, response);
    }
    if (typeof body.is_active === "undefined") {
      response.msg = "is_active (0 or 1) is required.";
      return utility.apiResponse(req, res, response);
    }

    const item = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "special_items",
      `WHERE special_item_id=${body.special_item_id} AND is_delete=0`,
      "special_item_id"
    );

    if (!item) {
      response.msg = "Special item not found.";
      return utility.apiResponse(req, res, response);
    }

    const updateValue = `
            is_active=${body.is_active},
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "special_items",
      `special_item_id=${body.special_item_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = `Special item ${body.is_active == 1 ? "activated" : "deactivated"} successfully.`;

    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.error("Update Special Item Status Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.addOtherItem = async (req, res) => {
  try {
    let body = req.body.inputdata;
    let response = { status: "error", msg: "" };

    if (!body.name) {
      response.msg = "Item name is required.";
      return utility.apiResponse(req, res, response);
    }
    if (!body.price) {
      response.msg = "Item price is required.";
      return utility.apiResponse(req, res, response);
    }

    const insertValue = {
      name: body.name.trim(),
      price: body.price,
      is_active: 1,
      is_delete: 0,
      created_at: req.locals.now
    };

    let insert = await dbQuery.insertSingle(constants.vals.defaultDB, "other_items", insertValue);

    response.status = "success";
    response.msg = "Item added successfully.";
    response.data = { other_item_id: insert };

    return utility.apiResponse(req, res, response);
  } catch (err) { throw err; }
};




exports.getOtherItem = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };

    const listQuery = `
            SELECT other_item_id, name, price, is_active, is_delete, created_at
            FROM other_items
            WHERE is_delete = 0
            ORDER BY other_item_id DESC
        `;

    const list = await dbQuery.rawQuery(constants.vals.defaultDB, listQuery);

    response.status = "success";
    response.msg = "Item list fetched.";
    response.data = list;

    return utility.apiResponse(req, res, response);

  } catch (err) { throw err; }
};



exports.editOtherItem = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req.body.inputdata;

    if (!body.other_item_id) {
      response.msg = "Item ID is required.";
      return utility.apiResponse(req, res, response);
    }

    if (!body.name || body.name.trim() === "") {
      response.msg = "Item name is required.";
      return utility.apiResponse(req, res, response);
    }

    // Check record exists
    const otheritem = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "other_items",
      `WHERE other_item_id =${body.other_item_id} AND is_delete=0`,
      "other_item_id "
    );

    if (!otheritem) {
      response.msg = "Item not found.";
      return utility.apiResponse(req, res, response);
    }

    const updateValue = `
            name='${body.name}',
            price='${body.price}',
            updated_at='${req.locals.now}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "other_items",
      `other_item_id=${body.other_item_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Item updated successfully.";

    return utility.apiResponse(req, res, response);

  } catch (err) { throw err; }
};



exports.deleteOtherItem = async (req, res) => {
  try {
    let response = { status: "error", msg: "" };
    let body = req.body.inputdata;

    if (!body.other_item_id) {
      response.msg = "Item ID is required.";
      return utility.apiResponse(req, res, response);
    }

    const otheritem = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "other_items",
      `WHERE other_item_id=${body.other_item_id} AND is_delete=0`,
      "other_item_id"
    );

    if (!otheritem) {
      response.msg = "Item not found.";
      return utility.apiResponse(req, res, response);
    }

    const date = req.locals.now;

    const updateValue = `
            is_delete=1,
            updated_at='${date}'
        `;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "other_items",
      `other_item_id=${body.other_item_id}`,
      updateValue
    );

    response.status = "success";
    response.msg = "Item deleted successfully.";

    return utility.apiResponse(req, res, response);

  } catch (err) { throw err; }
};

exports.toggleOtherItemStatus = async (req, res) => {
  try {
    const body = req.body.inputdata;
    console.log(req.body);
    console.log("asdkjasjdhsadj");
    console.log(body.is_active);





    if (!body.other_item_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Item ID is required."
      });
    }

    const isActive = body.is_active == 1 ? 1 : 0;

    const setCondition = `is_active=${isActive}, updated_at='${req.locals.now}'`;
    const whereCondition = `other_item_id=${body.other_item_id}`;

    console.log(setCondition);
    console.log("asdkjasjdhsadsadsdsadj");
    console.log(whereCondition);
    console.log("asdkjasjdhdasdsadqweqwewqewqsadj");

    // ✅ PARAMETER ORDER FIXED
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "other_items",
      whereCondition,   // WHERE
      setCondition      // SET
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: `Item ${isActive === 1 ? "activated" : "deactivated"} successfully.`
    });

  } catch (err) {
    console.error("Toggle Item error:", err);
    return utility.apiResponse(req, res, {
      status: "error",
      msg: "Internal server error"
    });
  }
};


exports.addMealStructure = async (req, res) => {
  try {
    const body = req.body.inputdata;
    let response = { status: "error", msg: "" };

    if (!body || !body.meals_id || !Array.isArray(body.structure)) {
      response.msg = "meals_id and structure[] are required.";
      return utility.apiResponse(req, res, response);
    }

    // First delete old structure (if editing)
    await dbQuery.deleteRecord(
      constants.vals.defaultDB,
      "meal_structure",
      `meals_id=${body.meals_id}`
    );

    // Insert new structure
    for (let item of body.structure) {
      await dbQuery.insertSingle(constants.vals.defaultDB, "meal_structure", {
        meals_id: body.meals_id,
        item_type: item.item_type,
        item_id: item.item_id,
        quantity: item.quantity
      });
    }

    response.status = "success";
    response.msg = "Meal structure updated.";
    return utility.apiResponse(req, res, response);

  } catch (err) {
    console.log("addMealStructure Error:", err);
    return res.status(500).json({ status: "error", msg: "Internal server error" });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const { date, slot } = req.query;

    let where = "1=1";
    if (date) where += ` AND os.delivery_date='${date}'`;
    if (slot) where += ` AND os.slot='${slot}'`;

    const orders = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
  os.order_schedule_id,
  os.delivery_date,
  os.slot,
  os.delivery_invoice_no,
  o.order_id,
  o.total_amount,
  o.is_paid,

  u.name AS user_name,
  u.mobile_no,

  db.first_name AS delivery_boy_name

FROM order_schedule os

JOIN orders o ON o.order_id = os.order_id
JOIN users u ON u.user_id = o.user_id

LEFT JOIN delivery_boys db 
  ON db.delivery_boy_id = os.delivery_boy_id

WHERE ${where}

ORDER BY os.delivery_date ASC

      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Orders fetched",
      data: orders
    });

  } catch (err) {
    console.error("ADMIN GET ORDERS ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};
exports.getAllOrderLocations = async (req, res) => {
  try {

    const { date, slot } = req.query;

    let where = "1=1";

    if (date) where += ` AND os.delivery_date='${date}'`;
    if (slot) where += ` AND os.slot='${slot}'`;

    const locations = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT DISTINCT
        ua.address_id,
        ua.user_id,
        ua.latitude,
        ua.longitude
      FROM orders o
      JOIN order_schedule os 
        ON os.order_id = o.order_id
      JOIN user_addresses ua 
        ON ua.user_id = o.user_id
      WHERE ${where}
        AND ua.is_active = 1
        AND ua.is_delete = 0
        AND ua.latitude IS NOT NULL
        AND ua.longitude IS NOT NULL
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Order locations fetched",
      data: locations
    });

  } catch (err) {
    console.error("GET ORDER LOCATIONS ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal error"
    });
  }
};


exports.adminSettlePayment = async (req, res) => {
  try {

    const { user_id, amount, mode } = req.body;

    if (!user_id || !amount || !mode) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "user_id, amount and mode required"
      });
    }

    const user = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE user_id=${user_id}`,
      "user_id,firebase_token,wallet_balance"
    );

    if (!user) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "User not found"
      });
    }

    // ➕ WALLET TRANSACTION
    await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "wallet_transactions",
      {
        user_id,
        type: "credit",
        amount,
        description: `Admin Settlement (${mode})`,
        created_at: req.locals.now
      }
    );

    // ➖ UPDATE WALLET BALANCE
    await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      UPDATE users
      SET wallet_balance = wallet_balance - ${amount}
      WHERE user_id = ${user_id}
      `
    );

    const title = "Payment Settled";
    const message = `₹${amount} received via ${mode}`;

    // ✅ STORE NOTIFICATION
    await dbQuery.insertSingle(
      constants.vals.defaultDB,
      "notifications",
      {
        user_id,
        title: title,
        message: message,
        is_read: 0,
        created_at: req.locals.now
      }
    );

    // ✅ PUSH
    if (user.firebase_token) {
      await utility.notifyUser(
        user.firebase_token,
        "wallet",
        user_id,
        title,
        message
      );
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Payment settled"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      msg: "Server error"
    });
  }
};






const normalizeJSON = (val) => {
  if (!val) return [];
  if (typeof val === "string") return JSON.parse(val);
  if (typeof val === "object") return val;
  return [];
};
const safeJSON = (val, fallback = {}) => {
  if (!val) return fallback;
  if (typeof val === "object") return val;     // 👈 already parsed
  if (typeof val === "string") return JSON.parse(val);
  return fallback;
};


exports.getKitchenSummary = async (req, res) => {
  try {
    const { date, slot } = req.query;

    if (!date || !slot) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Date and slot required"
      });
    }

    // 🔐 Safe JSON helper
    const safeJSON = (val, fallback) => {
      if (!val) return fallback;
      if (typeof val === "object") return val;
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    };

    const rows = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        oi.selected_items,
        oi.quantity AS meal_qty,
        m.meals_id,
        m.meals_name,
        m.bread_config,
        m.subji_count,
        m.other_count,
        m.is_special_meal
      FROM order_schedule os
      JOIN orders o ON o.order_id = os.order_id AND o.status = 'active'
      JOIN order_items oi ON oi.order_item_id = os.order_item_id
      JOIN meals m ON m.meals_id = oi.meals_id
      WHERE os.delivery_date = '${date}'
        AND os.slot = '${slot}'
      `
    );

    // 🧮 Counters
    const countMap = {
      meal: {},
      bread: {},
      subji: {},
      other: {},
      special: {}
    };

    for (let r of rows) {
      const parsed = safeJSON(r.selected_items, {});
      const selected = parsed.selected_items || {};
      const extras = parsed.extra_items || [];
      const mealQty = Number(r.meal_qty || 1);

      /* 🍱 MEAL COUNT */
      countMap.meal[r.meals_id] =
        (countMap.meal[r.meals_id] || 0) + mealQty;

      /* 🟣 SPECIAL MEAL */
      if (Number(r.is_special_meal) === 1) {
        continue;
      }

      /* 🍞 BREAD (FROM bread_config) */
      const breadConfig = safeJSON(r.bread_config, []);

      if (selected.bread_id) {
        const rule = breadConfig.find(
          b => Number(b.bread_id) === Number(selected.bread_id)
        );

        const qty = rule ? Number(rule.qty) * mealQty : 0;

        countMap.bread[selected.bread_id] =
          (countMap.bread[selected.bread_id] || 0) + qty;
      }

      /* 🥗 SUBJI */
      if (Array.isArray(selected.subji_ids) && selected.subji_ids.length) {
        const validSubjis = selected.subji_ids.filter(sid => !isNaN(Number(sid)) && sid !== null && sid !== '');
        if (validSubjis.length) {
          const totalSubji = Number(r.subji_count || 0) * mealQty;
          const perSubji = totalSubji / validSubjis.length;

          for (let sid of validSubjis) {
            countMap.subji[Number(sid)] =
              (countMap.subji[Number(sid)] || 0) + perSubji;
          }
        }
      }

      /* 🍚 OTHER ITEMS */
      if (Number(r.other_count) > 0) {
        const activeOthers = await dbQuery.rawQuery(
          constants.vals.defaultDB,
          `
          SELECT other_item_id
          FROM other_items
          WHERE is_active = 1
          ORDER BY other_item_id ASC
          LIMIT ${r.other_count}
          `
        );

        for (let o of activeOthers) {
          countMap.other[o.other_item_id] =
            (countMap.other[o.other_item_id] || 0) + mealQty;
        }
      }

      /* ➕ EXTRA ITEMS */
      for (let ex of extras) {
        if (!countMap[ex.item_type]) continue;

        countMap[ex.item_type][ex.item_id] =
          (countMap[ex.item_type][ex.item_id] || 0) +
          Number(ex.quantity || 0);
      }
    }

    /* ===============================
       🔁 CONVERT TO ARRAY (UI SAFE)
    =============================== */
    const result = [];

    for (let id in countMap.meal) {
      const numId = Number(id);
      if (isNaN(numId)) continue; // Skip invalid IDs
      
      const m = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "meals",
        `WHERE meals_id=${numId}`,
        "meals_name"
      );
      
      if (m) {
        result.push({
          type: "meal",
          id,
          name: m.meals_name,
          total_qty: countMap.meal[id]
        });
      }
    }

    for (let id in countMap.bread) {
      const numId = Number(id);
      if (isNaN(numId)) continue; // Skip invalid IDs
      
      const b = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "breads",
        `WHERE bread_id=${numId}`,
        "name"
      );
      
      if (b) {
        result.push({
          type: "bread",
          id,
          name: b.name,
          total_qty: countMap.bread[id]
        });
      }
    }

    for (let id in countMap.subji) {
      const numId = Number(id);
      if (isNaN(numId)) continue; // Skip invalid IDs
      
      const s = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "subjis",
        `WHERE subji_id=${numId}`,
        "name"
      );
      
      if (s) {
        result.push({
          type: "subji",
          id,
          name: s.name,
          total_qty: countMap.subji[id]
        });
      }
    }

    for (let id in countMap.other) {
      const numId = Number(id);
      if (isNaN(numId)) continue; // Skip invalid IDs
      
      const o = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "other_items",
        `WHERE other_item_id=${numId}`,
        "name"
      );
      
      if (o) {
        result.push({
          type: "other",
          id,
          name: o.name,
          total_qty: countMap.other[id]
        });
      }
    }

    for (let id in countMap.special) {
      const numId = Number(id);
      if (isNaN(numId)) continue; // Skip invalid IDs
      
      const s = await dbQuery.fetchSingleRecord(
        constants.vals.defaultDB,
        "special_items",
        `WHERE special_item_id=${numId}`,
        "name"
      );
      
      if (s) {
        result.push({
          type: "special",
          id,
          name: s.name,
          total_qty: countMap.special[id]
        });
      }
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Kitchen summary fetched",
      data: result
    });

  } catch (err) {
    console.error("KITCHEN SUMMARY ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};






exports.getAdminDailyOrders = async (req, res) => {
  try {

    const { date, slot } = req.query;

    if (!date || !slot) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Date and slot required"
      });
    }

    console.log("ADMIN ORDERS DATE =>", date);
    console.log("ADMIN ORDERS SLOT =>", slot);

    /* ================= SAFE JSON PARSER ================= */
    const safeJSON = (val, fallback) => {
      if (!val) return fallback;
      if (typeof val === "object") return val;

      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    };

    /* ================= FETCH BASE ROWS ================= */
    const rows = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
  os.delivery_date,
  os.slot,
  os.status AS delivery_status,
  os.delivery_invoice_no,
  os.delivery_boy_id,

  db.first_name AS delivery_boy_name,

  o.order_id,
  o.total_amount,
  o.is_paid,

  u.name AS user_name,
  u.mobile_no,

  ua.full_address,

  oi.quantity AS meal_qty,
  oi.selected_items,

  m.meals_id,
  m.meals_name,
  m.description,
  m.bread_config,
  m.subji_count,
  m.other_count,
  m.is_special_meal

FROM order_schedule os

JOIN orders o ON o.order_id = os.order_id
JOIN users u ON u.user_id = o.user_id
LEFT JOIN user_addresses ua ON ua.address_id = os.address_id
JOIN order_items oi ON oi.order_item_id = os.order_item_id
JOIN meals m ON m.meals_id = oi.meals_id

LEFT JOIN delivery_boys db 
  ON db.delivery_boy_id = os.delivery_boy_id

WHERE DATE(os.delivery_date)='${date}'
AND LOWER(os.slot)=LOWER('${slot}')

ORDER BY o.order_id ASC

      `
    );

    console.log("ROWS FOUND =>", rows.length);

    const result = [];

    /* ================= LOOP ROWS ================= */
    for (let r of rows) {

      const parsed = safeJSON(r.selected_items, {});
      const selected = parsed.selected_items || {};
      const extrasRaw = parsed.extra_items || [];
      const mealQty = Number(r.meal_qty || 1);

      let selected_items = {};
      let extras = [];
      let totals = {};

      /* =================================================
         🟣 SPECIAL MEAL
      ================================================= */
      if (Number(r.is_special_meal) === 1) {

        const baseItem = await dbQuery.fetchSingleRecord(
          constants.vals.defaultDB,
          "special_items",
          `WHERE is_active=1`,
          "special_item_id, name"
        );

        totals = {
          special: [
            {
              id: baseItem?.special_item_id || 0,
              name: baseItem?.name || "",
              qty: mealQty * 2
            }
          ]
        };

        selected_items = {
          special_item: baseItem
            ? { id: baseItem.special_item_id, name: baseItem.name }
            : null
        };

      }

      /* =================================================
         🟢 NORMAL MEAL
      ================================================= */
      else {

        const breadConfig = safeJSON(r.bread_config, []);

        /* 🍞 Bread */
        let breadTotals = [];

        if (selected.bread_id) {

          const rule = breadConfig.find(
            b => Number(b.bread_id) === Number(selected.bread_id)
          );

          if (rule) {

            const bread = await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "breads",
              `WHERE bread_id=${Number(rule.bread_id)}`,
              "bread_id, name"
            );

            breadTotals.push({
              id: bread.bread_id,
              name: bread.name,
              qty: Number(rule.qty || 0) * mealQty
            });
          }
        }

        /* 🥗 Subji */
        let subjiTotals = [];

        if (Array.isArray(selected.subji_ids) && selected.subji_ids.length) {
          const validSubjis = selected.subji_ids.filter(sid => !isNaN(Number(sid)) && sid !== null && sid !== '');
          if (validSubjis.length) {
            const totalSubji = Number(r.subji_count || 0) * mealQty;
            const perSubjiQty = totalSubji / validSubjis.length;

            for (let sid of validSubjis) {
              const subjiId = Number(sid);
              const subji = await dbQuery.fetchSingleRecord(
                constants.vals.defaultDB,
                "subjis",
                `WHERE subji_id=${subjiId}`,
                "subji_id, name"
              );

              if (subji) {
                subjiTotals.push({
                  id: subji.subji_id,
                  name: subji.name,
                  qty: perSubjiQty
                });
              }
            }
          }
        }

        /* 🍚 Other */
        let otherTotals = [];

        if (Number(r.other_count) > 0) {

          const others = await dbQuery.rawQuery(
            constants.vals.defaultDB,
            `
            SELECT other_item_id, name
            FROM other_items
            WHERE is_active=1
            ORDER BY other_item_id ASC
            LIMIT ${Number(r.other_count)}
            `
          );

          for (let o of others) {
            otherTotals.push({
              id: o.other_item_id,
              name: o.name,
              qty: mealQty
            });
          }
        }

        /* ➕ Extras */
        for (let ex of extrasRaw) {

          let row = null;

          if (ex.item_type === "bread") {
            row = await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "breads",
              `WHERE bread_id=${ex.item_id}`,
              "bread_id AS id, name"
            );
          }

          if (ex.item_type === "subji") {
            row = await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "subjis",
              `WHERE subji_id=${ex.item_id}`,
              "subji_id AS id, name"
            );
          }

          if (ex.item_type === "other") {
            row = await dbQuery.fetchSingleRecord(
              constants.vals.defaultDB,
              "other_items",
              `WHERE other_item_id=${ex.item_id}`,
              "other_item_id AS id, name"
            );
          }

          if (row) {
            extras.push({
              item_type: ex.item_type,
              id: row.id,
              name: row.name,
              qty: Number(ex.quantity || 0)
            });
          }
        }

        totals = {
          bread: breadTotals,
          subji: subjiTotals,
          other: otherTotals
        };

        selected_items = {
          bread: breadTotals[0] || null,
          subjis: subjiTotals,
          other_items: otherTotals
        };
      }

      /* ================= PUSH RESULT ================= */
      result.push({
  order_id: r.order_id,
  delivery_date: r.delivery_date,
  slot: r.slot,
  delivery_status: r.delivery_status,

  // ⭐ ADD THESE 2 LINES
  delivery_boy_name: r.delivery_boy_name || null,
  delivery_invoice_no: r.delivery_invoice_no || null,

  user: {
    name: r.user_name,
    mobile: r.mobile_no
  },

  address: r.full_address,

  meal: {
    name: r.meals_name,
    description: r.description,
    quantity: mealQty
  },

  selected_items,
  extras,
  totals,

  payment: {
    total_amount: r.total_amount,
    is_paid: r.is_paid
  }
});

    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Admin daily order list fetched",
      data: result
    });

  } catch (err) {

    console.error("ADMIN DAILY ORDER ERROR", err);

    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });

  }
};










exports.getPendingPayments = async (req, res) => {
  const rows = await dbQuery.rawQuery(
    constants.vals.defaultDB,
    `
    SELECT 
      u.user_id,
      u.name,
      u.mobile_no,
      SUM(
        CASE 
          WHEN wt.type='debit' THEN wt.amount
          WHEN wt.type='credit' THEN -wt.amount
        END
      ) AS pending_amount
    FROM wallet_transactions wt
    JOIN users u ON u.user_id=wt.user_id
    GROUP BY wt.user_id
    HAVING pending_amount > 0
    `
  );

  return utility.apiResponse(req, res, {
    status: "success",
    data: rows
  });
};


exports.adminGetUsers = async (req, res) => {
  try {
    const { pay_later } = req.query;

    let where = "u.is_delete=0";

    if (pay_later === "1") where += " AND u.allow_pay_later=1";
    if (pay_later === "0") where += " AND u.allow_pay_later=0";

    const rows = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
  SELECT 
    u.user_id,
    u.name,
    u.email,
    u.mobile_no,
    u.is_active,
    u.allow_pay_later,
    u.pay_later_limit,
    u.created_at,

    (
      SELECT COUNT(*)
      FROM orders o
      WHERE o.user_id = u.user_id
    ) AS total_orders,

    (
      SELECT 
        COALESCE(
          SUM(
            CASE 
              WHEN wt.type = 'debit'  THEN wt.amount
              WHEN wt.type = 'credit' THEN -wt.amount
            END
          ),
          0
        )
      FROM wallet_transactions wt
      WHERE wt.user_id = u.user_id
    ) AS pending_wallet_amount

FROM users u
WHERE u.is_delete = 0
ORDER BY u.user_id DESC;

  `
    );


    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Users fetched",
      data: rows
    });

  } catch (err) {
    console.error("ADMIN GET USERS ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.adminDeleteUser = async (req, res) => {
  try {

    const { user_id } = req.body;

    if (!user_id) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "user_id required"
      });
    }

    // Check user exists
    const user = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE user_id=${user_id}`,
      "user_id,is_delete"
    );

    if (!user) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "User not found"
      });
    }

    if (Number(user.is_delete) === 1) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "User already deleted"
      });
    }

    // ✅ Soft delete
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "users",
      `user_id=${user_id}`,
      `is_delete=1, is_active=0`
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "User deleted successfully"
    });

  } catch (err) {
    console.error("ADMIN DELETE USER ERROR:", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};






exports.adminUserDetails = async (req, res) => {
  try {
    const { user_id } = req.query;

    // 👤 User
    const user = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE user_id=${user_id} AND is_delete=0`,
      "user_id,name,email,mobile_no,is_active,created_at"
    );

    if (!user) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "User not found"
      });
    }

    // 🏠 Addresses
    const addresses = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT * FROM user_addresses WHERE user_id=${user_id}`
    );

    // 💰 Wallet
    const walletTxns = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT *
      FROM wallet_transactions
      WHERE user_id=${user_id}
      ORDER BY created_at DESC
      `
    );

    let wallet_balance = 0;
    for (let t of walletTxns) {
      if (t.type === "debit") wallet_balance += Number(t.amount);
      if (t.type === "credit") wallet_balance -= Number(t.amount);
    }

    // 📦 Orders
    const orders = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        o.order_id,
        o.order_type,
        o.total_amount,
        o.is_paid,
        o.status,
        o.created_at,
        GROUP_CONCAT(os.delivery_date ORDER BY os.delivery_date) AS delivery_dates,
        MIN(os.slot) AS slot
      FROM orders o
      JOIN order_schedule os ON os.order_id=o.order_id
      WHERE o.user_id=${user_id}
      GROUP BY o.order_id
      ORDER BY o.order_id DESC
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      data: {
        user,
        addresses,
        wallet: {
          balance: wallet_balance.toFixed(2),
          transactions: walletTxns
        },
        orders
      }
    });

  } catch (err) {
    console.error("ADMIN USER DETAILS ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.adminUserOrderHistory = async (req, res) => {
  try {
    const { user_id } = req.query;

    const rows = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT 
        o.order_id,
        o.total_amount,
        o.is_paid,
        o.status,
        o.created_at,
        os.delivery_date,
        os.slot,
        ua.full_address,
        oi.quantity,
        oi.selected_items,
        m.meals_name,
        m.bread_count,
        m.subji_count,
        m.other_count
      FROM orders o
      JOIN order_schedule os ON os.order_id=o.order_id
      JOIN order_items oi ON oi.order_item_id=os.order_item_id
      JOIN meals m ON m.meals_id=oi.meals_id
      LEFT JOIN user_addresses ua ON ua.address_id=os.address_id
      WHERE o.user_id=${user_id}
      ORDER BY o.order_id DESC
      `
    );

    const result = [];

    for (let r of rows) {
      const parsed = typeof r.selected_items === "string"
        ? JSON.parse(r.selected_items)
        : r.selected_items || {};

      const selected = parsed.selected_items || {};
      const extras = parsed.extra_items || [];


      result.push({
        order_id: r.order_id,
        delivery_date: r.delivery_date,
        slot: r.slot,
        meal: {
          name: r.meals_name,
          quantity: r.quantity,
          structure: {
            bread_count: r.bread_count,
            subji_count: r.subji_count,
            other_count: r.other_count
          }
        },
        selected_items: selected,
        extra_items: extras,
        address: r.full_address,
        payment: {
          total_amount: r.total_amount,
          is_paid: r.is_paid
        },
        status: r.status,
        created_at: r.created_at
      });
    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "User order history fetched",
      data: result
    });

  } catch (err) {
    console.error("ADMIN USER ORDER HISTORY ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};


exports.setPayLaterAccess = async (req, res) => {
  try {
    const body = req.body.inputdata || {};
    const {
      apply_for,        // all | single | multiple
      user_ids = [],
      user_id,
      allow_pay_later,
      pay_later_limit
    } = body;

    if (!["all", "single", "multiple"].includes(apply_for)) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "Invalid apply_for value"
      });
    }

    if (![0, 1].includes(allow_pay_later)) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "allow_pay_later must be 0 or 1"
      });
    }

    let where = "";

    if (apply_for === "single") {
      if (!user_id) {
        return utility.apiResponse(req, res, {
          status: "error",
          msg: "user_id required"
        });
      }
      where = `user_id=${user_id}`;
    }

    if (apply_for === "multiple") {
      if (!user_ids.length) {
        return utility.apiResponse(req, res, {
          status: "error",
          msg: "user_ids required"
        });
      }
      where = `user_id IN (${user_ids.join(",")})`;
    }

    if (apply_for === "all") {
      where = "1=1";
    }

    const limitValue =
      allow_pay_later === 1
        ? Number(pay_later_limit || 0)
        : null;

    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      "users",
      where,
      `
        allow_pay_later=${allow_pay_later},
        pay_later_limit=${limitValue}
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Pay Later settings updated"
    });

  } catch (err) {
    console.error("SET PAY LATER ERROR", err);
    return res.status(500).json({
      status: "error",
      msg: "Internal server error"
    });
  }
};



exports.adminSendPendingPaymentNotification = async (req, res) => {
  try {

    const { user_id, amount } = req.body;

    if (!user_id || amount === undefined) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "user_id and amount required"
      });
    }

    const user = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "users",
      `WHERE user_id=${user_id} AND is_delete=0`,
      "user_id,firebase_token,name"
    );

    if (!user) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "User not found"
      });
    }

    const title = "💳 Payment Pending";
    const message =
      `Dear ${user.name}, Your subscription payment ₹${amount} is pending. Tap to pay & continue service.`;

    await utility.notifyUser(
      user.firebase_token,
      "wallet",
      user_id,
      title,
      message,
      user.user_id
    );

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Notification sent"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", msg: "Server error" });
  }
};





exports.adminSendReminderOrderNotification = async (req, res) => {
  try {

    const users = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT user_id, firebase_token
      FROM users
      WHERE is_active=1 AND is_delete=0
      `
    );

    if (!users.length) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "No users found"
      });
    }

    const title = "⚠️ Last Reminder";
    const message = "Sabji selection closing soon. Select now to avoid missing today’s meal.";

    for (let u of users) {

      await utility.notifyUser(
        u.firebase_token,
        "order",
        0,
        title,
        message,
        u.user_id
      );

    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Reminder order notification sent"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      msg: "Server error"
    });
  }
};

exports.adminSendMenuUpdateNotification = async (req, res) => {
  try {

    const users = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT user_id, firebase_token
      FROM users
      WHERE is_active=1 AND is_delete=0
      `
    );

    if (!users.length) {
      return utility.apiResponse(req, res, {
        status: "error",
        msg: "No users found"
      });
    }

    const title = "Menu Updated 🍽️";
    const message = "New dishes added! Order now.";

    for (let u of users) {

      await utility.notifyUser(
        u.firebase_token,
        "order",
        0,
        title,
        message,
        u.user_id
      );

    }

    return utility.apiResponse(req, res, {
      status: "success",
      msg: "Menu update notification sent"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      msg: "Server error"
    });
  }
};




exports.getAdminDashboardStats = async (req, res) => {
  try {
    let { from_date, to_date } = req.query;

    if (!from_date || !to_date) {
      from_date = req.locals.now.split(" ")[0];
      to_date = from_date;
    }

    // TOTAL ORDERS
    const totalOrders = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT COUNT(*) AS total
      FROM orders
      WHERE status='active'
      AND DATE(created_at) BETWEEN '${from_date}' AND '${to_date}'
      `
    );

    // TOTAL CUSTOMERS
    const totalCustomers = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT COUNT(*) AS total
      FROM users
      WHERE is_delete=0
      `
    );

    // TOTAL PENDING PAYMENT
    const pendingAmount = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT SUM(wallet_balance) AS total
      FROM users
      WHERE wallet_balance > 0
      `
    );

    // TOTAL ORDER AMOUNT
    const totalOrderAmount = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `
      SELECT SUM(total_amount) AS total
      FROM orders
      WHERE status='active'
      AND DATE(created_at) BETWEEN '${from_date}' AND '${to_date}'
      `
    );

    return utility.apiResponse(req, res, {
      status: "success",
      data: {
        total_orders: totalOrders[0]?.total || 0,
        total_customers: totalCustomers[0]?.total || 0,
        pending_payment: pendingAmount[0]?.total || 0,
        total_order_amount: totalOrderAmount[0]?.total || 0
      }
    });

  } catch (err) {
    console.error("DASHBOARD ERROR", err);
    res.status(500).json({ status: "error", msg: "Internal error" });
  }
};



// tifin api




