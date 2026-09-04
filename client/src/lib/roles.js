// Single source of truth for what each trip role can do. Used by CreateTrip,
// the InviteModal, and the trip header so the wording never drifts.
//
// Enforcement lives on the backend (viewers get 403 on any mutation; only the
// owner manages people/roles); this file is just the human-facing copy.
export const ROLE_META = {
  owner: {
    label: "Owner",
    blurb: "Full control",
    can: "Edit everything, manage people & roles, delete the trip.",
  },
  editor: {
    label: "Editor",
    blurb: "Can edit the trip",
    can: "Edit the whole trip — plan, expenses, notes, files — and invite people. Only the owner changes roles or removes members.",
  },
  viewer: {
    label: "Viewer",
    blurb: "Can view & chat",
    can: "See everything and join the chat & notes, but can't edit the plan.",
  },
};

// Roles you can assign when inviting / changing a collaborator (owner is implicit).
export const ASSIGNABLE_ROLES = ["viewer", "editor"];

export const roleLabel = (role) => ROLE_META[role]?.label || "Member";
