import { Redirect, useLocalSearchParams } from 'expo-router';

export default function NoteDetailRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/items/${id}`} />;
}
