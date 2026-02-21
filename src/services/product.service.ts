import { products, type Product } from "../data/products.js";

export function getAllProducts(): Product[] {
  return products;
}

export function getProductById(id: number): Product | undefined {
  return products.find((product) => product.id === id);
}

export function getProductsByCategory(category: string): Product[] {
  return products.filter((product) => product.category === category);
}

export function getInStockProducts(): Product[] {
  return products.filter((product) => product.inStock);
}
