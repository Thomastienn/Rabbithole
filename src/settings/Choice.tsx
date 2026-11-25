import { useId } from 'react';
import { Field, type FieldStatusInput } from '@astryxdesign/core/Field';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';

type Option = { value: string; label: string; disabled?: boolean };
type Props = {
    label: string;
    isLabelHidden?: boolean;
    description?: string;
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    isDisabled?: boolean;
    status?: FieldStatusInput;
    size?: 'sm' | 'md';
    width?: string;
};

// A fixed choice of five options or fewer shows as buttons; more shows as a dropdown.
export default function Choice(props: Props) {
    const id = useId();
    if (props.options.length > 5) return <Selector {...props} />;
    const { label, isLabelHidden, description, value, options, onChange, isDisabled, status } =
        props;
    return (
        <Field
            label={label}
            isLabelHidden={isLabelHidden}
            description={description}
            inputID={id}
            isGroupLabel
            descriptionID={description ? `${id}-description` : undefined}
            isDisabled={isDisabled}
            status={status}
            width={props.width}
        >
            <SegmentedControl
                id={id}
                label={label}
                value={value}
                onChange={onChange}
                isDisabled={isDisabled}
                size={props.size}
                aria-describedby={description ? `${id}-description` : undefined}
            >
                {options.map((o) => (
                    <SegmentedControlItem
                        key={o.value}
                        value={o.value}
                        label={o.label}
                        isDisabled={o.disabled}
                    />
                ))}
            </SegmentedControl>
        </Field>
    );
}
