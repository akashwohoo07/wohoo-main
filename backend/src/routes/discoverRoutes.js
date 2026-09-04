import express from "express";
import { protect } from "../middleware/auth.js";
import {
  searchPublicTrips,
  addWishlist,
  listWishlist,
  getWishlistKeys,
  removeWishlist,
} from "../controllers/discoverController.js";

const router = express.Router();
router.use(protect);

// Discover
router.get("/trips", searchPublicTrips);

// Wishlist (mounted under the same router for a single import)
router.get("/wishlist", listWishlist);
router.get("/wishlist/keys", getWishlistKeys);
router.post("/wishlist", addWishlist);
router.delete("/wishlist/:id", removeWishlist);

export default router;
