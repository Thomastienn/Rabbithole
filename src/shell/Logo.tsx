// The brand mark as a line diagram (mockup line-diagram): the trunk station and two lines leaving it.
export function Logo() {
    return (
        <svg viewBox="0 0 26 26" width={26} height={26} aria-hidden="true" style={{ flex: 'none' }}>
            <path
                d="M5 13H12L18 7H22M12 13L18 19H22"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ fill: 'none', stroke: 'var(--rabbithole-paper)' }}
            />
            <circle
                cx="5"
                cy="13"
                r="3.4"
                strokeWidth="2.5"
                style={{ fill: 'var(--rabbithole-band)', stroke: 'var(--rabbithole-paper)' }}
            />
        </svg>
    );
}
