/**
 * Home — unified entry point.
 *
 * Renders: mixed recent list (chats + notes sorted by time)
 * and bottom quick actions for new chat / new note.
 */
import { HomeScreen } from '../../src/features/home/HomeScreen';

export default function HomeRoute() {
  return <HomeScreen />;
}
