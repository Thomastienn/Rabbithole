import { CommandPalette, type CommandPaletteProps } from '@astryxdesign/core/CommandPalette';

export default function TreeSearch(
  props: Pick<CommandPaletteProps, 'isOpen' | 'onOpenChange' | 'searchSource' | 'onValueChange'>,
) {
  return (
    <CommandPalette
      {...props}
      label="Search learning trees"
      emptyBootstrapText="Type part of a learning tree’s title."
      emptySearchText="No learning tree titles match."
    />
  );
}
