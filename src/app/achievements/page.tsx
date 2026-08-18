import { redirect } from 'next/navigation';

/**
 * Achievements moved into Profile. Kept as a redirect rather than deleted: the
 * PWA may have this route in a saved shortcut or a bookmark, and a 404 for a
 * page that simply moved is a poor reward for having used the app.
 */
export default function AchievementsPage() {
  redirect('/profile');
}
