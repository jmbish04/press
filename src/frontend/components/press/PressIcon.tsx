/**
 * @fileoverview Lucide-compatible icon set for Press.
 * Renders SVG icons from path data on a 24×24 viewBox.
 */
import React from "react";

const ICON_PATHS: Record<string, string[]> = {
  inbox: ["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"],
  stand: ["M3 3v18h18", "M7 14l3-3 3 2 4-5", "M7 7h.01"],
  book: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"],
  activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  search: ["m21 21-4.3-4.3", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"],
  menu: ["M4 12h16", "M4 6h16", "M4 18h16"],
  sidebar: ["M3 3h18v18H3z", "M9 3v18"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  plus: ["M12 5v14", "M5 12h14"],
  check: ["M20 6 9 17l-5-5"],
  chevron: ["m6 9 6 6 6-6"],
  chevronR: ["m9 18 6-6-6-6"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  arrowRight: ["M5 12h14", "m12 5 7 7-7 7"],
  ext: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
  play: ["M6 3l14 9-14 9z"],
  pause: ["M6 4h4v16H6z", "M14 4h4v16h-4z"],
  send: ["m22 2-7 20-4-9-9-4z", "M22 2 11 13"],
  filter: ["M22 3H2l8 9.46V19l4 2v-8.54z"],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  refresh: ["M3 12a9 9 0 0 1 15-6.7L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15 6.7L3 16", "M3 21v-5h5"],
  sparkles: ["M12 3l1.9 5.8L19.5 11l-5.6 2.2L12 19l-1.9-5.8L4.5 11l5.6-2.2z"],
  settings: ["M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  studio: ["M3 3h7v7H3z", "M14 3h7v4h-7z", "M14 11h7v10h-7z", "M3 14h7v7H3z"],
  globe: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M2 12h20", "M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"],
  layers: ["m12 2 9 5-9 5-9-5z", "m3 12 9 5 9-5", "m3 17 9 5 9-5"],
  zap: ["M13 2 3 14h9l-1 8 10-12h-9z"],
  link: ["M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5", "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  grid: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  tag: ["M20.6 12.7 12 21.4a2 2 0 0 1-2.8 0L2 14.2V2h12.2l6.4 6.3a2 2 0 0 1 0 2.8z", "M7 7h.01"],
  volume: ["M11 5L6 9H2v6h4l5 4V5z", "M19.1 4.9a10 10 0 0 1 0 14.2", "M15.5 8.5a5 5 0 0 1 0 7"],
  doc: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"],
};

interface IconProps {
  name: string;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function Icon({ name, size = 16, style, className }: IconProps) {
  const paths = ICON_PATHS[name] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
