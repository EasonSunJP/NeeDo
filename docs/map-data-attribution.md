# Japan administrative map data attribution

The operations live screen uses local, preprojected SVG paths generated from Japan's Ministry of Land, Infrastructure, Transport and Tourism (MLIT) National Land Numerical Information administrative-area dataset (N03).

- Source: `N03-20260101_GML.zip`
- Source page: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html
- Source version: `N03-20260101`
- Archive SHA-256: `1f714fca019e22e6f84012dba420384fc7b49c6ad8bd0a867ab1cfb593a78477`
- Extracted GeoJSON SHA-256: `3095bfbbafa89d791e19bed3488cbe31d048d227b7fea9e185aa208444337751`
- Projection: deterministic `d3.geoMercator().fitExtent(...)`
- Country view box: `0 0 1000 1200`
- Prefecture view box: `0 0 1000 800`
- Topology quantization: `1000000`
- Simplification weight: `2.5e-7`
- Country projected-path tolerance: `0.45px`
- Prefecture projected-path tolerance: `0.5px`
- Tokyo presentation: mainland/Tama uses the primary frame; Izu and Ogasawara regions use a fixed lower inset so the 23 special wards remain directly selectable.
- Japan presentation: the main islands use the primary vertical frame and Okinawa uses a fixed lower-right inset, matching the familiar Japanese administrative-map composition without changing official geometry or codes.

The 765.94 MB source archive and extracted GeoJSON remain outside Git under `.data/n03/`. Only deterministic derived assets, checksums, source metadata, and this attribution are redistributed with NeeDo. Use and redistribution must continue to follow the terms published on the MLIT source page.
