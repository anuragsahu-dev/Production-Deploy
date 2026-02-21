import { Router } from "express";
import {
  getAllProducts,
  getProductById,
  getProductsByCategory,
  getInStockProducts,
} from "../services/product.service.js";

const router = Router();

// GET /api/products
router.get("/", (_req, res) => {
  const products = getAllProducts();
  res.json({ success: true, data: products });
});

// GET /api/products/in-stock
router.get("/in-stock", (_req, res) => {
  const products = getInStockProducts();
  res.json({ success: true, data: products });
});

// GET /api/products/:id
router.get("/:id", (req, res) => {
  const product = getProductById(Number(req.params.id));
  if (!product) {
    res.status(404).json({ success: false, message: "Product not found" });
    return;
  }
  res.json({ success: true, data: product });
});

// GET /api/products/category/:category
router.get("/category/:category", (req, res) => {
  const products = getProductsByCategory(req.params.category);
  res.json({ success: true, data: products });
});

export default router;
