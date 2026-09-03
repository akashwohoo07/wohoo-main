import crypto from "crypto";
import Trip from "../models/Trip.js";
import Invitation from "../models/Invitation.js";
import User from "../models/User.js";
import { dispatchEmail, JOB_INVITE } from "../queues/emailQueue.js";
import { analyticsReadPreference } from "../config/readPreference.js";
import { createNotification, markInvitationNotificationsRead } from "./notificationController.js";
import { postTripSystemMessage } from "./tripChatController.js";

// ── CREATE TRIP ───────────────────────────────────────────────
export const createTrip = async (req, res, next) => {
  try {
    const { name, destination, startDate, endDate, coverPhoto } = req.body;

    if (!name || !destination?.name) {
      return res.status(400).json({ success: false, message: "Name and destination are required" });
    }

    const trip = await Trip.create({
      name,
      destination,
      startDate: startDate || null,
      endDate: endDate || null,
      coverPhoto: coverPhoto || null,
      owner: req.user._id,
      members: [{ user: req.user._id, role: "owner", joinedAt: new Date() }],
    });

    res.status(201).json({ success: true, trip });
  } catch (err) {
    next(err);
  }
};

// ── GET MY TRIPS ──────────────────────────────────────────────
export const getMyTrips = async (req, res, next) => {
  try {
    const trips = await Trip.find({ "members.user": req.user._id })
      .populate("members.user", "name avatar email")
      .populate("owner", "name avatar")
      .sort({ createdAt: -1 })
      .read(analyticsReadPreference()); // dashboard tolerates slight replica lag

    // Compute display status in memory — no DB write. The scheduled job keeps
    // the stored status eventually consistent.
    Trip.applyComputedStatus(trips);

    const upcoming = trips.filter((t) => t.status === "upcoming" || t.status === "ongoing");
    const past = trips.filter((t) => t.status === "past");

    res.json({ success: true, upcoming, past });
  } catch (err) {
    next(err);
  }
};

// ── GET SINGLE TRIP ───────────────────────────────────────────
export const getTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id)
      .populate("members.user", "name avatar email")
      .populate("owner", "name avatar email");

    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });

    const isMember = trip.members.some(
      (m) => m.user._id.toString() === req.user._id.toString()
    );

    // Allow access if member OR trip is public
    if (!isMember && !trip.isPublic) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    res.json({ success: true, trip });
  } catch (err) {
    next(err);
  }
};

// ── UPDATE TRIP ───────────────────────────────────────────────
export const updateTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });

    const member = trip.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!member || member.role === "viewer") {
      return res.status(403).json({ success: false, message: "No edit access" });
    }

    // ✅ includes notes and all updatable fields
    const allowed = ["name", "destination", "startDate", "endDate", "coverPhoto", "notes"];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) trip[field] = req.body[field];
    });

    await trip.save();
    res.json({ success: true, trip });
  } catch (err) {
    next(err);
  }
};

// ── UPDATE ITINERARY ──────────────────────────────────────────
export const updateItinerary = async (req, res, next) => {
    try {
      const trip = await Trip.findById(req.params.id);
      if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });
  
      const member = trip.members.find(
        (m) => m.user.toString() === req.user._id.toString()
      );
      if (!member || member.role === "viewer") {
        return res.status(403).json({ success: false, message: "No edit access" });
      }
  
      // ✅ Sanitize — strip _id from frontend, store clientId separately
      trip.itinerary = (req.body.itinerary || []).map((item) => ({
        clientId: item._id || item.clientId || "",
        type: item.type || "destination",
        title: item.title || "",
        date: item.date || "",
        endDate: item.endDate || "",
        time: item.time || "",
        endTime: item.endTime || "",
        isSubDest: item.isSubDest || false,
        placeId: item.placeId || "",
        lat: item.lat ?? null,
        lng: item.lng ?? null,
        region: item.region || "",
        price: item.price || "",
        currency: item.currency || "",
        notes: item.notes || "",
        // transport-leg fields
        transportMode: item.transportMode || "",
        fromStation: item.fromStation || "",
        toStation: item.toStation || "",
        fromLat: item.fromLat ?? null,
        fromLng: item.fromLng ?? null,
        toLat: item.toLat ?? null,
        toLng: item.toLng ?? null,
        bookingRef: item.bookingRef || "",
      }));
  
      await trip.save();
      res.json({ success: true, itinerary: trip.itinerary });
    } catch (err) {
      next(err);
    }
  };

// ── TOGGLE PRIVACY ────────────────────────────────────────────
export const togglePrivacy = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });

    const member = trip.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!member || member.role !== "owner") {
      return res.status(403).json({ success: false, message: "Only owner can change trip privacy" });
    }

    trip.isPublic = !trip.isPublic;
    await trip.save();

    res.json({
      success: true,
      isPublic: trip.isPublic,
      message: `Trip is now ${trip.isPublic ? "public" : "private"}`,
    });
  } catch (err) {
    next(err);
  }
};

