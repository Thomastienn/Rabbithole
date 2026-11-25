import type { ReactNode } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MinusIcon, PlusIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline';
import { zoomLabel } from './canvas';

export function MapToolbar({
    zoom,
    zoomOut,
    zoomIn,
    fitTree,
    children,
}: {
    zoom: number;
    zoomOut: () => void;
    zoomIn: () => void;
    fitTree: () => void;
    children: ReactNode;
}) {
    return (
        <HStack
            padding={1}
            gap={1}
            vAlign="center"
            className="map-toolbar"
            role="group"
            aria-label="Tree view controls"
        >
            <IconButton
                label="Zoom out"
                tooltip="Zoom out"
                icon={<MinusIcon />}
                variant="ghost"
                size="sm"
                onClick={zoomOut}
            />
            <Text className="sr-only">Current zoom</Text>
            <Text data-zoom="" type="supporting" hasTabularNumbers>
                {zoomLabel(zoom)}
            </Text>
            <IconButton
                label="Zoom in"
                tooltip="Zoom in"
                icon={<PlusIcon />}
                variant="ghost"
                size="sm"
                onClick={zoomIn}
            />
            <IconButton
                label="Fit tree"
                tooltip="Fit tree"
                icon={<ArrowsPointingOutIcon />}
                variant="ghost"
                size="sm"
                onClick={fitTree}
            />
            {children}
        </HStack>
    );
}
