import { type CSSProperties, type ReactNode } from "react";
import { useClientTheme, type ClientTheme } from "../../theme/ClientThemeProvider";
import { cn } from "../../lib/utils";

interface CategoryIconProps {
  id: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

type CategoryPalette = {
  badgeBg: string;
  badgeBorder: string;
  badgeShadow: string;
  primary: string;
  primaryDark: string;
  secondary: string;
  secondaryDark: string;
  surface: string;
  surfaceShade: string;
  outline: string;
  shadow: string;
  glow: string;
};

const sizes = {
  sm: "h-11 w-11",
  md: "h-14 w-14",
  lg: "h-16 w-16"
};

const lightGreenPalette: CategoryPalette = {
  badgeBg: "radial-gradient(circle at 30% 24%, #ffffff 0%, #eef7f5 42%, #dbece8 100%)",
  badgeBorder: "rgba(60, 136, 126, 0.18)",
  badgeShadow: "0 10px 20px rgba(60, 136, 126, 0.2), inset 0 1px 0 rgba(255,255,255,0.82)",
  primary: "#3c887e",
  primaryDark: "#275f57",
  secondary: "#75b2a9",
  secondaryDark: "#4f978d",
  surface: "#ffffff",
  surfaceShade: "#d7e9e5",
  outline: "#1f5b51",
  shadow: "rgba(24, 68, 61, 0.18)",
  glow: "rgba(117, 178, 169, 0.4)"
};

const darkGreenPalette: CategoryPalette = {
  badgeBg: "radial-gradient(circle at 30% 24%, #19301e 0%, #0f1c17 58%, #07100d 100%)",
  badgeBorder: "rgba(186, 255, 67, 0.28)",
  badgeShadow: "0 12px 22px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(220, 255, 134, 0.16)",
  primary: "#baff43",
  primaryDark: "#75a927",
  secondary: "#72ff8b",
  secondaryDark: "#43b864",
  surface: "#f3ffd8",
  surfaceShade: "#23391f",
  outline: "#dcff86",
  shadow: "rgba(0, 0, 0, 0.32)",
  glow: "rgba(186, 255, 67, 0.3)"
};

const blackGoldPalette: CategoryPalette = {
  badgeBg: "radial-gradient(circle at 30% 24%, #2f291e 0%, #1c1712 56%, #100d09 100%)",
  badgeBorder: "rgba(232, 196, 108, 0.26)",
  badgeShadow: "0 12px 22px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(255, 239, 188, 0.16)",
  primary: "#e8c46c",
  primaryDark: "#b8892d",
  secondary: "#f4d78d",
  secondaryDark: "#c8993e",
  surface: "#fff7df",
  surfaceShade: "#4d3c1d",
  outline: "#5e4313",
  shadow: "rgba(0, 0, 0, 0.32)",
  glow: "rgba(243, 212, 127, 0.28)"
};

const vitalMonoPalette: CategoryPalette = {
  badgeBg: "radial-gradient(circle at 30% 24%, #ffffff 0%, #f0f5f8 46%, #e1e9ee 100%)",
  badgeBorder: "rgba(8, 123, 184, 0.18)",
  badgeShadow: "0 10px 20px rgba(20, 184, 255, 0.16), inset 0 1px 0 rgba(255,255,255,0.88)",
  primary: "#087bb8",
  primaryDark: "#075e8c",
  secondary: "#14b8ff",
  secondaryDark: "#0b8cc7",
  surface: "#ffffff",
  surfaceShade: "#d7e8f2",
  outline: "#0b5f8a",
  shadow: "rgba(20, 21, 23, 0.14)",
  glow: "rgba(20, 184, 255, 0.32)"
};

const coolBlackGrayPalette: CategoryPalette = {
  badgeBg: "radial-gradient(circle at 30% 24%, #203038 0%, #131b20 58%, #080d10 100%)",
  badgeBorder: "rgba(110, 234, 255, 0.24)",
  badgeShadow: "0 12px 22px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(121, 240, 255, 0.16)",
  primary: "#18d2f0",
  primaryDark: "#0d8fb4",
  secondary: "#79f0ff",
  secondaryDark: "#19a9c6",
  surface: "#f3f8fb",
  surfaceShade: "#1c3a43",
  outline: "#6eeaff",
  shadow: "rgba(0, 0, 0, 0.32)",
  glow: "rgba(24, 210, 240, 0.28)"
};

const specialBlackPalette: CategoryPalette = {
  badgeBg: "radial-gradient(circle at 30% 24%, #263858 0%, #121a2a 58%, #070b13 100%)",
  badgeBorder: "rgba(119, 146, 205, 0.24)",
  badgeShadow: "0 12px 24px rgba(0, 0, 0, 0.52), 0 0 20px rgba(95, 141, 255, 0.12), inset 0 1px 0 rgba(157, 183, 255, 0.14)",
  primary: "#5f8dff",
  primaryDark: "#2d5ed8",
  secondary: "#ff4e9a",
  secondaryDark: "#b9326d",
  surface: "#f7f9ff",
  surfaceShade: "#223150",
  outline: "#9db7ff",
  shadow: "rgba(0, 0, 0, 0.34)",
  glow: "rgba(95, 141, 255, 0.3)"
};

const neonPinkPalette: CategoryPalette = {
  badgeBg: "radial-gradient(circle at 30% 24%, #33245d 0%, #1e1b42 56%, #0d0f22 100%)",
  badgeBorder: "rgba(199, 177, 255, 0.24)",
  badgeShadow: "0 12px 22px rgba(2, 4, 16, 0.5), inset 0 1px 0 rgba(255, 219, 248, 0.16)",
  primary: "#c7b1ff",
  primaryDark: "#8a75ff",
  secondary: "#ff6fae",
  secondaryDark: "#c85289",
  surface: "#fff0fb",
  surfaceShade: "#33245d",
  outline: "#f0d9ff",
  shadow: "rgba(0, 0, 0, 0.3)",
  glow: "rgba(255, 111, 174, 0.28)"
};

const categoryPalettes: Record<ClientTheme, CategoryPalette> = {
  "light-green": lightGreenPalette,
  "dark-green": darkGreenPalette,
  "black-gold": blackGoldPalette,
  "vital-mono": vitalMonoPalette,
  "cool-black-gray": coolBlackGrayPalette,
  "special-black": specialBlackPalette,
  "neon-pink": neonPinkPalette
};

function IconSvg({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <svg aria-hidden={!label} aria-label={label} className="h-[74%] w-[74%] overflow-visible" fill="none" viewBox="0 0 32 32">
      {children}
    </svg>
  );
}

function GroundShadow({ palette, x = 16, y = 25.5, rx = 8.5, ry = 2.4 }: { palette: CategoryPalette; x?: number; y?: number; rx?: number; ry?: number }) {
  return <ellipse cx={x} cy={y} fill={palette.shadow} opacity="0.55" rx={rx} ry={ry} />;
}

function Outline({ children, palette, width = 1.6 }: { children: ReactNode; palette: CategoryPalette; width?: number }) {
  return (
    <g fill="none" stroke={palette.outline} strokeLinecap="round" strokeLinejoin="round" strokeWidth={width}>
      {children}
    </g>
  );
}

function renderIcon(id: string, palette: CategoryPalette) {
  switch (id) {
    case "cleaning":
      return (
        <>
          <GroundShadow palette={palette} rx={7.5} />
          <path d="M12 10h6v3l2 2V23a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8l2-2v-3Z" fill={palette.primaryDark} transform="translate(0 1.1)" />
          <path d="M12 9h6v3l2 2V22a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8l2-2V9Z" fill={palette.primary} />
          <path d="M16 9h4.8a1.3 1.3 0 0 1 1.3 1.3V12H18V10.6a1.6 1.6 0 0 0-1.6-1.6H16Z" fill={palette.surface} />
          <circle cx="21.8" cy="9.8" fill={palette.secondary} r="1.6" />
          <path d="m23.7 7.6.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5.5-1.2Z" fill={palette.surface} />
          <Outline palette={palette}>
            <path d="M14.5 13.5h3M14 18h4M14.5 21.5h3" />
          </Outline>
        </>
      );
    case "repair":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="m11 22.5 8-8 2.6 2.6-8 8H11v-2.6Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="m11 21.5 8-8 2.6 2.6-8 8H11v-2.6Z" fill={palette.primary} />
          <path d="M19.4 10.2a4.6 4.6 0 0 0 3.7 1.3l2-2a4.8 4.8 0 0 1-5.9 5.9l-8.1 8.1-3.2-.8-.8-3.2 8.1-8.1a4.8 4.8 0 0 1 5.9-5.9l-2 2a4.6 4.6 0 0 0 1.3 3.7Z" fill={palette.surface} />
          <Outline palette={palette}>
            <path d="m12 18.8 1.9 1.9" />
          </Outline>
        </>
      );
    case "massage":
      return (
        <>
          <GroundShadow palette={palette} rx={8} />
          <ellipse cx="12.5" cy="18.5" fill={palette.primaryDark} rx="6.8" ry="3.6" transform="translate(0 1)" />
          <ellipse cx="12.5" cy="17.6" fill={palette.primary} rx="6.8" ry="3.6" />
          <ellipse cx="19.8" cy="14.2" fill={palette.surfaceShade} rx="4.2" ry="2.8" transform="translate(0 1)" />
          <ellipse cx="19.8" cy="13.3" fill={palette.surface} rx="4.2" ry="2.8" />
          <path d="M18 8.5c2.9.2 5 1.8 6 4.6-2.8.7-5.3-.2-7.2-2.3-.6-.7-.6-1.8 0-2.3.4-.3.7-.4 1.2-.4Z" fill={palette.secondary} />
          <Outline palette={palette}>
            <path d="M9.7 17.6c1.5-1.3 3.5-1.8 5.7-1.4" />
          </Outline>
        </>
      );
    case "laundry":
      return (
        <>
          <GroundShadow palette={palette} />
          <rect fill={palette.primaryDark} height="17" rx="4" transform="translate(0 1)" width="18" x="7" y="7" />
          <rect fill={palette.surface} height="17" rx="4" width="18" x="7" y="6" />
          <rect fill={palette.secondary} height="4" rx="2" width="12" x="10" y="8.2" />
          <circle cx="16" cy="18.2" fill={palette.primary} r="5.5" />
          <circle cx="16" cy="18.2" fill={palette.surface} r="3.3" />
          <circle cx="20.6" cy="9.9" fill={palette.primaryDark} r="1" />
        </>
      );
    case "moving":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="M9 10.5h14v11H9z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="M9 9.5h14v11H9z" fill={palette.primary} />
          <path d="m9 9.5 5.2-3h12.6l-3.8 3H9Z" fill={palette.secondary} />
          <path d="m17 9.5 4-3.1" stroke={palette.surface} strokeLinecap="round" strokeWidth="1.6" />
          <rect fill={palette.surface} height="4.5" rx="1.1" width="2.7" x="14.6" y="14.3" />
        </>
      );
    case "appliance":
      return (
        <>
          <GroundShadow palette={palette} />
          <rect fill={palette.primaryDark} height="10" rx="3.2" transform="translate(0 1)" width="20" x="6" y="10" />
          <rect fill={palette.surface} height="10" rx="3.2" width="20" x="6" y="9" />
          <rect fill={palette.secondary} height="2.2" rx="1.1" width="14" x="9" y="11.2" />
          <path d="M10 17.2c1.5 1.2 3 1.2 4.5 0M14.5 17.2c1.5 1.2 3 1.2 4.5 0M19 17.2c1.5 1.2 3 1.2 4.5 0" stroke={palette.primary} strokeLinecap="round" strokeWidth="1.7" />
          <circle cx="23" cy="12.2" fill={palette.primaryDark} r="0.9" />
        </>
      );
    case "install":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="m11 22 10-10 2.4 2.4-10 10H11V22Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="m11 21 10-10 2.4 2.4-10 10H11V21Z" fill={palette.primary} />
          <path d="m18.8 7 2.2-2.2 6.2 6.2-2.2 2.2Z" fill={palette.surface} />
          <rect fill={palette.secondary} height="8.2" rx="2" transform="rotate(-45 8.7 14.8)" width="4.4" x="6.5" y="10.7" />
          <Outline palette={palette}>
            <path d="m8 15 2 2" />
          </Outline>
        </>
      );
    case "beauty":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="M11 10h7v5.2l1.8 7.3H9.2l1.8-7.3V10Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="M11 9h7v5.2l1.8 7.3H9.2l1.8-7.3V9Z" fill={palette.primary} />
          <rect fill={palette.surface} height="3.5" rx="1.2" width="4.2" x="12.4" y="10.1" />
          <path d="M20.5 8.5c1.8.1 3 1.4 3 3.2s-1.2 3.2-3 3.2c-1.8 0-3-1.4-3-3.2s1.2-3.1 3-3.2Z" fill={palette.secondary} />
          <path d="M20.5 9.4c.8 1 1.3 1.8 1.3 2.4 0 .9-.6 1.7-1.3 2.3-.8-.6-1.3-1.4-1.3-2.3 0-.6.5-1.4 1.3-2.4Z" fill={palette.surface} />
        </>
      );
    case "nanny":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="M11 14.4h8.8c2.8 0 5.2 2.3 5.2 5.2V22H11v-7.6Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="M11 13.4h8.8c2.8 0 5.2 2.3 5.2 5.2V21H11v-7.6Z" fill={palette.primary} />
          <path d="M11 13.4 15.5 9c2.8 0 5 2.2 5 5v.4H11Z" fill={palette.surface} />
          <circle cx="14.4" cy="23.2" fill={palette.surface} r="2.2" />
          <circle cx="22.3" cy="23.2" fill={palette.surface} r="2.2" />
        </>
      );
    case "care":
      return (
        <>
          <GroundShadow palette={palette} rx={8} />
          <path d="M16 25c6-3.4 9-6.6 9-10.4 0-2.8-2-5.2-4.7-5.2-1.8 0-3.3.9-4.3 2.5-1-1.6-2.5-2.5-4.3-2.5-2.7 0-4.7 2.4-4.7 5.2C7 18.4 10 21.6 16 25Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="M16 24c6-3.4 9-6.6 9-10.4 0-2.8-2-5.2-4.7-5.2-1.8 0-3.3.9-4.3 2.5-1-1.6-2.5-2.5-4.3-2.5-2.7 0-4.7 2.4-4.7 5.2C7 17.4 10 20.6 16 24Z" fill={palette.primary} />
          <rect fill={palette.surface} height="8" rx="1.2" width="2.4" x="14.8" y="12" />
          <rect fill={palette.surface} height="2.4" rx="1.2" width="8" x="12" y="14.8" />
        </>
      );
    case "deep":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="M10 14h12l-1.8 8.2H11.8L10 14Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="M10 13h12l-1.8 8.2H11.8L10 13Z" fill={palette.primary} />
          <path d="M12 13V10.5A4 4 0 0 1 16 7h0a4 4 0 0 1 4 3.5V13" stroke={palette.surface} strokeLinecap="round" strokeWidth="2" />
          <circle cx="10.2" cy="10.6" fill={palette.surface} r="1.3" />
          <circle cx="8" cy="8.9" fill={palette.secondary} r="1" />
          <circle cx="22.8" cy="9.5" fill={palette.surface} r="1.1" />
        </>
      );
    case "storage":
      return (
        <>
          <GroundShadow palette={palette} />
          <rect fill={palette.primaryDark} height="4.2" rx="1.8" transform="translate(0 1)" width="16" x="8" y="10" />
          <rect fill={palette.secondaryDark} height="4.2" rx="1.8" transform="translate(0 1)" width="14" x="9" y="15.2" />
          <rect fill={palette.surfaceShade} height="4.2" rx="1.8" transform="translate(0 1)" width="12" x="10" y="20.4" />
          <rect fill={palette.primary} height="4.2" rx="1.8" width="16" x="8" y="9" />
          <rect fill={palette.secondary} height="4.2" rx="1.8" width="14" x="9" y="14.2" />
          <rect fill={palette.surface} height="4.2" rx="1.8" width="12" x="10" y="19.4" />
          <circle cx="16" cy="11.1" fill={palette.surface} r="0.8" />
          <circle cx="16" cy="16.3" fill={palette.primaryDark} r="0.8" />
          <circle cx="16" cy="21.5" fill={palette.primaryDark} r="0.8" />
        </>
      );
    case "homecare":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="m7.8 14.2 8.2-6.4 8.2 6.4V24H7.8v-9.8Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="m7.8 13.2 8.2-6.4 8.2 6.4V23H7.8v-9.8Z" fill={palette.primary} />
          <path d="M11.6 16.6h8.8V23h-8.8v-6.4Z" fill={palette.surface} />
          <path d="m23 8.3.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5.5-1.1Z" fill={palette.surface} />
        </>
      );
    case "recycle":
      return (
        <>
          <GroundShadow palette={palette} />
          <circle cx="16" cy="16.2" fill={palette.primaryDark} r="9" transform="translate(0 1)" />
          <circle cx="16" cy="15.2" fill={palette.primary} r="9" />
          <Outline palette={palette} width={1.9}>
            <path d="m15 9.8 3.1 1.8-1 1.7" />
            <path d="M21 14.2v3.5h-2" />
            <path d="m17 21-3.1-1.8 1-1.7" />
            <path d="M11 17.2V13.7h2" />
            <path d="m11.2 13.2 3.6-3.4M20.8 17.2 17.2 21" />
          </Outline>
        </>
      );
    case "pet":
      return (
        <>
          <GroundShadow palette={palette} />
          <circle cx="11" cy="11.2" fill={palette.secondary} r="2.6" />
          <circle cx="21" cy="11.2" fill={palette.secondary} r="2.6" />
          <circle cx="10" cy="19.1" fill={palette.secondary} r="2.3" />
          <circle cx="22" cy="19.1" fill={palette.secondary} r="2.3" />
          <path d="M16 23.8c4 0 6.5-2.4 6.5-5.4 0-2.8-2.4-5.1-6.5-5.1s-6.5 2.3-6.5 5.1c0 3 2.5 5.4 6.5 5.4Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="M16 22.8c4 0 6.5-2.4 6.5-5.4 0-2.8-2.4-5.1-6.5-5.1s-6.5 2.3-6.5 5.1c0 3 2.5 5.4 6.5 5.4Z" fill={palette.primary} />
        </>
      );
    case "guide":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="M8 10.2 14.8 7l8.6 2.8v11.7L16.6 19l-8.6 2.8V10.2Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="M8 9.2 14.8 6l8.6 2.8v11.7L16.6 18l-8.6 2.8V9.2Z" fill={palette.surface} />
          <path d="M14.8 6v12M23.4 8.8V20.5" stroke={palette.surfaceShade} strokeLinecap="round" strokeWidth="1.4" />
          <path d="M18.8 15.6c2.2-1.4 3.3-3.1 3.3-5.2 0-1.9-1.4-3.3-3.3-3.3s-3.3 1.4-3.3 3.3c0 2.1 1.1 3.8 3.3 5.2Z" fill={palette.primary} />
          <circle cx="18.8" cy="10.4" fill={palette.surface} r="1.4" />
        </>
      );
    case "property":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="M8 12.8 16 6.8l8 6V24H8V12.8Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="M8 11.8 16 5.8l8 6V23H8V11.8Z" fill={palette.primary} />
          <rect fill={palette.surface} height="9" rx="1.2" width="8.5" x="11.8" y="13.6" />
          <path d="M20.6 9.2h2.6l1.2 1.2-1.2 1.2h-2.6V9.2Z" fill={palette.secondary} />
          <circle cx="19.7" cy="10.4" fill={palette.primaryDark} r="0.9" />
        </>
      );
    case "tutor":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="M8 10c2.5-1.3 5-1.3 7.5 0v12.6c-2.5-1.3-5-1.3-7.5 0V10Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="M16.5 10c2.5-1.3 5-1.3 7.5 0v12.6c-2.5-1.3-5-1.3-7.5 0V10Z" fill={palette.secondaryDark} transform="translate(0 1)" />
          <path d="M8 9c2.5-1.3 5-1.3 7.5 0v12.6c-2.5-1.3-5-1.3-7.5 0V9Z" fill={palette.surface} />
          <path d="M16.5 9c2.5-1.3 5-1.3 7.5 0v12.6c-2.5-1.3-5-1.3-7.5 0V9Z" fill={palette.primary} />
          <path d="M15.8 9.4v12" stroke={palette.outline} strokeLinecap="round" strokeWidth="1.5" />
          <circle cx="22.2" cy="11.6" fill={palette.surface} r="1" />
        </>
      );
    case "sports":
      return (
        <>
          <GroundShadow palette={palette} />
          <rect fill={palette.primaryDark} height="5.5" rx="2" transform="translate(0 1)" width="3.4" x="6" y="13.5" />
          <rect fill={palette.primaryDark} height="5.5" rx="2" transform="translate(0 1)" width="3.4" x="22.6" y="13.5" />
          <rect fill={palette.primaryDark} height="3.6" rx="1.6" transform="translate(0 1)" width="13.2" x="9.4" y="14.4" />
          <rect fill={palette.primary} height="5.5" rx="2" width="3.4" x="6" y="12.5" />
          <rect fill={palette.secondary} height="5.5" rx="2" width="3.4" x="22.6" y="12.5" />
          <rect fill={palette.surface} height="3.6" rx="1.6" width="13.2" x="9.4" y="13.4" />
        </>
      );
    case "legal":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="M16 7.5V24" stroke={palette.primaryDark} strokeLinecap="round" strokeWidth="2.1" />
          <path d="M10.5 10.5h11" stroke={palette.primaryDark} strokeLinecap="round" strokeWidth="2.1" />
          <path d="m10.5 10.5-3.2 5.2h6.4l-3.2-5.2ZM21.5 10.5l-3.2 5.2h6.4l-3.2-5.2Z" fill={palette.primary} />
          <path d="M11.8 24h8.4" stroke={palette.surface} strokeLinecap="round" strokeWidth="2.2" />
        </>
      );
    case "renovation":
      return (
        <>
          <GroundShadow palette={palette} />
          <rect fill={palette.primaryDark} height="6.3" rx="2.4" transform="translate(0 1)" width="10.6" x="8" y="10.5" />
          <rect fill={palette.primary} height="6.3" rx="2.4" width="10.6" x="8" y="9.5" />
          <path d="M18.6 11.4h4.8A2.6 2.6 0 0 1 26 14v1.2h-7.4v-3.8Z" fill={palette.surface} />
          <path d="M24.6 14.6v7.8" stroke={palette.secondary} strokeLinecap="round" strokeWidth="2.3" />
          <path d="m24.6 22.4-2.5 2.2" stroke={palette.outline} strokeLinecap="round" strokeWidth="2" />
        </>
      );
    case "business":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="M9 11.5h14v10.4a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V11.5Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="M9 10.5h14v10.4a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V10.5Z" fill={palette.primary} />
          <path d="M12.2 10.5V9a2.2 2.2 0 0 1 2.2-2.2h3.2A2.2 2.2 0 0 1 19.8 9v1.5" stroke={palette.surface} strokeLinecap="round" strokeWidth="2" />
          <rect fill={palette.surface} height="2.8" rx="1.4" width="5.4" x="13.3" y="14" />
        </>
      );
    case "other":
      return (
        <>
          <GroundShadow palette={palette} />
          <rect fill={palette.primary} height="6.2" rx="2.1" width="6.2" x="7" y="8" />
          <rect fill={palette.secondary} height="6.2" rx="2.1" width="6.2" x="18.8" y="8" />
          <rect fill={palette.surface} height="6.2" rx="2.1" width="6.2" x="7" y="19.8" />
          <circle cx="21.9" cy="22.9" fill={palette.primaryDark} r="3.1" />
          <path d="M21.9 20.8v4.2M19.8 22.9H24" stroke={palette.surface} strokeLinecap="round" strokeWidth="1.8" />
        </>
      );
    case "dining":
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="M10 8.5v7.2M12.8 8.5v7.2M11.4 15.7V24" stroke={palette.primary} strokeLinecap="round" strokeWidth="2" />
          <path d="M21.5 8.5v15.5" stroke={palette.secondary} strokeLinecap="round" strokeWidth="2.2" />
          <path d="M18.2 8.5c0 2.8 1.1 5 3.3 6.5" stroke={palette.surface} strokeLinecap="round" strokeWidth="1.9" />
          <ellipse cx="16" cy="24.4" fill={palette.surface} rx="8" ry="1.6" />
        </>
      );
    default:
      return (
        <>
          <GroundShadow palette={palette} />
          <path d="m8 13 8-6 8 6V24H8V13Z" fill={palette.primaryDark} transform="translate(0 1)" />
          <path d="m8 12 8-6 8 6V23H8V12Z" fill={palette.primary} />
          <rect fill={palette.surface} height="8" rx="1.2" width="7" x="12.5" y="15" />
        </>
      );
  }
}

export function CategoryIcon({ id, label, size = "md", className }: CategoryIconProps) {
  const { theme } = useClientTheme();
  const palette = categoryPalettes[theme];
  const style = {
    "--category-icon-bg": palette.badgeBg,
    "--category-icon-border": palette.badgeBorder,
    "--category-icon-shadow": palette.badgeShadow,
    "--category-icon-fg": palette.primary
  } as CSSProperties;

  return (
    <span className={cn("category-icon grid place-items-center rounded-full", sizes[size], className)} style={style}>
      <IconSvg label={label}>{renderIcon(id, palette)}</IconSvg>
    </span>
  );
}
