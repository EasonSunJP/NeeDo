# NeeDo Core Data Model

The first implementation keeps the domain model in TypeScript so the UI can be built with realistic contracts before the backend is connected. The same entities can map directly to Prisma models later.

## Identity And Access

- `User`: login identity, contact details, role, avatar.
- `Role`: platform admin, operations, finance, support, merchant admin, store manager, technician.
- `Permission`: per-module controls for menu, view, edit, export, approve, refund, settlement.

## Customer Side

- `Customer`: member level, tags, LTV, order count, last consume time, next booking, active score, churn risk.
- `Address`: customer address, city, area, map coordinates, default flag.
- `Review`: rating, tone, content, target, reply state.

## Supply Side

- `Merchant`: merchant profile, status, categories, city, commission rate, settlement cycle, uploaded documents.
- `Store`: branch profile, address, rating, review count, price label, tags, business hours, images, booking slot.
- `Staff`: base employee profile, store, status, rating, order count, income.
- `Technician`: service skills, service areas, acceptance/cancel rate, language ability, avatar.

## Services And Fulfillment

- `ServiceCategory`: category name, icon, mode, hot flag.
- `ServiceItem`: service profile, mode, price, rating, sales, summary, tags, fastest arrival, service areas, technician count, packages, flow, notice.
- `ServicePackage`: price, duration, description, included items.
- `Schedule`: staff calendar slot and linked order.
- `Order`: home/store fulfillment order, customer, provider, amount, payment state, booking time, source, remark.
- `OrderTimeline`: status changes and operation logs.
- `FieldJob`: on-site work order, address, time, technician, quote, phone, exception.

## Commerce

- `Coupon`: coupon type, face value, issued, claimed, redeemed, GMV.
- `Campaign`: campaign channel, ROI, attribution, status.
- `Payment`: channel, amount, fee, paid time.
- `Refund`: order, amount, reason, approval/payment state.
- `Settlement`: merchant period, gross amount, platform fee, refund amount, payable amount, status.

## Operations

- `InventoryItem`: store, name, category, stock, warning line, unit, last changed time.
- `InventoryLog`: purchase, transfer, inbound, outbound, consume records.
- `City`: city/prefecture and operational supply counts.
- `Area`: city area and delivery time estimate.

## Next Backend Step

Recommended backend shape:

- Next.js API routes or NestJS modules.
- PostgreSQL with Prisma.
- Use `merchantId`, `storeId`, `customerId`, `staffId`, `orderId`, `serviceItemId` foreign keys.
- Add audit tables for order timeline, settlement approval, refund approval, merchant onboarding review, inventory log and role permission changes.
