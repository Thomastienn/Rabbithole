import { CommandPalette, type CommandPaletteProps } from '@astryxdesign/core/CommandPalette';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import type { SearchResult } from './treeSearchSource';

// The snippet with its match ranges marked.
function marked({ snippet, ranges }: SearchResult) {
    const parts = [];
    let at = 0;
    for (const [start, end] of ranges) {
        parts.push(snippet.slice(at, start), <mark key={start}>{snippet.slice(start, end)}</mark>);
        at = end;
    }
    parts.push(snippet.slice(at));
    return parts;
}

export default function TreeSearch(
    props: Pick<CommandPaletteProps, 'isOpen' | 'onOpenChange' | 'searchSource' | 'onValueChange'>,
) {
    return (
        <CommandPalette
            {...props}
            label="Search conversations"
            emptyBootstrapText="Type words from any conversation."
            emptySearchText="No conversations match."
            renderItem={(item) => {
                const result = item.auxiliaryData as SearchResult;
                return (
                    <VStack gap={0}>
                        <Text weight="semibold">
                            {result.address} {result.title}
                        </Text>
                        <Text color="secondary">{marked(result)}</Text>
                    </VStack>
                );
            }}
        />
    );
}
