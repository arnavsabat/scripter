// A person's columns, read the same way everywhere (D-108): as the User shape, from `users u`.
// Guests past their 24 hours aren't anyone: they can't sign in, refresh or call the API.
export const USER = `u.id, u.name, u.email, u.guest_until as "guestUntil"`;
export const NOT_EXPIRED = `(u.guest_until is null or u.guest_until > now())`;

/** Guests get a day with the demo (D-108). */
export const GUEST_HOURS = 24;
