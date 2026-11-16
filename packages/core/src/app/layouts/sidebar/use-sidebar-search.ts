import { useCallback, useState } from 'react';

export interface SidebarSearch {
  readonly open: boolean;
  readonly query: string;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onChange: (query: string) => void;
  readonly openResult: (sessionId: string) => void;
}

export function useSidebarSearch(openSession: (sessionId: string) => void): SidebarSearch {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);
  const onChange = useCallback((next: string) => setQuery(next), []);
  const openResult = useCallback(
    (sessionId: string) => {
      setOpen(false);
      setQuery('');
      openSession(sessionId);
    },
    [openSession],
  );

  return { open, query, onOpen, onClose, onChange, openResult };
}
