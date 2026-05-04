var express = require("express");
var router = express.Router();

const apiMiddleware = require("../middlewares/api");
const { authentication } = require("../middlewares/authentication");

const {
  createPayment,
  createWalletPayment,
  paymentSuccess,
  paymentCancel,
  verifyPayment
} = require("../controllers/paymentController");


// create payment (user authenticated)
router.post(
  "/create_payment",
  apiMiddleware,
  authentication,
  createPayment
);


// ccavenue redirect success
router.post(
  "/payment_success",
  paymentSuccess
);


// ccavenue cancel
router.post(
  "/payment_cancel",
  paymentCancel
);


// create wallet payment (user authenticated)
router.post(
  "/create_wallet_payment",
  apiMiddleware,
  authentication,
  createWalletPayment
);


// verify payment (mobile app check)
router.post(
  "/verify_payment",
  apiMiddleware,
  authentication,
  verifyPayment
);

module.exports = router;