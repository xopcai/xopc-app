/**
 * Legacy /notes list URL — redirect to the Notes tab.
 */
import { Redirect } from 'expo-router';

export default function NotesListRedirect() {
  return <Redirect href="/(tabs)/notes" />;
}
