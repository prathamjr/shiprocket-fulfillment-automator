# Orders that need two warehouses

The automator never books these. One Shiprocket booking means one pickup address for the whole order, so booking it
would send everything from one place, including items that warehouse doesn't stock. Do this by hand, with the owner,
one order at a time.

## Easiest option first
If their dashboard offers it, the owner can **split the order in the Shiprocket dashboard** (Orders → the order →
Split, when available for their account) into one shipment per warehouse, then set each part's pickup address.
Re-run the automator afterwards, or book those parts in the dashboard.

## Doing it through the API (with care)
Only with the owner's go-ahead, and only with Shopify access for the real phone number.

1. **Check nothing already exists:** search Shiprocket by the exact order ID **and** every plausible suffix used before
   (`<id>-A`, `<id>-<warehouse>`), and look at the products and pincode, not just the ID. Earlier copies made by any
   process must be found first, or the customer gets two parcels.
2. For each warehouse's items: create a new order (`orders/create/adhoc`) with ID `<original id>-<warehouse>`,
   only those items, the customer's real address and phone from Shopify, and that warehouse as pickup.
   This is the only legitimate use of create-order: a NEW split. Never use it to edit an existing order.
3. Book each split with the normal rules (rated couriers first, no closed-day pickups), download and verify labels.
4. In Shopify, mark only those line items fulfilled (partial fulfillment, with tracking) so the customer gets the right
   tracking per parcel.
5. When every item has shipped, cancel the ORIGINAL Shiprocket order **without** syncing to the store
   (`cancel_on_channel: false`), so it's bookkeeping only and the customer is not told their order was cancelled. If any item
   still can't ship, leave the original alone as the record for it.
