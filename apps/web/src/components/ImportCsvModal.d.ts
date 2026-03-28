interface ImportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (result?: unknown) => Promise<void> | void;
  onOpenHistory?: (result?: unknown) => Promise<void> | void;
  onDataChanged?: (result?: unknown) => Promise<void> | void;
}

declare function ImportCsvModal(props: ImportCsvModalProps): JSX.Element;
export default ImportCsvModal;
