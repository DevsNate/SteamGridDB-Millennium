import { useMemo, useState } from 'react';
import { DialogBody, DialogBodyText, DialogButton, DialogFooter, DialogHeader, Focusable, ModalRoot, TextField } from '@decky/ui';
import { libraryApps } from './library';
import { chooseMatch, useCollections } from './store';
import { keepColumn } from './nav';

const PAGE_SIZE = 20;

export function MatchDialog({ game, closeModal }: { game: { id: number; name: string }; closeModal?: () => void }) {
  const match = useCollections().draft.matches.get(game.id);
  const [term, setTerm] = useState(game.name);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = useMemo(() => {
    try {
      return { apps: libraryApps(), error: '' };
    } catch (failure) {
      return { apps: [], error: (failure as Error).message };
    }
  }, []);
  const isCandidate = (appid: number) => Boolean(match?.candidates.includes(appid));
  const apps = useMemo(() => {
    const query = term.trim().toLocaleLowerCase();
    return available.apps
      .filter(app => !query || app.display_name.toLocaleLowerCase().includes(query)
        || (term === game.name && isCandidate(app.appid)))
      .sort((a, b) => Number(isCandidate(b.appid)) - Number(isCandidate(a.appid)));
  }, [available, term, match]);

  const choose = async (appid: number | null) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await chooseMatch(game.id, appid);
      closeModal?.();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <ModalRoot className="sgdb-collection-dialog" closeModal={closeModal} onCancel={closeModal}>
      <DialogHeader>Match {game.name}</DialogHeader>
      <DialogBody className="sgdb-collection-scroll">
        <TextField
          label="Search Your Library"
          value={term}
          focusOnMount
          onChange={event => {
            setTerm(event.target.value);
            setVisible(PAGE_SIZE);
          }}
        />
        {(error || available.error) && <DialogBodyText role="alert">{error || available.error}</DialogBodyText>}
        <Focusable className="sgdb-collection-library-results" flow-children="column" aria-busy={busy}>
          {apps.slice(0, visible).map(app => (
            <DialogButton key={app.appid} disabled={busy} onClick={() => { void choose(app.appid); }}>
              {app.display_name}
              {app.BIsShortcut() && <span className="sgdb-collection-kind">Non-Steam shortcut</span>}
            </DialogButton>
          ))}
          {!apps.length && !available.error && <DialogBodyText>No library games match this search.</DialogBodyText>}
          {apps.length > visible && (
            <DialogButton disabled={busy} onClick={() => setVisible(count => count + PAGE_SIZE)}>Show More Games</DialogButton>
          )}
        </Focusable>
      </DialogBody>
      <DialogFooter>
        <Focusable className="sgdb-collection-actions" flow-children="row" {...keepColumn}>
          {match?.manual && (
            <DialogButton disabled={busy} onClick={() => { void choose(null); }}>Use Automatic Match</DialogButton>
          )}
          <DialogButton onClick={closeModal}>Cancel</DialogButton>
        </Focusable>
      </DialogFooter>
    </ModalRoot>
  );
}
