// The part of react-icons' IconBase this plugin uses (size, color, title and
// SVG props). Icon data below comes unchanged from react-icons 5.4.0.
import { createElement } from 'react';
import type { ReactElement, SVGAttributes } from 'react';

export interface IconTree {
  tag: string;
  attr: Record<string, string>;
  child: IconTree[];
}

export interface IconBaseProps extends SVGAttributes<SVGElement> {
  size?: string | number;
  color?: string;
  title?: string;
}

export type IconType = (props: IconBaseProps) => ReactElement;

const render = (nodes: IconTree[]): ReactElement[] => nodes.map(({ tag, attr, child }, index) => (
  createElement(tag, { key: index, ...attr }, ...render(child))
));

export const GenIcon = (data: IconTree): IconType => ({ size, color, title, style, children, ...props }) => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" {...data.attr} {...props}
    style={{ color, ...style }} height={size ?? '1em'} width={size ?? '1em'} xmlns="http://www.w3.org/2000/svg">
    {title && <title>{title}</title>}
    {render(data.child)}
    {children}
  </svg>
);
