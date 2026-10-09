// Shared by server and client components (a "use client" module can't export plain values to the server).

/**
 * WhatsApp works for any business, not just hotels: a number linked to a
 * project with a hotel booking source gets the hotel words (room, check-in,
 * nights); every other business gets general sales words. Same stored
 * fields either way (room → item, check_in → date, nights → quantity).
 */
export type BusinessKind = "hotel" | "general";
export const DEAL_WORDS = {
  hotel: {
    section: "Booking",
    mark: "Mark as booked",
    done: "Booking",
    item: "Room",
    date: "Check-in",
    qty: "Nights",
    ref: "Hotel booking ref",
    refTitle: "If this booking is also entered in the hotel's admin, its ref — so it's counted once",
    won: "Booked",
    lost: "Not booked",
  },
  general: {
    section: "Sale",
    mark: "Mark as won",
    done: "Sale",
    item: "Product / service",
    date: "Date",
    qty: "Quantity",
    ref: "Order ref",
    refTitle: "Its ref in your own system — so it's counted once",
    won: "Won",
    lost: "Lost",
  },
} as const;
