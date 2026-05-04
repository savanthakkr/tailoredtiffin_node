const express = require("express");
const router = express.Router();

const deliveryBoyController = require("../controllers/deliveryBoyController");
const { authentication, checkDeliveryBoyStatus } = require("../middlewares/authentication");
const apiMiddleware = require("../middlewares/api");

// Login route - users login via regular /login endpoint (in user routes)
// This endpoint is deprecated - delivery boys use regular user login
router.post("/login", apiMiddleware, deliveryBoyController.loginDeliveryBoy);

// Get all orders assigned to this driver
// Requires: authentication (user_Token) + delivery_boy_id in delivery_boys table
router.get("/assigned_orders", apiMiddleware, authentication, checkDeliveryBoyStatus, deliveryBoyController.getAssignedOrders);

// Get details of specific assigned order
// Requires: authentication (user_Token) + delivery_boy_id in delivery_boys table
router.get("/assigned_order_details", apiMiddleware, authentication, checkDeliveryBoyStatus, deliveryBoyController.getAssignedOrderDetails);

// Update order delivery & payment status
// Requires: authentication (user_Token) + delivery_boy_id in delivery_boys table
router.post("/update_order_status", apiMiddleware, authentication, checkDeliveryBoyStatus, deliveryBoyController.updateOrderStatus);

module.exports = router;
