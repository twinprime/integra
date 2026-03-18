/**
 * Derives a display name from a snake_case or camelCase-style ID by splitting
 * on underscores and title-casing each word.
 *
 * Examples:
 *   "my_service"   → "My Service"
 *   "placeOrder"   → "PlaceOrder"  (no underscore → returned as-is with first letter uppercased)
 *   "alice"        → "Alice"
 *   "user_profile" → "User Profile"
 */
export const deriveNameFromId = (id: string): string =>
    id
        .split(/_/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
