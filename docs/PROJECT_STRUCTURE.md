# NeeDo Project Structure

```text
NeeDo
├── docs
│   ├── DATA_MODEL.md
│   ├── FRONTEND_IA.md
│   └── PROJECT_STRUCTURE.md
├── src
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   ├── components
│   │   ├── admin
│   │   │   ├── AdminLayout.tsx
│   │   │   ├── ChartPanel.tsx
│   │   │   ├── DetailGrid.tsx
│   │   │   └── ModuleShell.tsx
│   │   ├── mobile
│   │   │   ├── MobileShell.tsx
│   │   │   ├── SectionTitle.tsx
│   │   │   ├── ServiceCard.tsx
│   │   │   └── StoreCard.tsx
│   │   └── ui
│   │       ├── Badge.tsx
│   │       ├── Button.tsx
│   │       ├── DataTable.tsx
│   │       ├── Drawer.tsx
│   │       ├── FilterBar.tsx
│   │       ├── MetricCard.tsx
│   │       ├── PageHeader.tsx
│   │       └── Tabs.tsx
│   ├── data
│   │   └── mock.ts
│   ├── i18n
│   │   ├── I18nProvider.tsx
│   │   └── translations.ts
│   ├── lib
│   │   └── utils.ts
│   ├── pages
│   │   ├── admin
│   │   └── user
│   └── types
│       └── domain.ts
├── index.html
├── package.json
├── tailwind.config.ts
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## Architecture Notes

- `types/domain.ts` defines the domain contract used by pages, mock data, and future API DTO mapping.
- `data/mock.ts` keeps realistic seed data close to the front end while the backend is not yet connected.
- `components/ui` contains reusable primitives for both app and admin surfaces.
- `components/mobile` contains the mobile-first user shell and marketplace cards.
- `components/admin` contains SaaS admin layout and dense operational components.
- `pages/user` and `pages/admin` are intentionally separate so future auth guards and API scopes can diverge cleanly.
- `i18n` contains the shared language state, runtime translator, and Chinese/Japanese/English phrase dictionary.
