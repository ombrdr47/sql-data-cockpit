# Example only — replace with your actual schema and definitions
Do not include credentials, customer records, or confidential values.

## public.txn_hdr
Purpose: one row per invoice, not one row per line item.
- id: primary key, invoice identifier.
- c_id: customer identifier; joins to public.customer.id (many invoices to one customer).
- amt: invoice amount in USD, after discounts and before refunds.
- st: P = paid; V = void; D = draft.
- dt1: invoice issue timestamp in UTC.
- dt2: payment timestamp in UTC; null if unpaid.

## public.customer
Purpose: one row per customer.
- id: customer identifier, unique.
- country: billing country, not nationality.

Pitfall: joining invoices to line items can duplicate invoice amounts.
