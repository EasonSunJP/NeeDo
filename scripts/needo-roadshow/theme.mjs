export const T = {
  wide: { width: 13.333, height: 7.5 },
  font: "Arial Unicode MS",
  fontFallback: "STHeiti",
  c: {
    white: "FFFFFF",
    warmWhite: "F8FBF9",
    mist: "EDF5F1",
    green: "7EA993",
    data: "5F8F78",
    dark: "2F5F4A",
    ink: "26352E",
    muted: "6F7F77",
    line: "D9E6DF",
    pale: "F2F7F4",
    orange: "D89A72",
    orangePale: "FAEEE7",
    risk: "A85D55",
    riskPale: "F7EDEB",
    yellow: "D8C783",
    blue: "7195A3",
  },
  fs: { hero: 34, title: 27, h2: 18, body: 13.5, small: 10.5, micro: 8.5, stat: 25 },
  m: { x: 0.62, top: 0.48, bottom: 0.42 },
};

export function svgData(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function organicRibbon({ color = T.c.mist, opacity = 0.9, flip = false } = {}) {
  const transform = flip ? ' transform="translate(1600 0) scale(-1 1)"' : "";
  return svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="520" viewBox="0 0 1600 520">
    <g${transform}>
      <path d="M-60 360 C240 135 390 460 690 265 C980 80 1160 345 1660 120 L1660 560 L-60 560 Z" fill="#${color}" fill-opacity="${opacity}"/>
      <path d="M-20 425 C310 220 500 485 760 320 C1030 150 1250 405 1640 245" fill="none" stroke="#${T.c.green}" stroke-opacity="0.28" stroke-width="3"/>
      <path d="M90 300 C350 165 525 355 780 205 C1060 35 1275 240 1510 138" fill="none" stroke="#FFFFFF" stroke-opacity="0.8" stroke-width="2"/>
    </g>
  </svg>`);
}

export function networkSvg() {
  const nodes = [
    [180, 220, 46], [430, 105, 35], [440, 345, 38], [720, 220, 58],
    [1000, 100, 40], [1020, 340, 42], [1320, 220, 50],
  ];
  const lines = [[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,6],[5,6]];
  return svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="480" viewBox="0 0 1500 480">
    <rect width="1500" height="480" fill="#${T.c.warmWhite}"/>
    ${lines.map(([a,b]) => `<path d="M${nodes[a][0]} ${nodes[a][1]} C${(nodes[a][0]+nodes[b][0])/2} ${nodes[a][1]}, ${(nodes[a][0]+nodes[b][0])/2} ${nodes[b][1]}, ${nodes[b][0]} ${nodes[b][1]}" stroke="#${T.c.green}" stroke-opacity=".36" stroke-width="5" fill="none"/>`).join("")}
    ${nodes.map(([x,y,r],i)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#${i===3?T.c.dark:T.c.mist}" stroke="#${T.c.data}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="${Math.max(8,r/4)}" fill="#${i===3?T.c.white:T.c.data}"/>`).join("")}
  </svg>`);
}
