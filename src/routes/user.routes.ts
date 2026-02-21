import { Router } from "express";
import { getAllUsers, getUserById, getUsersByRole } from "../services/user.service.js";

const router = Router();

// GET /api/users
router.get("/", (_req, res) => {
  const users = getAllUsers();
  res.json({ success: true, data: users });
});

// GET /api/users/:id
router.get("/:id", (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  res.json({ success: true, data: user });
});

// GET /api/users/role/:role
router.get("/role/:role", (req, res) => {
  const users = getUsersByRole(req.params.role);
  res.json({ success: true, data: users });
});

export default router;
