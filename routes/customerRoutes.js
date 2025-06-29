const express = require("express");
require("dotenv").config;

const {
  createOrder,
  applyCoupon,
} = require("../controllers/orders.controller");

const router = express.Router();

router.post("/createOrder", createOrder);

router.post("/couponsApply", applyCoupon);

module.exports = router;
