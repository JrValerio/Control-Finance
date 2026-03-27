interface ImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSessionReverted?: (sessionId?: string) => Promise<void> | void;
}

declare function ImportHistoryModal(props: ImportHistoryModalProps): JSX.Element;
export default ImportHistoryModal;
