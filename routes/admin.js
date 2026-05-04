var express = require("express");
var apiMiddleware = require("../middlewares/api");
const {editDeliveryBoy,updateDeliveryBoyZones,assignMultipleZones,getDeliveryBoysWithZones,assignDeliveryBoyZone,removeDeliveryBoyZone,createZone,createDeliveryBoy,getZoneList,deleteZone,getAllOrderLocations,adminDeleteUser,getOrderSetting,updateOrderSetting,setPayLaterAccess,getAdminDashboardStats,adminSendReminderOrderNotification,adminSendPendingPaymentNotification,adminSendMenuUpdateNotification,adminUserOrderHistory,adminUserDetails,adminGetUsers,adminLogin,addMeal,getKitchenSummary,getPendingPayments,getAdminDailyOrders,adminSettlePayment,getAllOrders,toggleOtherItemStatus,deleteOtherItem,editOtherItem,getOtherItem,addOtherItem,toggleSpecialItemStatus,toggleSubjiStatus,toggleBreadStatus,toggleMealStatus,addMealStructure,addBread,getBread,editBread,deleteBread,addSubji,getSubji,editSubji,deleteSubji,addSpecialItem,getSpecialItems,editSpecialItem,deleteSpecialItem,getMeals,editMeal,deleteMeal,adminGetProfile,addSideItem,getSideItems,editSideItem,deleteSideItem,toggleSideItemStatus } = require("../controllers/adminController");
const { adminAuthentication } = require('../middlewares/authentication');
const FileManager = require("../helpers/file_manager");
var app = express();

// Login
app.use("/login", apiMiddleware, adminLogin);
app.use("/update_delivery_boy_zones", apiMiddleware, adminAuthentication, updateDeliveryBoyZones);

app.use("/assign_multiple_zones", apiMiddleware, adminAuthentication, assignMultipleZones);
app.use("/edit_delivery_boy", apiMiddleware, adminAuthentication, editDeliveryBoy);

app.use("/get_delivery_boyswithzones", apiMiddleware, adminAuthentication, getDeliveryBoysWithZones);
app.use("/assign_delivery_boyzone", apiMiddleware, adminAuthentication, assignDeliveryBoyZone);
app.use("/remove_delivery_boyzone", apiMiddleware, adminAuthentication, removeDeliveryBoyZone);
app.use("/create_zone", apiMiddleware, adminAuthentication, createZone);
app.use("/delete_zone", apiMiddleware, adminAuthentication, deleteZone);
app.use("/create_delivery_boy", apiMiddleware, adminAuthentication, createDeliveryBoy);
app.use("/zone_list", apiMiddleware, adminAuthentication, getZoneList);


//
app.use("/get_all_order_locations", apiMiddleware, adminAuthentication, getAllOrderLocations);
//
app.use("/get_order_setting", apiMiddleware, adminAuthentication, getOrderSetting);
//
app.use("/update_order_setting", apiMiddleware, adminAuthentication, updateOrderSetting);
//
app.use("/set_pay_later_access", apiMiddleware, adminAuthentication, setPayLaterAccess);

//
app.use("/admin_send_reminder_order_notification", apiMiddleware, adminAuthentication, adminSendReminderOrderNotification);

//
app.use("/admin_send_menu_update_notification", apiMiddleware, adminAuthentication, adminSendMenuUpdateNotification);

//
app.use("/admin_send_pending_payment_notification", apiMiddleware, adminAuthentication, adminSendPendingPaymentNotification);

//
app.use("/get_admin_profile", apiMiddleware, adminAuthentication, adminGetProfile);


//
app.use("/get_admin_dashboard_stats", apiMiddleware, adminAuthentication, getAdminDashboardStats);


//
app.use("/admin_user_order_history", apiMiddleware, adminAuthentication, adminUserOrderHistory);

//
app.use("/admin_user_details", apiMiddleware, adminAuthentication, adminUserDetails);

