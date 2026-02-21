// Fake static database
export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
}

export const users: User[] = [
  { id: 1, name: "Anurag", email: "anurag@example.com", role: "admin" },
  { id: 2, name: "Rahul", email: "rahul@example.com", role: "user" },
  { id: 3, name: "Priya", email: "priya@example.com", role: "user" },
  { id: 4, name: "Amit", email: "amit@example.com", role: "admin" },
];
