import { describe, it, expect } from "vitest";
import {
  getAllProducts,
  getProductById,
  getProductsByCategory,
  getInStockProducts,
} from "../src/services/product.service.js";

describe("Product Service", () => {
  describe("getAllProducts", () => {
    it("should return all products", () => {
      const products = getAllProducts();
      expect(products).toBeInstanceOf(Array);
      expect(products.length).toBeGreaterThan(0);
    });

    it("should return products with correct shape", () => {
      const products = getAllProducts();
      const product = products[0];
      expect(product).toHaveProperty("id");
      expect(product).toHaveProperty("name");
      expect(product).toHaveProperty("price");
      expect(product).toHaveProperty("category");
      expect(product).toHaveProperty("inStock");
    });
  });

  describe("getProductById", () => {
    it("should return product when valid id is provided", () => {
      const product = getProductById(1);
      expect(product).toBeDefined();
      expect(product?.id).toBe(1);
      expect(product?.name).toBe("Wireless Mouse");
    });

    it("should return undefined when product is not found", () => {
      const product = getProductById(999);
      expect(product).toBeUndefined();
    });
  });

  describe("getProductsByCategory", () => {
    it("should return products by category", () => {
      const electronics = getProductsByCategory("electronics");
      expect(electronics.length).toBeGreaterThan(0);
      electronics.forEach((product) => {
        expect(product.category).toBe("electronics");
      });
    });

    it("should return empty array for unknown category", () => {
      const products = getProductsByCategory("food");
      expect(products).toEqual([]);
    });
  });

  describe("getInStockProducts", () => {
    it("should return only in-stock products", () => {
      const inStock = getInStockProducts();
      expect(inStock.length).toBeGreaterThan(0);
      inStock.forEach((product) => {
        expect(product.inStock).toBe(true);
      });
    });

    it("should not include out-of-stock products", () => {
      const inStock = getInStockProducts();
      const allProducts = getAllProducts();
      const outOfStock = allProducts.filter((p) => !p.inStock);

      outOfStock.forEach((product) => {
        expect(inStock).not.toContainEqual(product);
      });
    });
  });
});
