/**
 * lib/version.ts — Application Version (Single Source of Truth)
 *
 * This is the ONLY place in the entire codebase where the version number
 * is defined. Every page and component that displays a version footer
 * imports this constant — never hard-codes a version string directly.
 *
 * HOW TO BUMP THE VERSION:
 * ─────────────────────────
 * 1. Change the string below to the new version (e.g. "1.08").
 * 2. All pages and FooterCopyright will reflect it automatically.
 * 3. After committing, create a matching git tag:
 *      git tag v1.08 && git push origin main --tags
 * 4. Update HANDOFF.md version history table.
 *
 * FORMAT: major.minor (e.g. "1.07")
 * — major: significant new feature set or breaking change
 * — minor: incremental features, fixes
 */

const APP_VERSION = "1.12"

export default APP_VERSION
