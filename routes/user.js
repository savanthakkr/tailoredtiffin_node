var express = require("express");
var apiMiddleware = require("../middlewares/api");
const {getNotifications,markNotificationsRead,deleteNotification,deleteAllNotifications,getUnreadNotificationCount,updateUserProfile,verifyPayment,updateCart,getUserProfile,getMyOrders,payWallet,getWallet,cancelOrder,createOrder, userLogin, userRegister,deleteCart,listUserAddresses,getSpecialItems,getOtherItems,userGetMeals,userGetSubjiList,userGetBreadList,getOrderDetails,addToCart,getCart,addUserAddress, editUserAddress, deleteUserAddress, sendOTP, verifyOTP, resendOTP, userGetSideItems } = require("../controllers/UserController");
const { purchaseSubscription, verifySubscriptionPayment, getSubscriptionStatus } = require('../controllers/subscriptionController');
const { authentication } = require('../middlewares/authentication');
const FileManager = require("../helpers/file_manager");

var app = express();

// tifin app routs start

// User register route
app.use("/register", apiMiddleware, userRegister);

// User login with mobile number (OTP verified via Firebase)
app.use("/user_login", apiMiddleware, userLogin);

// ============= OTP LOGIN ROUTES =============

// 📱 Send OTP via Twilio SMS
app.use("/send_otp", apiMiddleware, sendOTP);

// ✅ Verify OTP and get token
app.use("/verify_otp", apiMiddleware, verifyOTP);

// 🔄 Resend OTP (user didn't receive first one)
app.use("/resend_otp", apiMiddleware, resendOTP);

// ============================================


// 
app.use("/update_user_profile", apiMiddleware, authentication, updateUserProfile);

// 
app.use("/get_user_profile", apiMiddleware, authentication, getUserProfile);

// 
app.use("/get_my_orders", apiMiddleware, authentication, getMyOrders);

// 
app.use("/get_notifications", apiMiddleware, authentication, getNotifications);

// 
app.use("/mark_notifications_read", apiMiddleware, authentication, markNotificationsRead);

// 
app.use("/delete_notification", apiMiddleware, authentication, deleteNotification);

// 
app.use("/delete_all_notifications", apiMiddleware, authentication, deleteAllNotifications);

// 
app.use("/get_unread_notification_count", apiMiddleware, authentication, getUnreadNotificationCount);


app.use("/update_cart", apiMiddleware, authentication, updateCart);

// 
app.use("/pay_wallet", apiMiddleware, authentication, payWallet);

// 
app.use("/get_wallet", apiMiddleware, authentication, getWallet);

// 
app.use("/cancel_order", apiMiddleware, authentication, cancelOrder);

// 
app.use("/get_meals", apiMiddleware, authentication, userGetMeals);

// 
app.use("/get_subji_list", apiMiddleware, authentication, userGetSubjiList);

// 
app.use("/get_bread_list", apiMiddleware, authentication, userGetBreadList);

// 
app.use("/get_special_items", apiMiddleware, authentication, getSpecialItems);

app.use("/get_side_items", apiMiddleware, authentication, userGetSideItems);

// 
app.use("/get_other_items", apiMiddleware, authentication, getOtherItems);

// User Address route
app.use("/add_address", apiMiddleware, authentication, addUserAddress);

//
app.use("/delete_address", apiMiddleware, authentication, deleteUserAddress);

//
app.use("/edit_address", apiMiddleware, authentication, editUserAddress);


//
app.use("/list_address", apiMiddleware, authentication, listUserAddresses);


//
app.use("/delete_cart", apiMiddleware, authentication, deleteCart);

//
app.use("/add_cart", apiMiddleware, authentication, addToCart);

//
app.use("/get_cart", apiMiddleware, authentication, getCart);

//
app.use("/create_order", apiMiddleware, authentication, createOrder);

// Subscription payment routes
app.use("/purchase_subscription", apiMiddleware, authentication, purchaseSubscription);
app.use("/verify_subscription_payment", apiMiddleware, authentication, verifySubscriptionPayment);
app.use("/get_subscription_status", apiMiddleware, authentication, getSubscriptionStatus);

//
app.use("/verify_payment", apiMiddleware, authentication, verifyPayment);

//
app.use("/get_order_details", apiMiddleware, authentication, getOrderDetails);

// tifin app routes end







module.exports = app;