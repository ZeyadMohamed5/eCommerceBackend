const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const isAdmin = require("../middleware/isAdmin");
const upload = require("../middleware/upload");
const loginLimiter = require("../middleware/rateLimiter");
const {
  createUser,
  loginUser,
  check,
} = require("../controllers/users.controllers");

const {
  addProduct,
  updateProduct,
  deleteProduct,
  addCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/products.controllers");
const {
  getOrders,
  getOrderById,
  updateOrderStatus,
  addCoupon,
  getAllCoupons,
  deleteCoupon,
  toggleCouponStatus,
  addDiscount,
  getAllDiscounts,
  deleteDiscount,
  toggleDiscountStatus,
} = require("../controllers/orders.controller");
const {
  getDashboardSummary,
  getSalesByProduct,
  getSalesByCategory,
  getTopSellingProducts,
  getLowStockProducts,
  getCouponUsageStatus,
  getBestTimeToSell,
  getMonthlySalesTrends,
} = require("../controllers/dashboard.controller");

//
// 🔐 Auth Routes
//
router.post("/register", createUser); // Register User (Admin or Operator)

router.post("/login", loginLimiter, loginUser); // Login User (Admin or Operator)

router.get("/auth/check", auth, check);

//
// 📦 Product Routes (Admins Only)
//

router.post(
  "/addProduct",
  auth,
  isAdmin,
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "images", maxCount: 6 },
  ]),
  addProduct
);
router.put(
  "/product/:id",
  auth,
  isAdmin,
  upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "images", maxCount: 6 },
  ]),
  updateProduct
);
router.delete("/product/:id", auth, isAdmin, deleteProduct);

//
// 📬 Order Routes (Admins Only)
//
router.get("/orders", auth, isAdmin, getOrders);
router.get("/orders/:id", auth, isAdmin, getOrderById);
router.put("/orders/:id", auth, isAdmin, updateOrderStatus);

//
// 🎟 Coupon Routes (Admins Only)
//
router.post("/addCoupon", auth, isAdmin, addCoupon);
router.get("/coupons", auth, isAdmin, getAllCoupons);
router.delete("/coupons/:id", auth, isAdmin, deleteCoupon);
router.put("/coupons/:id/status", auth, isAdmin, toggleCouponStatus);

//
// 💸 Discount Routes (Admins Only)
//
router.post("/addDiscount", auth, isAdmin, addDiscount);
router.get("/discounts", auth, isAdmin, getAllDiscounts);
router.delete("/discounts/:id", auth, isAdmin, deleteDiscount);
router.patch("/discounts/:id", auth, isAdmin, toggleDiscountStatus);

//
// 🗂 Category Routes (Admins Only)
//
router.post("/addCategory", auth, isAdmin, upload.single("image"), addCategory);
router.put("/:type/:id", auth, isAdmin, updateCategory); // Generic update for category
router.delete("/:type/:id", auth, isAdmin, deleteCategory); // Generic delete for category

//
// 📊 Dashboard Analytics Routes (Admins Only)
//
router.get("/dashboard/summary", auth, isAdmin, getDashboardSummary);
router.get("/dashboard/salesByProduct", auth, isAdmin, getSalesByProduct);
router.get("/dashboard/salesByCategory", auth, isAdmin, getSalesByCategory);
router.get("/dashboard/topProducts", auth, isAdmin, getTopSellingProducts);
router.get("/dashboard/lowStockProducts", auth, isAdmin, getLowStockProducts);
router.get("/dashboard/couponUsage", auth, isAdmin, getCouponUsageStatus);
router.get("/dashboard/bestTimeToSell", auth, isAdmin, getBestTimeToSell);
router.get("/dashboard/monthlySales", auth, isAdmin, getMonthlySalesTrends);

module.exports = router;
