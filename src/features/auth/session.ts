/**
 * App-facing authentication/session surface.
 *
 * The implementation stays in `src/lib/session.ts` because it owns the
 * Next.js cookies() and iron-session plumbing. Pages, route handlers, and
 * auth regression tests import through this feature module so the product
 * authorization boundary has one public home.
 */
export {
  AuthError,
  authErrorResponse,
  getCurrentUser,
  getCurrentUserReadOnly,
  getSession,
  requireAdmin,
  requireStaffSession,
  requireSession,
} from "@/lib/session";
