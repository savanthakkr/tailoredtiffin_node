var express = require("express");
var apiMiddleware = require("../middlewares/api");
const { addFeedback, viewFeedback } = require("../controllers/UserFeedbackController");
const { authentication } = require('../middlewares/authentication');

var app = express();

// Add feedback
app.use("/add", apiMiddleware, authentication, addFeedback);

// View feedback
app.use("/view", apiMiddleware, authentication, viewFeedback);

module.exports = app;