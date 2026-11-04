-- EXAMPLE ONLY. Replace table names and definitions with reviewed queries.
-- This file is reference text; uploading it does not execute SQL.
-- Question: Which three billing countries have the highest paid invoice revenue?
-- Definition: paid invoices only, all time, USD, before refunds.
SELECT c.country, SUM(i.amt) AS paid_invoice_revenue_usd
FROM public.txn_hdr AS i
JOIN public.customer AS c ON c.id = i.c_id
WHERE i.st = 'P'
GROUP BY c.country
ORDER BY paid_invoice_revenue_usd DESC
LIMIT 3;
