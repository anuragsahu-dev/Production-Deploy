// Fake static database
export interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
}

export const products: Product[] = [
  {
    id: 1,
    name: "Wireless Mouse",
    price: 599,
    category: "electronics",
    inStock: true,
  },
  {
    id: 2,
    name: "Mechanical Keyboard",
    price: 2499,
    category: "electronics",
    inStock: true,
  },
  {
    id: 3,
    name: "USB-C Hub",
    price: 1299,
    category: "electronics",
    inStock: false,
  },
  {
    id: 4,
    name: "Notebook",
    price: 149,
    category: "stationery",
    inStock: true,
  },
  {
    id: 5,
    name: "Backpack",
    price: 1999,
    category: "accessories",
    inStock: true,
  },
];
