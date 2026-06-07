/**
 * Normalize user input for security question answers.
 *
 * The rules are:
 *   - Lowercase (e.g. "Firulais" → "firulais")
 *   - Strip accents (e.g. "María" → "maria")
 *   - Convert ñ → n
 *   - Strip everything except a-z, 0-9, and spaces
 *   - Collapse multiple spaces
 *   - Trim
 *
 * Used both for:
 *   1. The "Otra respuesta" input in the registration flow
 *   2. The recovery input (so answers match even with case
 *      differences, accents, typos with symbols, etc.)
 *
 * Examples:
 *   normalizeAnswer("Firulaís")              => "firulais"
 *   normalizeAnswer("Juan_Pérez")            => "juan perez"
 *   normalizeAnswer("  María  José  ")       => "maria jose"
 *   normalizeAnswer("  espacios   múltiples") => "espacios multiples"
 */
export function normalizeAnswer(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics (á→a, é→e, etc.)
    .replace(/ñ/g, 'n')                // ñ is not in the combining diacritics range
    .replace(/[^a-z0-9\s]/g, '')       // strip everything except a-z 0-9 space
    .replace(/\s+/g, ' ')              // collapse multiple spaces
    .trim()
}