// ── INVITE MEMBER ─────────────────────────────────────────────
export const inviteMember = async (req, res, next) => {
  try {
    const { email: rawEmail, username, role = "viewer" } = req.body;
    if (!["editor", "viewer"].includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const trip = await Trip.findById(req.params.id).populate("owner", "name");
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });

    const member = trip.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!member || member.role === "viewer") {
      return res.status(403).json({ success: false, message: "No permission to invite" });
    }

    // Resolve the invitee by username or email. Username takes precedence.
    // Either way we end up with a canonical `email` (for the invite record +
    // email) and, when the person already has an account, `invitedUser`.
    let invitedUser = null;
    let email = null;
    if (username) {
      invitedUser = await User.findOne({ username: String(username).trim().toLowerCase() });
      if (!invitedUser) {
        return res.status(404).json({ success: false, message: "No user found with that username" });
      }
      email = invitedUser.email;
    } else if (rawEmail) {
      email = String(rawEmail).trim().toLowerCase();
      if (!email.includes("@")) {
        return res.status(400).json({ success: false, message: "Enter a valid email" });
      }
      invitedUser = await User.findOne({ email });
    } else {
      return res.status(400).json({ success: false, message: "Provide a username or email" });
    }

    if (invitedUser && invitedUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "You can't invite yourself" });
    }

    if (invitedUser && trip.members.some((m) => m.user.toString() === invitedUser._id.toString())) {
      return res.status(409).json({ success: false, message: "User is already a member" });
    }

    const existingInvite = await Invitation.findOne({
      trip: trip._id,
      invitedEmail: email,
      status: "pending",
    });
    if (existingInvite) {
      return res.status(409).json({ success: false, message: "Invite already sent to this person" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const invite = await Invitation.create({
      trip: trip._id,
      invitedBy: req.user._id,
      invitedEmail: email,
      invitedUser: invitedUser?._id || null,
      role,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // In-app notification for the invited user (only if they have an account).
    // Non-blocking — like email, a failure here must not fail the invite.
    if (invitedUser) {
      try {
        await createNotification({
          recipient: invitedUser._id,
          type: "trip_invite",
          actor: req.user._id,
          trip: trip._id,
          invitation: invite._id,
          token,
          role,
          message: `${req.user.name} invited you to join "${trip.name}"`,
        });
      } catch (notifyErr) {
        console.error("Notification create failed:", notifyErr.message);
      }
    }

    // Queue the invite email — offloaded to the worker so a slow/failing email
    // provider never blocks or fails this response.
    try {
      await dispatchEmail(JOB_INVITE, {
        toEmail: email,
        inviterName: req.user.name,
        tripName: trip.name,
        destination: trip.destination?.fullLabel || trip.destination?.name || null,
        startDate: trip.startDate || null,
        inviteUrl: `${process.env.CLIENT_URL}/invite/${token}`,
        role,
      });
    } catch (emailErr) {
      console.error("Email dispatch failed:", emailErr.message);
    }

    res.status(201).json({ success: true, message: "Invitation sent", invite });
  } catch (err) {
    next(err);
  }
};

// ── GET MY INVITATIONS ────────────────────────────────────────
export const getMyInvitations = async (req, res, next) => {
  try {
    const invites = await Invitation.find({
      invitedEmail: req.user.email,
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
      .populate("trip", "name destination coverPhoto startDate endDate")
      .populate("invitedBy", "name avatar");

    res.json({ success: true, invites });
  } catch (err) {
    next(err);
  }
};

// ── RESPOND TO INVITATION ─────────────────────────────────────
export const respondToInvitation = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { action } = req.body;

    const invite = await Invitation.findOne({ token, status: "pending" });

    if (!invite) {
      return res.status(404).json({ success: false, message: "Invitation not found or expired" });
    }
    if (invite.expiresAt < new Date()) {
      await Invitation.findByIdAndUpdate(invite._id, { status: "expired" });
      return res.status(410).json({ success: false, message: "Invitation has expired" });
    }
    if (invite.invitedEmail !== req.user.email) {
      return res.status(403).json({ success: false, message: "This invite is not for you" });
    }

    if (action === "accept") {
      await Trip.findByIdAndUpdate(
        invite.trip,
        {
          $addToSet: {
            members: { user: req.user._id, role: invite.role, joinedAt: new Date() },
          },
        },
        { new: true }
      );
      await Invitation.findByIdAndUpdate(invite._id, { status: "accepted", invitedUser: req.user._id });
      await markInvitationNotificationsRead(invite._id, req.user._id).catch(() => {});
      // Announce the new member in the trip chat.
      const joinerHandle = req.user.username ? `@${req.user.username}` : req.user.name;
      await postTripSystemMessage(invite.trip, req.user._id, `${joinerHandle} joined the trip`);
      // Let the inviter know their invite was accepted.
      try {
        const t = await Trip.findById(invite.trip).select("name");
        await createNotification({
          recipient: invite.invitedBy,
          type: "invite_accepted",
          actor: req.user._id,
          trip: invite.trip,
          message: `${req.user.name} accepted your invite to "${t?.name || "your trip"}"`,
        });
      } catch (e) {
        console.error("Notification create failed:", e.message);
      }
      return res.json({ success: true, message: "Invitation accepted", tripId: invite.trip });
    }

    if (action === "decline") {
      await Invitation.findByIdAndUpdate(invite._id, { status: "declined" });
      await markInvitationNotificationsRead(invite._id, req.user._id).catch(() => {});
      try {
        const t = await Trip.findById(invite.trip).select("name");
        await createNotification({
          recipient: invite.invitedBy,
          type: "invite_declined",
          actor: req.user._id,
          trip: invite.trip,
          message: `${req.user.name} declined your invite to "${t?.name || "your trip"}"`,
        });
      } catch (e) {
        console.error("Notification create failed:", e.message);
      }
      return res.json({ success: true, message: "Invitation declined" });
    }

    res.status(400).json({ success: false, message: "Invalid action" });
  } catch (err) {
    next(err);
  }
};