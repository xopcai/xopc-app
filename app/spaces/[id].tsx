import { Redirect } from 'expo-router';

export default function SpaceRoute() {
  // Space is now represented as groupId on notes, no dedicated page
  return <Redirect href="/" />;
}
