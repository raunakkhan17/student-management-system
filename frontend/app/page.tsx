import { redirect } from 'next/navigation';

/** The product has no public marketing surface — every visitor lands on sign-in,
 *  which forwards authenticated users on to their role dashboard. */
export default function RootPage() {
  redirect('/login');
}
