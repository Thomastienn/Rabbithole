// Series inks in order: amber, lichen, rust, leaf via the theme's hue slots.
export const DIAGRAM_HUES = ['yellow', 'blue', 'pink', 'green'];

export function diagramTheme(
    style: Pick<
        CSSStyleDeclaration,
        'backgroundColor' | 'color' | 'fontSize' | 'borderColor' | 'fontFamily'
    >,
    series: string[],
    dark: boolean,
) {
    // Series fills carry surface-coloured labels; series inks are light in dark and dark in light.
    const seriesVariables = Object.fromEntries(
        series.flatMap((color, i) => [
            [`cScale${i}`, color],
            [`cScaleLabel${i}`, style.backgroundColor],
            [`pie${i + 1}`, color],
            [`git${i}`, color],
            [`gitBranchLabel${i}`, style.backgroundColor],
        ]),
    );
    return {
        darkMode: dark,
        background: style.backgroundColor,
        fontSize: style.fontSize,
        primaryColor: style.backgroundColor,
        secondaryColor: style.backgroundColor,
        tertiaryColor: style.backgroundColor,
        primaryTextColor: style.color,
        secondaryTextColor: style.color,
        tertiaryTextColor: style.color,
        textColor: style.color,
        lineColor: style.color,
        primaryBorderColor: style.borderColor,
        secondaryBorderColor: style.borderColor,
        tertiaryBorderColor: style.borderColor,
        fontFamily: style.fontFamily,
        edgeLabelBackground: style.backgroundColor,
        labelBackground: style.backgroundColor,
        pieSectionTextColor: style.backgroundColor,
        pieStrokeColor: style.backgroundColor,
        pieOuterStrokeColor: style.borderColor,
        pieTitleTextColor: style.color,
        pieLegendTextColor: style.color,
        pieOpacity: '1',
        ...seriesVariables,
        xyChart: { plotColorPalette: series.join(',') },
    };
}
