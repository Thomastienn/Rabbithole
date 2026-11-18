import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';

// Shown after adding a custom endpoint while web search is unavailable; accepting queues SearXNG in Downloads.
export default function SearchOffer({
  api,
  close,
  done,
  failed,
}: {
  api: (path: string, body?: unknown) => Promise<unknown>;
  close: () => void;
  done: (message: string) => void;
  failed: (error: string) => void;
}) {
  return (
    <VStack gap={2} as="section" aria-label="Web search" className="endpoint-search-offer">
      <Text type="supporting" color="secondary">
        Most endpoints cannot search the web. Download web search (SearXNG) so the tutor can search
        with any model.
      </Text>
      <HStack gap={2}>
        <Button
          label="Download web search"
          size="sm"
          onClick={async () => {
            close();
            try {
              await api('/api/downloads/searxng', {});
              done('Web search is downloading. Follow it in Downloads.');
            } catch (e) {
              failed((e as Error).message);
            }
          }}
        />
        <Button label="Not now" variant="ghost" size="sm" onClick={close} />
      </HStack>
    </VStack>
  );
}
