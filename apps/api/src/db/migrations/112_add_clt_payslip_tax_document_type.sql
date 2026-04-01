ALTER TABLE tax_documents
  DROP CONSTRAINT IF EXISTS tax_documents_document_type_check;

ALTER TABLE tax_documents
  ADD CONSTRAINT tax_documents_document_type_check CHECK (
    document_type IN (
      'unknown',
      'income_report_bank',
      'income_report_employer',
      'clt_payslip',
      'income_report_inss',
      'medical_statement',
      'education_receipt',
      'loan_statement',
      'bank_statement_support'
    )
  );
