export type User = {
  _id: string;
  name: string;
  email: string;
  username?: string;
  avatar?: string;
  bio?: string;
  isPublic?: boolean;
  followersCount?: number;
  followingCount?: number;
};

export type Destination = {
  name?: string;
  fullLabel?: string;
  country?: string;
  coordinates?: { lat: number; lng: number };
};

export type Trip = {
  _id: string;
  name: string;
  destination?: Destination;
  startDate?: string;
  endDate?: string;
  status?: "upcoming" | "ongoing" | "past" | string;
  coverPhoto?: string;
  members?: { user: User | string; role: "owner" | "editor" | "viewer" }[];
  itinerary?: any[];
};

export type Place = {
  id: string;
  name: string;
  address?: string;
  photo?: string;
  rating?: number;
  reviewCount?: number;
  isOpen?: boolean | null;
  lat?: number;
  lng?: number;
};
