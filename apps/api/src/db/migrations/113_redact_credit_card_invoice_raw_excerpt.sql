UPDATE credit_card_invoices
SET parse_metadata = COALESCE(parse_metadata, '{}'::jsonb) - 'rawExcerpt';
