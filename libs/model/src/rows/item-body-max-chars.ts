// The most characters an item body holds. The wire limit of one fact stays above it with room for
// the other fields, and the owner door checks the fact itself.
export const itemBodyMaxChars = 40_000;
