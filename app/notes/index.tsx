/**
 * Legacy /notes list URL — redirect to home.
 */
import { Redirect } from 'expo-router';

export default function NotesListRedirect() {
  return <Redirect href="/(tabs)" />;
}
