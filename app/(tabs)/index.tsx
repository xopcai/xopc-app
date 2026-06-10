/**
 * Home tab — unified entry point.
 *
 * Renders: smart input box, quick-action chips, mixed recent list
 * (chats + notes sorted by time), and AI suggestions.
 */
import { HomeScreen } from '../../src/features/home/HomeScreen';

export default function HomeRoute() {
  return <HomeScreen />;
}
