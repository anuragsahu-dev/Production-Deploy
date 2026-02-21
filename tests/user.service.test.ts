import { describe, it, expect } from "vitest";
import {
  getAllUsers,
  getUserById,
  getUsersByRole,
} from "../src/services/user.service.js";

describe("User Service", () => {
  describe("getAllUsers", () => {
    it("should return all users", () => {
      const users = getAllUsers();
      expect(users).toBeInstanceOf(Array);
      expect(users.length).toBeGreaterThan(0);
    });

    it("should return users with correct shape", () => {
      const users = getAllUsers();
      const user = users[0];
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("name");
      expect(user).toHaveProperty("email");
      expect(user).toHaveProperty("role");
    });
  });

  describe("getUserById", () => {
    it("should return user when valid id is provided", () => {
      const user = getUserById(1);
      expect(user).toBeDefined();
      expect(user?.id).toBe(1);
      expect(user?.name).toBe("Anurag");
    });

    it("should return undefined when user is not found", () => {
      const user = getUserById(999);
      expect(user).toBeUndefined();
    });
  });

  describe("getUsersByRole", () => {
    it("should return only admin users", () => {
      const admins = getUsersByRole("admin");
      expect(admins.length).toBeGreaterThan(0);
      admins.forEach((user) => {
        expect(user.role).toBe("admin");
      });
    });

    it("should return only regular users", () => {
      const regularUsers = getUsersByRole("user");
      expect(regularUsers.length).toBeGreaterThan(0);
      regularUsers.forEach((user) => {
        expect(user.role).toBe("user");
      });
    });

    it("should return empty array for unknown role", () => {
      const users = getUsersByRole("superadmin");
      expect(users).toEqual([]);
    });
  });
});
