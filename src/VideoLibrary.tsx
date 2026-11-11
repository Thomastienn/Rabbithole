import { useEffect, useRef, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import VideoCard from './VideoCard';

// Library rows carry no conversation, discussion text or production details.
export type LibraryVideo = { id: string; title: string; description: string; duration: number | null; created: number; available?: false };

export default function VideoLibrary({ api, activity }: { api: (path: string) => Promise<LibraryVideo[]>; activity: string }) {
  const [videos, setVideos] = useState<LibraryVideo[]>();
  const [error, setError] = useState('');
  const version = useRef(0);
  async function load() {
    const current = ++version.current;
    setError('');
    try { const data = await api('/api/videos'); if (current === version.current) setVideos(data); }
    catch (e) { if (current === version.current) setError((e as Error).message); }
  }
  useEffect(() => { void load(); return () => { version.current++; }; }, [activity]);
  return <VStack padding={5} gap={5} className="knowledge-content">
    <VStack gap={2}>
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap"><Heading level={1}>Videos</Heading><Button label="Refresh Videos" variant="ghost" size="sm" onClick={() => void load()} /></HStack>
      <Text color="secondary">Every saved video from your learning trees. Videos stay here after you delete the conversation they came from.</Text>
      {error && <Text role="alert">{error}</Text>}
      {!videos && !error && <Text role="status">Loading videos…</Text>}
      {videos && !videos.length && <Text color="secondary">No saved videos yet. Ask the tutor for a video in any conversation.</Text>}
    </VStack>
    {!!videos?.length && <section className="video-library" aria-label="Saved videos">
      {videos.map(v => <VideoCard key={v.id} artifact={{ ...v, status: 'ready', conversation: '' }} media={`/api/videos/${v.id}/media`} />)}
    </section>}
  </VStack>;
}
