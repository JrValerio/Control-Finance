import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";

export type TaxUploadStage = "idle" | "uploading" | "processing" | "success" | "error";

interface TaxUploadModalProps {
  isOpen: boolean;
  taxYear: number;
  stage: TaxUploadStage;
  statusMessage?: string;
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (payload: {
    file: File;
    sourceLabel: string;
    sourceHint: string;
  }) => Promise<void> | void;
}

const TAX_DOCUMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".csv", ".png", ".jpg", ".jpeg"];
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "image/png",
  "image/jpeg",
  "image/jpg",
];
const ACCEPT_ATTRIBUTE = ".pdf,.csv,.png,.jpg,.jpeg,application/pdf,text/csv,image/png,image/jpeg";

const extractFileExtension = (fileName: string) => {
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex < 0) {
    return "";
  }

  return fileName.slice(lastDotIndex).toLowerCase();
};

const validateSelectedFile = (file: File | null) => {
  if (!file) {
    return "Selecione um arquivo fiscal para continuar.";
  }

  const extension = extractFileExtension(file.name);
  const mimeType = String(file.type || "").toLowerCase();
  const hasValidExtension = ACCEPTED_EXTENSIONS.includes(extension);
  const hasValidMimeType = ACCEPTED_MIME_TYPES.includes(mimeType);

  if (!hasValidExtension && !hasValidMimeType) {
    return "Arquivo inválido. Envie um PDF, CSV, PNG ou JPG.";
  }

  if (file.size <= 0) {
    return "O arquivo selecionado está vazio.";
  }

  if (file.size > TAX_DOCUMENT_MAX_FILE_SIZE_BYTES) {
    return "Arquivo muito grande. O limite é 10 MB.";
  }

  return "";
};

const TaxUploadModal = ({
  isOpen,
  taxYear,
  stage,
  statusMessage = "",
  errorMessage = "",
  onClose,
  onSubmit,
}: TaxUploadModalProps): JSX.Element | null => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceHint, setSourceHint] = useState("");
  const [localError, setLocalError] = useState("");

  const isBusy = stage === "uploading" || stage === "processing";
  const isSuccess = stage === "success";
  const helperText = useMemo(
    () => "Envie um PDF, CSV ou imagem do documento fiscal. O limite atual é de 10 MB.",
    [],
  );
  const displayStatusMessage = useMemo(() => {
    if (statusMessage.trim()) {
      return statusMessage;
    }

    if (stage === "uploading") {
      return "Enviando documento fiscal...";
    }

    if (stage === "processing") {
      return "Lendo o arquivo e preparando a revisão fiscal...";
    }

    if (stage === "success") {
      return "Documento enviado e processado.";
    }

    return "";
  }, [stage, statusMessage]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedFile(null);
    setSourceLabel("");
    setSourceHint("");
    setLocalError("");
  }, [isOpen]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isBusy) {
      onClose();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isBusy) {
      return;
    }

    const validationError = validateSelectedFile(selectedFile);

    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError("");
    await onSubmit({
      file: selectedFile as File,
      sourceLabel,
      sourceHint,
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-black/50 p-4 sm:p-6"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className="flex w-full max-w-lg max-h-[min(92vh,900px)] flex-col overflow-hidden rounded-lg border border-cf-border bg-cf-surface shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tax-upload-modal-title"
          data-testid="tax-upload-modal-shell"
        >
          <div className="flex items-start justify-between gap-4 border-b border-cf-border px-5 py-4">
            <div>
              <h2 id="tax-upload-modal-title" className="text-lg font-semibold text-cf-text-primary">
                Enviar documento fiscal
              </h2>
              <p className="mt-1 text-sm text-cf-text-secondary">
                Exercício {taxYear}. O arquivo entra na revisão fiscal sem você sair desta tela.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="text-sm font-semibold text-cf-text-secondary hover:text-cf-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Fechar
            </button>
          </div>

          {isSuccess ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-testid="tax-upload-modal-body">
                <div
                  className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
                  role="status"
                  aria-live="polite"
                >
                  {displayStatusMessage}
                </div>
              </div>
              <div className="flex justify-end border-t border-cf-border px-5 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-brand-1 bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2"
                >
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" data-testid="tax-upload-modal-body">
                <div className="rounded border border-cf-border bg-cf-bg-subtle px-3 py-3">
                  <p className="text-sm text-cf-text-primary">{helperText}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="tax-document-file" className="text-sm font-medium text-cf-text-primary">
                    Arquivo fiscal
                  </label>
                  <input
                    id="tax-document-file"
                    type="file"
                    accept={ACCEPT_ATTRIBUTE}
                    disabled={isBusy}
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      setSelectedFile(nextFile);
                      setLocalError(validateSelectedFile(nextFile));
                    }}
                    className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary file:mr-3 file:rounded file:border-0 file:bg-cf-bg-subtle file:px-3 file:py-2 file:text-sm file:font-semibold file:text-cf-text-primary"
                  />
                  {selectedFile ? (
                    <p className="text-xs text-cf-text-secondary">
                      {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="tax-document-source-label" className="text-sm font-medium text-cf-text-primary">
                    Fonte ou instituição
                  </label>
                  <input
                    id="tax-document-source-label"
                    type="text"
                    value={sourceLabel}
                    disabled={isBusy}
                    maxLength={120}
                    onChange={(event) => setSourceLabel(event.target.value)}
                    placeholder="Ex.: Banco Inter, ACME LTDA, INSS"
                    className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="tax-document-source-hint" className="text-sm font-medium text-cf-text-primary">
                    Observação
                  </label>
                  <input
                    id="tax-document-source-hint"
                    type="text"
                    value={sourceHint}
                    disabled={isBusy}
                    maxLength={200}
                    onChange={(event) => setSourceHint(event.target.value)}
                    placeholder="Ex.: Informe 2025, plano de saúde, recibo"
                    className="rounded border border-cf-border-input bg-cf-surface px-3 py-2 text-sm text-cf-text-primary outline-none focus:border-brand-1"
                  />
                </div>

                {stage === "uploading" || stage === "processing" ? (
                  <div
                    className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700"
                    role="status"
                    aria-live="polite"
                  >
                    {displayStatusMessage}
                  </div>
                ) : null}

                {!localError && errorMessage ? (
                  <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                    {errorMessage}
                  </div>
                ) : null}

                {localError ? (
                  <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                    {localError}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-cf-border px-5 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isBusy}
                  className="rounded border border-cf-border bg-cf-bg-subtle px-4 py-2 text-sm font-semibold text-cf-text-primary hover:bg-cf-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="rounded border border-brand-1 bg-brand-1 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {stage === "uploading"
                    ? "Enviando..."
                    : stage === "processing"
                      ? "Processando..."
                      : "Enviar e processar"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaxUploadModal;