//
app.use("/admin_delete_user", apiMiddleware, adminAuthentication, adminDeleteUser);

//
app.use("/admin_get_all_Users", apiMiddleware, adminAuthentication, adminGetUsers);

//
app.use("/get_kitchen_summary", apiMiddleware, adminAuthentication, getKitchenSummary);


//
app.use("/get_pending_payments", apiMiddleware, adminAuthentication, getPendingPayments);

//
app.use("/get_admin_daily_orders", apiMiddleware, adminAuthentication, getAdminDailyOrders);

//
app.use("/add/add_other_item", apiMiddleware, adminAuthentication, addOtherItem);

//
app.use("/get_other_item", apiMiddleware, adminAuthentication, getOtherItem);

//
app.use("/edit_other_item", apiMiddleware, adminAuthentication, editOtherItem);

//
app.use("/delete_other_item", apiMiddleware, adminAuthentication, deleteOtherItem);

//
app.use("/toggle_other_item_status", apiMiddleware, adminAuthentication, toggleOtherItemStatus);

//
app.use("/add/add_side_item", apiMiddleware, adminAuthentication, addSideItem);

//
app.use("/get_side_items", apiMiddleware, adminAuthentication, getSideItems);

//
app.use("/edit_side_item", apiMiddleware, adminAuthentication, editSideItem);

//
app.use("/delete_side_item", apiMiddleware, adminAuthentication, deleteSideItem);

//
app.use("/toggle_side_item_status", apiMiddleware, adminAuthentication, toggleSideItemStatus);

// app.use("/createDatabase", apiMiddleware, createTenantDatabase);

// app.use("/addRegisterFields", apiMiddleware, addRegisterFields);


const upload = FileManager.userUploadProfilePicture("/meals/image/");


app.use("/add/add_meal", apiMiddleware, adminAuthentication, upload.single('image'), addMeal);


app.use("/admin_settle_payment", apiMiddleware, adminAuthentication, adminSettlePayment);


app.use("/get_all_orders", apiMiddleware, adminAuthentication, getAllOrders);


app.use("/toggle_bread_status", apiMiddleware, adminAuthentication, toggleBreadStatus);

app.use("/toggle_meal_status", apiMiddleware, adminAuthentication, toggleMealStatus);

app.use("/toggle_subji_status", apiMiddleware, adminAuthentication, toggleSubjiStatus);

app.use("/toggle_special_item_status", apiMiddleware, adminAuthentication, toggleSpecialItemStatus);


//
app.use("/get_meals", apiMiddleware, adminAuthentication, getMeals);

//
app.use("/edit_meal", apiMiddleware, adminAuthentication, upload.single('image'), editMeal);

//
app.use("/delete_meal", apiMiddleware, adminAuthentication, deleteMeal);


//
app.use("/add/add_bread", apiMiddleware, adminAuthentication, addBread);

//
app.use("/get_bread", apiMiddleware, adminAuthentication, getBread);

//
app.use("/edit_bread", apiMiddleware, adminAuthentication, editBread);

//
app.use("/delete_bread", apiMiddleware, adminAuthentication, deleteBread);


//
app.use("/add/add_subji", apiMiddleware, adminAuthentication, addSubji);

//
app.use("/get_subji", apiMiddleware, adminAuthentication, getSubji);

//
app.use("/delete_subji", apiMiddleware, adminAuthentication, deleteSubji);


//
app.use("/edit_subji", apiMiddleware, adminAuthentication, editSubji);

//
app.use("/add/add_special_item", apiMiddleware, adminAuthentication, addSpecialItem);

//
app.use("/delete_special_item", apiMiddleware, adminAuthentication, deleteSpecialItem);

//
app.use("/edit_Special_item", apiMiddleware, adminAuthentication, editSpecialItem);

//
app.use("/get_special_items", apiMiddleware, adminAuthentication, getSpecialItems);

//
app.use("/add/meal_structure", apiMiddleware, adminAuthentication, addMealStructure);


module.exports = app;