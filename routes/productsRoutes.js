const express = require("express");
const {
  allProducts,
  allCategories,
  getProductById,
  searchProducts,
} = require("../controllers/products.controllers");

const router = express.Router();

// Public - get all products

router.get("/", allProducts);

// Public - get all categories

router.get("/categories", allCategories);

// Public - search products

router.get("/search", searchProducts);

// Public - each product by id

router.get("/:id", getProductById);

module.exports = router;
