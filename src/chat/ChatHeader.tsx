import { Fragment } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Switch } from '@astryxdesign/core/Switch';
import { DropdownMenu, DropdownMenuItem } from '@astryxdesign/core/DropdownMenu';
import {
    ArrowUturnLeftIcon,
    ChevronRightIcon,
    EllipsisHorizontalIcon,
    PencilSquareIcon,
    ViewColumnsIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { TokenStatsToggle } from './ChatDetails';
import { inkStyle } from '../map/treeList';

type Conversation = { id: string; title: string };

// One header row: back to parent, path breadcrumbs, the Board toggle, token stats, map toggle, close and overflow.
export default function ChatHeadingRow({
    parentTitle,
    ancestors,
    current,
    addresses,
    open,
    openParent,
    statsOpen,
    toggleStats,
    expanded,
    toggleExpanded,
    returnToTree,
    rename,
    board,
    toggleBoard,
}: {
    parentTitle?: string;
    ancestors: Conversation[];
    current: Conversation;
    addresses: Map<string, { address: string; ink?: number }>;
    open: (id: string) => void;
    openParent: () => void;
    statsOpen: boolean;
    toggleStats: () => void;
    expanded: boolean;
    toggleExpanded: () => void;
    returnToTree: () => void;
    rename: () => void;
    board: boolean;
    toggleBoard: () => void;
}) {
    return (
        <HStack gap={1} vAlign="center" className="chat-heading-row">
            {parentTitle && (
                <IconButton
                    label="Return to parent conversation"
                    tooltip={`Back to ${parentTitle}`}
                    icon={<ArrowUturnLeftIcon />}
                    variant="ghost"
                    size="sm"
                    onClick={openParent}
                />
            )}
            <nav className="crumbs" aria-label="Path in this learning tree">
                {ancestors.map((t) => (
                    <Fragment key={t.id}>
                        <Button
                            className="crumb"
                            label={`${addresses.get(t.id)?.address ?? ''} ${t.title}`.trim()}
                            variant="ghost"
                            size="sm"
                            onClick={() => open(t.id)}
                        >
                            <span className="addr">{addresses.get(t.id)?.address}</span> {t.title}
                        </Button>
                        <ChevronRightIcon className="crumb-sep" aria-hidden />
                    </Fragment>
                ))}
                <strong aria-current="location">
                    <span
                        className="addr address-chip"
                        style={inkStyle(addresses.get(current.id)?.ink ?? 0)}
                    >
                        {addresses.get(current.id)?.address}
                    </span>{' '}
                    {current.title}
                </strong>
            </nav>
            <Switch
                className="board-toggle"
                label="Board"
                size="sm"
                value={board}
                onChange={toggleBoard}
            />
            <TokenStatsToggle open={statsOpen} toggle={toggleStats} />
            {/* The board takes the full width with the map hidden, so there is no map to give way to. */}
            {!board && (
                <IconButton
                    className="expand-chat"
                    aria-pressed={!expanded}
                    aria-controls="learning-tree-map"
                    label={expanded ? 'Show map beside chat' : 'Expand chat'}
                    tooltip={expanded ? 'Show map beside chat' : 'Expand chat'}
                    icon={<ViewColumnsIcon />}
                    variant="ghost"
                    size="sm"
                    onClick={toggleExpanded}
                />
            )}
            <IconButton
                label="Return to tree"
                tooltip="Back to map (Esc)"
                icon={<XMarkIcon />}
                variant="ghost"
                size="sm"
                onClick={returnToTree}
            />
            <DropdownMenu
                presentation="popover"
                alignment="end"
                renderTrigger={(props) => (
                    <IconButton
                        {...props}
                        label="More conversation options"
                        tooltip="More"
                        icon={<EllipsisHorizontalIcon />}
                        variant="ghost"
                        size="sm"
                    />
                )}
            >
                <DropdownMenuItem
                    label={statsOpen ? 'Hide token stats' : 'Show token stats'}
                    onClick={toggleStats}
                />
                <DropdownMenuItem
                    label="Rename conversation"
                    icon={<PencilSquareIcon />}
                    onClick={rename}
                />
            </DropdownMenu>
        </HStack>
    );
}
